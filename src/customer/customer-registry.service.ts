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
import {
  ArchiveSender,
  CheckAndImportInput,
  CreatePendingInput,
  ImportOutcome,
  ResolveOutcome,
  ResolvePendingInput,
} from './customer.types';

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
        const displayName = buildDisplayName(firstName, lastName);

        return tx.telegramCustomer.create({
          data: {
            customerCode,
            telegramId,
            username,
            usernameNormalized: normalizeUsername(username),
            firstName,
            lastName,
            displayName,
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
      source: CustomerImportSource.FORWARDED_MESSAGE,
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

    if (existing) {
      const merged = await this.prisma.pendingTelegramCustomer.update({
        where: { id: pending.id },
        data: {
          status: PendingCustomerStatus.MERGED,
          resolvedCustomerId: existing.id,
          resolvedByTelegramId: input.operator.telegramId,
          resolvedAt: new Date(),
        },
      });

      await this.writeImportLog({
        customerId: existing.id,
        targetTelegramId: telegramId,
        operator: input.operator,
        source: CustomerImportSource.PENDING_RESOLUTION,
        result: CustomerImportResult.PENDING_MERGED,
        archiveMessageLink: existing.archiveMessageLink,
        metadata: { pendingCode: pending.pendingCode },
      });

      await this.safeReplyPendingResolved({
        pending: merged,
        customer: existing,
        operator: input.operator,
      });

      return { kind: 'MERGED', pending: merged, customer: existing };
    }

    const profile = input.profile ?? {
      telegramId,
      username: pending.visibleUsername,
      firstName: pending.visibleName,
      lastName: null,
    };

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
      metadata: { pendingCode: pending.pendingCode },
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
    profile: CheckAndImportInput['profile'],
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
    const nextDisplay = buildDisplayName(nextFirst, nextLast);
    if (nextDisplay && nextDisplay !== existing.displayName) {
      data.displayName = nextDisplay;
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
