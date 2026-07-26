import { Injectable, Logger } from '@nestjs/common';
import {
  CustomerImportResult,
  CustomerImportSource,
  PendingCustomerStatus,
  Prisma,
  TelegramCustomer,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CounterService } from '../counter/counter.service';
import {
  buildDisplayName,
  isMeaningfulText,
  normalizeUsername,
} from '../common/utils';
import { normalizePhone } from './group-lead-parse';
import {
  ArchiveSender,
  CheckAndImportInput,
  CreatePendingInput,
  IdentifiedProfileInput,
  ImportOutcome,
  ResolveOutcome,
  ResolvePendingInput,
} from './customer.types';

/** 从待确认 note 中提取「电话:xxx」 */
export function extractPhoneFromPendingNote(
  note?: string | null,
): string | null {
  if (!note) return null;
  const match = note.match(/电话原文:([^；;]+)|电话:([^；;]+)/);
  const raw = (match?.[1] || match?.[2] || '').trim() || null;
  if (!raw) return null;
  return normalizePhone(raw) ?? (raw.replace(/\s+/g, '') || null);
}

@Injectable()
export class CustomerRegistryService {
  private readonly logger = new Logger(CustomerRegistryService.name);
  private archiveSender: ArchiveSender | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly counter: CounterService,
  ) {}

  setArchiveSender(sender: ArchiveSender) {
    this.archiveSender = sender;
  }

  async checkAndImportIdentifiedCustomer(
    input: CheckAndImportInput,
  ): Promise<ImportOutcome> {
    const telegramId = input.profile.telegramId;
    if (typeof telegramId !== 'bigint') {
      throw new Error('telegramId 必须为 BigInt');
    }

    const existing = await this.prisma.telegramCustomer.findUnique({
      where: { telegramId },
    });

    if (existing) {
      const updated = await this.applyProfileUpdates(existing, input.profile);
      await this.writeImportLog({
        customerId: updated.customer.id,
        targetTelegramId: telegramId,
        operator: input.operator,
        source: input.source,
        result: updated.profileChanged
          ? CustomerImportResult.PROFILE_UPDATED
          : CustomerImportResult.DUPLICATE,
        sourceChatId: input.sourceChatId,
        sourceMessageId: input.sourceMessageId,
        archiveMessageLink: updated.customer.archiveMessageLink,
      });

      return {
        kind: 'DUPLICATE',
        customer: updated.customer,
        profileUpdated: updated.profileChanged,
      };
    }

    let customer: TelegramCustomer;
    try {
      customer = await this.prisma.$transaction(async (tx) => {
        const customerCode = await this.counter.nextCustomerCode(tx);
        const username = isMeaningfulText(input.profile.username)
          ? input.profile.username.trim().replace(/^@/, '')
          : null;
        const firstName = isMeaningfulText(input.profile.firstName)
          ? input.profile.firstName.trim()
          : null;
        const lastName = isMeaningfulText(input.profile.lastName)
          ? input.profile.lastName.trim()
          : null;
        const displayName =
          buildDisplayName(firstName, lastName) ||
          (isMeaningfulText(input.profile.displayName)
            ? input.profile.displayName.trim()
            : null);
        const phone = normalizePhone(input.profile.phone);

        return tx.telegramCustomer.create({
          data: {
            customerCode,
            telegramId,
            username,
            usernameNormalized: normalizeUsername(username),
            firstName,
            lastName,
            displayName,
            phone,
            phoneNormalized: phone,
            firstImportedById: input.operator.telegramId,
            firstImportedUsername: input.operator.username ?? null,
            firstImportedName: input.operator.displayName ?? null,
            firstImportSource: input.source,
          },
        });
      });
    } catch (error) {
      // 并发下唯一索引冲突：回退为查重，不产生第二条正式客户
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.telegramCustomer.findUnique({
          where: { telegramId },
        });
        if (raced) {
          const updated = await this.applyProfileUpdates(raced, input.profile);
          await this.writeImportLog({
            customerId: updated.customer.id,
            targetTelegramId: telegramId,
            operator: input.operator,
            source: input.source,
            result: updated.profileChanged
              ? CustomerImportResult.PROFILE_UPDATED
              : CustomerImportResult.DUPLICATE,
            sourceChatId: input.sourceChatId,
            sourceMessageId: input.sourceMessageId,
            archiveMessageLink: updated.customer.archiveMessageLink,
          });
          return {
            kind: 'DUPLICATE',
            customer: updated.customer,
            profileUpdated: updated.profileChanged,
          };
        }
      }
      // 兼容测试 mock 抛出的普通 Error + code
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        const raced = await this.prisma.telegramCustomer.findUnique({
          where: { telegramId },
        });
        if (raced) {
          const updated = await this.applyProfileUpdates(raced, input.profile);
          await this.writeImportLog({
            customerId: updated.customer.id,
            targetTelegramId: telegramId,
            operator: input.operator,
            source: input.source,
            result: CustomerImportResult.DUPLICATE,
            sourceChatId: input.sourceChatId,
            sourceMessageId: input.sourceMessageId,
            archiveMessageLink: updated.customer.archiveMessageLink,
          });
          return {
            kind: 'DUPLICATE',
            customer: updated.customer,
            profileUpdated: updated.profileChanged,
          };
        }
      }
      throw error;
    }

    const archive = await this.safeSendIdentifiedArchive(customer);
    let finalCustomer = customer;
    if (archive) {
      finalCustomer = await this.prisma.telegramCustomer.update({
        where: { id: customer.id },
        data: {
          archiveChatId: archive.chatId,
          archiveMessageId: archive.messageId,
          archiveMessageLink: archive.messageLink,
        },
      });
    }

    await this.writeImportLog({
      customerId: finalCustomer.id,
      targetTelegramId: telegramId,
      operator: input.operator,
      source: input.source,
      result: CustomerImportResult.CREATED,
      sourceChatId: input.sourceChatId,
      sourceMessageId: input.sourceMessageId,
      archiveMessageLink: finalCustomer.archiveMessageLink,
    });

    return {
      kind: 'CREATED',
      customer: finalCustomer,
      profileUpdated: false,
    };
  }

  async createPendingCustomer(input: CreatePendingInput) {
    const pending = await this.prisma.$transaction(async (tx) => {
      const pendingCode = await this.counter.nextPendingCode(tx);
      return tx.pendingTelegramCustomer.create({
        data: {
          pendingCode,
          visibleName: isMeaningfulText(input.visibleName)
            ? input.visibleName.trim()
            : null,
          visibleUsername: isMeaningfulText(input.visibleUsername)
            ? input.visibleUsername.trim().replace(/^@/, '')
            : null,
          note: input.note ?? null,
          failureReason: input.failureReason,
          operatorTelegramId: input.operator.telegramId,
          operatorUsername: input.operator.username ?? null,
          operatorDisplayName: input.operator.displayName ?? null,
          sourceChatId: input.sourceChatId ?? null,
          sourceMessageId: input.sourceMessageId ?? null,
        },
      });
    });

    const archive = await this.safeSendPendingArchive(pending);
    let finalPending = pending;
    if (archive) {
      finalPending = await this.prisma.pendingTelegramCustomer.update({
        where: { id: pending.id },
        data: {
          archiveChatId: archive.chatId,
          archiveMessageId: archive.messageId,
          archiveMessageLink: archive.messageLink,
        },
      });
    }

    await this.writeImportLog({
      customerId: null,
      targetTelegramId: null,
      operator: input.operator,
      source: input.source ?? CustomerImportSource.FORWARDED_MESSAGE,
      result: CustomerImportResult.PENDING_CREATED,
      sourceChatId: input.sourceChatId,
      sourceMessageId: input.sourceMessageId,
      archiveMessageLink: finalPending.archiveMessageLink,
      metadata: {
        pendingCode: finalPending.pendingCode,
        failureReason: finalPending.failureReason,
      },
      failureReason: finalPending.failureReason,
    });

    return finalPending;
  }

  /**
   * 群聊软查重：按用户名/昵称/电话匹配正式客户与待确认（非 Telegram ID 精准）。
   */
  async softDedupSearch(input: {
    username?: string | null;
    nickname?: string | null;
    phone?: string | null;
    keyword?: string | null;
  }) {
    const usernameNormalized = normalizeUsername(input.username ?? undefined);
    const nickname = input.nickname?.trim() || null;
    const phone = normalizePhone(input.phone) || input.phone?.replace(/\D/g, '') || null;
    const keyword = input.keyword?.trim() || null;

    const customerOr: Prisma.TelegramCustomerWhereInput[] = [];
    if (usernameNormalized) {
      customerOr.push({ usernameNormalized });
      customerOr.push({ usernameNormalized: { startsWith: usernameNormalized } });
    }
    if (nickname) {
      customerOr.push({
        displayName: { contains: nickname, mode: 'insensitive' },
      });
    }
    if (phone && phone.length >= 6) {
      customerOr.push({ phoneNormalized: phone });
      customerOr.push({ phoneNormalized: { contains: phone } });
      customerOr.push({ phone: { contains: phone } });
    }
    if (keyword) {
      const kwUser = normalizeUsername(keyword);
      if (kwUser) {
        customerOr.push({ usernameNormalized: kwUser });
        customerOr.push({
          usernameNormalized: { startsWith: kwUser },
        });
      }
      customerOr.push({
        displayName: { contains: keyword.replace(/^@/, ''), mode: 'insensitive' },
      });
    }

    const customers =
      customerOr.length > 0
        ? await this.prisma.telegramCustomer.findMany({
            where: { OR: customerOr },
            take: 15,
            orderBy: { lastObservedAt: 'desc' },
          })
        : [];

    const pendingOr: Prisma.PendingTelegramCustomerWhereInput[] = [];
    if (usernameNormalized) {
      pendingOr.push({
        visibleUsername: { equals: usernameNormalized, mode: 'insensitive' },
      });
      pendingOr.push({
        visibleUsername: { contains: usernameNormalized, mode: 'insensitive' },
      });
    }
    if (nickname) {
      pendingOr.push({
        visibleName: { contains: nickname, mode: 'insensitive' },
      });
    }
    if (phone && phone.length >= 6) {
      pendingOr.push({ note: { contains: phone } });
    }
    if (keyword) {
      const kw = keyword.replace(/^@/, '');
      pendingOr.push({
        visibleUsername: { contains: kw, mode: 'insensitive' },
      });
      pendingOr.push({
        visibleName: { contains: kw, mode: 'insensitive' },
      });
      pendingOr.push({ note: { contains: kw } });
    }

    const pendings =
      pendingOr.length > 0
        ? await this.prisma.pendingTelegramCustomer.findMany({
            where: {
              status: PendingCustomerStatus.PENDING_ID,
              OR: pendingOr,
            },
            take: 15,
            orderBy: { createdAt: 'desc' },
          })
        : [];

    return { customers, pendings };
  }

  async resolvePendingCustomer(
    input: ResolvePendingInput,
  ): Promise<ResolveOutcome> {
    const pending = await this.prisma.pendingTelegramCustomer.findUnique({
      where: { pendingCode: input.pendingCode.toUpperCase() },
    });

    if (!pending) {
      throw new Error(`待确认记录不存在: ${input.pendingCode}`);
    }

    if (pending.status !== PendingCustomerStatus.PENDING_ID) {
      throw new Error(
        `待确认记录状态为 ${pending.status}，无法重复处理`,
      );
    }

    const telegramId = input.telegramId;
    if (typeof telegramId !== 'bigint') {
      throw new Error('telegramId 必须为 BigInt');
    }

    const existing = await this.prisma.telegramCustomer.findUnique({
      where: { telegramId },
    });

    const phoneFromPending = extractPhoneFromPendingNote(pending.note);

    if (existing) {
      const synced = await this.applyProfileUpdates(existing, {
        telegramId,
        username: input.profile?.username ?? pending.visibleUsername,
        firstName: input.profile?.firstName ?? pending.visibleName,
        lastName: input.profile?.lastName ?? null,
        displayName: input.profile?.displayName ?? pending.visibleName,
        phone: input.profile?.phone ?? phoneFromPending,
      });

      const merged = await this.prisma.pendingTelegramCustomer.update({
        where: { id: pending.id },
        data: {
          status: PendingCustomerStatus.MERGED,
          resolvedCustomerId: synced.customer.id,
          resolvedByTelegramId: input.operator.telegramId,
          resolvedAt: new Date(),
        },
      });

      await this.writeImportLog({
        customerId: synced.customer.id,
        targetTelegramId: telegramId,
        operator: input.operator,
        source: CustomerImportSource.PENDING_RESOLUTION,
        result: CustomerImportResult.PENDING_MERGED,
        archiveMessageLink: synced.customer.archiveMessageLink,
        metadata: {
          pendingCode: pending.pendingCode,
          profileUpdated: synced.profileChanged,
          ...(input.metadata ?? {}),
        } as Prisma.InputJsonValue,
      });

      await this.safeReplyPendingResolved({
        pending: merged,
        customer: synced.customer,
        operator: input.operator,
      });

      return { kind: 'MERGED', pending: merged, customer: synced.customer };
    }

    const profile = input.profile ?? {
      telegramId,
      username: pending.visibleUsername,
      firstName: pending.visibleName,
      lastName: null,
      displayName: pending.visibleName,
      phone: phoneFromPending,
    };
    if (!profile.phone && phoneFromPending) {
      profile.phone = phoneFromPending;
    }

    const created = await this.checkAndImportIdentifiedCustomer({
      profile: {
        ...profile,
        telegramId,
      },
      operator: input.operator,
      source: CustomerImportSource.PENDING_RESOLUTION,
    });

    const resolved = await this.prisma.pendingTelegramCustomer.update({
      where: { id: pending.id },
      data: {
        status: PendingCustomerStatus.RESOLVED,
        resolvedCustomerId: created.customer.id,
        resolvedByTelegramId: input.operator.telegramId,
        resolvedAt: new Date(),
      },
    });

    await this.writeImportLog({
      customerId: created.customer.id,
      targetTelegramId: telegramId,
      operator: input.operator,
      source: CustomerImportSource.PENDING_RESOLUTION,
      result: CustomerImportResult.PENDING_RESOLVED,
      archiveMessageLink: created.customer.archiveMessageLink,
      metadata: {
        pendingCode: pending.pendingCode,
        ...(input.metadata ?? {}),
      } as Prisma.InputJsonValue,
    });

    await this.safeReplyPendingResolved({
      pending: resolved,
      customer: created.customer,
      operator: input.operator,
    });

    return { kind: 'RESOLVED', pending: resolved, customer: created.customer };
  }

  async findByTelegramId(telegramId: bigint) {
    return this.prisma.telegramCustomer.findUnique({
      where: { telegramId },
    });
  }

  async findByPendingCode(pendingCode: string) {
    return this.prisma.pendingTelegramCustomer.findUnique({
      where: { pendingCode: pendingCode.toUpperCase() },
      include: { resolvedCustomer: true },
    });
  }

  async searchByUsername(username: string) {
    const normalized = normalizeUsername(username);
    if (!normalized) return [];
    return this.prisma.telegramCustomer.findMany({
      where: {
        OR: [
          { usernameNormalized: normalized },
          { usernameNormalized: { startsWith: normalized } },
        ],
      },
      take: 20,
      orderBy: { firstImportedAt: 'desc' },
    });
  }

  async searchByDisplayName(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return [];
    return this.prisma.telegramCustomer.findMany({
      where: {
        displayName: { contains: trimmed, mode: 'insensitive' },
      },
      take: 20,
      orderBy: { firstImportedAt: 'desc' },
    });
  }

  async listPending(limit = 20) {
    return this.prisma.pendingTelegramCustomer.findMany({
      where: { status: PendingCustomerStatus.PENDING_ID },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * 静默同步已存在客户的资料（不写导入日志、不新建客户）。
   * 用于消息见人更新、定时 getChat 扫描。
   */
  async syncObservedProfile(
    profile: IdentifiedProfileInput,
    options?: { allowClearUsername?: boolean },
  ): Promise<{ updated: boolean; customer: TelegramCustomer | null }> {
    if (typeof profile.telegramId !== 'bigint') {
      throw new Error('telegramId 必须为 BigInt');
    }
    const existing = await this.prisma.telegramCustomer.findUnique({
      where: { telegramId: profile.telegramId },
    });
    if (!existing) {
      return { updated: false, customer: null };
    }
    const result = await this.applyProfileUpdates(existing, profile, options);
    return { updated: result.profileChanged, customer: result.customer };
  }

  /** 供定时扫描：优先同步最久未观察的正式客户 */
  async listCustomersForSync(limit = 200) {
    return this.prisma.telegramCustomer.findMany({
      orderBy: { lastObservedAt: 'asc' },
      take: limit,
      select: {
        id: true,
        telegramId: true,
        username: true,
        firstName: true,
        lastName: true,
        displayName: true,
        phone: true,
        lastObservedAt: true,
      },
    });
  }

  async writeInvalidLog(params: {
    operator: { telegramId: bigint; username?: string | null; displayName?: string | null };
    source: CustomerImportSource;
    result: CustomerImportResult;
    failureReason?: string;
    sourceChatId?: bigint | null;
    sourceMessageId?: bigint | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    await this.writeImportLog({
      customerId: null,
      targetTelegramId: null,
      operator: params.operator,
      source: params.source,
      result: params.result,
      sourceChatId: params.sourceChatId,
      sourceMessageId: params.sourceMessageId,
      failureReason: params.failureReason,
      metadata: params.metadata,
    });
  }

  private async applyProfileUpdates(
    existing: TelegramCustomer,
    profile: IdentifiedProfileInput,
    options?: { allowClearUsername?: boolean },
  ): Promise<{ customer: TelegramCustomer; profileChanged: boolean }> {
    const data: Prisma.TelegramCustomerUpdateInput = {
      lastObservedAt: new Date(),
    };
    let changed = false;

    if (isMeaningfulText(profile.username)) {
      const username = profile.username.trim().replace(/^@/, '');
      if (username !== existing.username) {
        data.username = username;
        data.usernameNormalized = normalizeUsername(username);
        changed = true;
      }
    } else if (options?.allowClearUsername && existing.username) {
      data.username = null;
      data.usernameNormalized = null;
      changed = true;
    }

    if (isMeaningfulText(profile.firstName) && profile.firstName.trim() !== existing.firstName) {
      data.firstName = profile.firstName.trim();
      changed = true;
    }

    if (isMeaningfulText(profile.lastName) && profile.lastName.trim() !== existing.lastName) {
      data.lastName = profile.lastName.trim();
      changed = true;
    }

    const nextFirst =
      typeof data.firstName === 'string'
        ? data.firstName
        : existing.firstName;
    const nextLast =
      typeof data.lastName === 'string' ? data.lastName : existing.lastName;
    const builtDisplay = buildDisplayName(nextFirst, nextLast);
    if (builtDisplay && builtDisplay !== existing.displayName) {
      data.displayName = builtDisplay;
      changed = true;
    } else if (
      isMeaningfulText(profile.displayName) &&
      profile.displayName.trim() !== existing.displayName
    ) {
      data.displayName = profile.displayName.trim();
      changed = true;
    }

    const phone = normalizePhone(profile.phone);
    if (phone && phone !== existing.phoneNormalized && phone !== existing.phone) {
      data.phone = phone;
      data.phoneNormalized = phone;
      changed = true;
    }

    if (!changed) {
      const touched = await this.prisma.telegramCustomer.update({
        where: { id: existing.id },
        data: { lastObservedAt: new Date() },
      });
      return { customer: touched, profileChanged: false };
    }

    const customer = await this.prisma.telegramCustomer.update({
      where: { id: existing.id },
      data,
    });
    return { customer, profileChanged: true };
  }

  private async writeImportLog(params: {
    customerId: string | null;
    targetTelegramId: bigint | null;
    operator: CheckAndImportInput['operator'];
    source: CustomerImportSource;
    result: CustomerImportResult;
    sourceChatId?: bigint | null;
    sourceMessageId?: bigint | null;
    archiveMessageLink?: string | null;
    metadata?: Prisma.InputJsonValue;
    failureReason?: string | null;
  }) {
    await this.prisma.telegramCustomerImportLog.create({
      data: {
        customerId: params.customerId,
        targetTelegramId: params.targetTelegramId,
        operatorTelegramId: params.operator.telegramId,
        operatorUsername: params.operator.username ?? null,
        operatorDisplayName: params.operator.displayName ?? null,
        source: params.source,
        result: params.result,
        sourceChatId: params.sourceChatId ?? null,
        sourceMessageId: params.sourceMessageId ?? null,
        archiveMessageLink: params.archiveMessageLink ?? null,
        metadata: params.metadata,
        failureReason: params.failureReason ?? null,
      },
    });
  }

  private async safeSendIdentifiedArchive(customer: TelegramCustomer) {
    if (!this.archiveSender) return null;
    try {
      return await this.archiveSender.sendIdentifiedArchive(customer);
    } catch (error) {
      this.logger.warn(`发送正式客户存档失败: ${String(error)}`);
      return null;
    }
  }

  private async safeSendPendingArchive(
    pending: Awaited<ReturnType<CustomerRegistryService['createPendingCustomer']>>,
  ) {
    if (!this.archiveSender) return null;
    try {
      return await this.archiveSender.sendPendingArchive(pending);
    } catch (error) {
      this.logger.warn(`发送待确认存档失败: ${String(error)}`);
      return null;
    }
  }

  private async safeReplyPendingResolved(params: {
    pending: { archiveChatId: bigint | null; archiveMessageId: bigint | null };
    customer: TelegramCustomer;
    operator: CheckAndImportInput['operator'];
  }) {
    if (!this.archiveSender) return;
    if (!params.pending.archiveChatId || !params.pending.archiveMessageId) return;
    try {
      await this.archiveSender.replyPendingResolved({
        archiveChatId: params.pending.archiveChatId,
        archiveMessageId: params.pending.archiveMessageId,
        telegramId: params.customer.telegramId,
        customerCode: params.customer.customerCode,
        operatorName: params.operator.displayName ?? params.operator.username ?? String(params.operator.telegramId),
        resolvedAt: new Date(),
      });
    } catch (error) {
      this.logger.warn(`回复待确认存档失败: ${String(error)}`);
    }
  }
}
