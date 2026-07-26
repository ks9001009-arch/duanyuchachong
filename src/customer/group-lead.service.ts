import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GroupLead, TelegramCustomer } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CounterService } from '../counter/counter.service';
import { buildTelegramMessageLink, normalizeUsername } from '../common/utils';
import {
  leadHasContent,
  normalizePhone,
  type ParsedLeadInput,
} from './group-lead-parse';

export type LeadOperator = {
  telegramId: bigint;
  username?: string | null;
  displayName?: string | null;
};

export type SoftMatchResult = {
  customers: TelegramCustomer[];
  leads: GroupLead[];
};

export type CreateLeadParams = {
  input: ParsedLeadInput;
  operator: LeadOperator;
  sourceChatId?: bigint | null;
  sourceMessageId?: bigint | null;
};

export type GroupLeadArchiveSender = {
  sendLeadArchive(lead: GroupLead): Promise<{
    chatId: bigint;
    messageId: bigint;
    link: string | null;
  } | null>;
};

@Injectable()
export class GroupLeadService {
  private readonly logger = new Logger(GroupLeadService.name);
  private archiveSender: GroupLeadArchiveSender | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly counters: CounterService,
  ) {}

  setArchiveSender(sender: GroupLeadArchiveSender) {
    this.archiveSender = sender;
  }

  async softMatch(input: ParsedLeadInput): Promise<SoftMatchResult> {
    const usernameNormalized = normalizeUsername(input.username);
    const phoneNormalized = normalizePhone(input.phone);
    const nickname = input.nickname?.trim() || null;

    const customerOr: Array<Record<string, unknown>> = [];
    if (usernameNormalized) {
      customerOr.push({ usernameNormalized });
    }
    if (nickname) {
      customerOr.push({
        displayName: { contains: nickname, mode: 'insensitive' },
      });
      customerOr.push({
        firstName: { contains: nickname, mode: 'insensitive' },
      });
    }

    const customers =
      customerOr.length > 0
        ? await this.prisma.telegramCustomer.findMany({
            where: { OR: customerOr },
            orderBy: { lastObservedAt: 'desc' },
            take: 10,
          })
        : [];

    const leadOr: Array<Record<string, unknown>> = [];
    if (usernameNormalized) {
      leadOr.push({ usernameNormalized });
    }
    if (phoneNormalized) {
      leadOr.push({ phoneNormalized });
    }
    if (nickname) {
      leadOr.push({
        nickname: { contains: nickname, mode: 'insensitive' },
      });
    }

    const leads =
      leadOr.length > 0
        ? await this.prisma.groupLead.findMany({
            where: { OR: leadOr },
            orderBy: { createdAt: 'desc' },
            take: 10,
          })
        : [];

    return { customers, leads };
  }

  async search(keyword: string): Promise<SoftMatchResult> {
    const kw = keyword.trim();
    if (!kw) {
      return { customers: [], leads: [] };
    }

    const asUsername = normalizeUsername(kw);
    const asPhone = normalizePhone(kw);

    return this.softMatch({
      username: asUsername ?? undefined,
      nickname: !asPhone && kw.length > 0 ? kw.replace(/^@/, '') : undefined,
      phone: asPhone ?? undefined,
    });
  }

  async createLead(params: CreateLeadParams): Promise<{
    lead: GroupLead;
    softMatches: SoftMatchResult;
  }> {
    const { input, operator } = params;
    if (!leadHasContent(input)) {
      throw new BadRequestException(
        '请至少提供用户名、昵称、电话或需求中的一项',
      );
    }

    const usernameNormalized = normalizeUsername(input.username);
    const phoneNormalized = normalizePhone(input.phone);
    const nickname = input.nickname?.trim() || null;
    const requirement = input.requirement?.trim() || null;
    const username = usernameNormalized
      ? input.username!.replace(/^@+/, '').trim()
      : null;

    const softMatches = await this.softMatch({
      username: username ?? undefined,
      nickname: nickname ?? undefined,
      phone: input.phone,
    });

    const matchedCustomerId = softMatches.customers[0]?.id ?? null;
    const leadCode = await this.counters.nextLeadCode();

    let lead = await this.prisma.groupLead.create({
      data: {
        leadCode,
        username,
        usernameNormalized,
        nickname,
        phone: input.phone?.trim() || null,
        phoneNormalized,
        requirement,
        operatorTelegramId: operator.telegramId,
        operatorUsername: operator.username ?? null,
        operatorDisplayName: operator.displayName ?? null,
        sourceChatId: params.sourceChatId ?? null,
        sourceMessageId: params.sourceMessageId ?? null,
        matchedCustomerId,
      },
    });

    if (this.archiveSender) {
      try {
        const archived = await this.archiveSender.sendLeadArchive(lead);
        if (archived) {
          lead = await this.prisma.groupLead.update({
            where: { id: lead.id },
            data: {
              archiveChatId: archived.chatId,
              archiveMessageId: archived.messageId,
              archiveMessageLink:
                archived.link ??
                buildTelegramMessageLink({
                  chatId: archived.chatId,
                  messageId: archived.messageId,
                }),
            },
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`群线索存档失败 lead=${lead.leadCode}: ${message}`);
      }
    }

    return { lead, softMatches };
  }
}
