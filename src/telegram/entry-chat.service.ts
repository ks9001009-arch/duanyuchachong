import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class EntryChatService {
  private readonly logger = new Logger(EntryChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /** 环境变量白名单或数据库已绑定且 active */
  async isEntryChat(chatId: bigint): Promise<boolean> {
    if (this.config.isEntryChat(chatId)) {
      return true;
    }
    const row = await this.prisma.boundEntryChat.findUnique({
      where: { chatId },
      select: { active: true },
    });
    return Boolean(row?.active);
  }

  async bind(params: {
    chatId: bigint;
    title?: string | null;
    operatorTelegramId: bigint;
    operatorUsername?: string | null;
    operatorDisplayName?: string | null;
  }) {
    const row = await this.prisma.boundEntryChat.upsert({
      where: { chatId: params.chatId },
      create: {
        chatId: params.chatId,
        title: params.title?.trim() || null,
        boundByTelegramId: params.operatorTelegramId,
        boundByUsername: params.operatorUsername ?? null,
        boundByDisplayName: params.operatorDisplayName ?? null,
        active: true,
        boundAt: new Date(),
        unboundAt: null,
      },
      update: {
        title: params.title?.trim() || null,
        boundByTelegramId: params.operatorTelegramId,
        boundByUsername: params.operatorUsername ?? null,
        boundByDisplayName: params.operatorDisplayName ?? null,
        active: true,
        boundAt: new Date(),
        unboundAt: null,
      },
    });
    this.logger.log(`已绑定数据群 chatId=${params.chatId.toString()}`);
    return row;
  }

  async unbind(chatId: bigint) {
    const existing = await this.prisma.boundEntryChat.findUnique({
      where: { chatId },
    });
    if (!existing) {
      return { kind: 'NOT_FOUND' as const };
    }
    if (!existing.active) {
      return { kind: 'ALREADY_INACTIVE' as const, row: existing };
    }
    const row = await this.prisma.boundEntryChat.update({
      where: { chatId },
      data: { active: false, unboundAt: new Date() },
    });
    this.logger.log(`已解绑数据群 chatId=${chatId.toString()}`);
    return { kind: 'UNBOUND' as const, row };
  }

  async getBinding(chatId: bigint) {
    return this.prisma.boundEntryChat.findUnique({ where: { chatId } });
  }
}
