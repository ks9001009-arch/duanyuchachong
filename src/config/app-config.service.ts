import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  get botToken(): string {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('缺少环境变量 TELEGRAM_BOT_TOKEN');
    }
    return token;
  }

  get operatorIds(): bigint[] {
    const raw = this.config.get<string>('TELEGRAM_OPERATOR_IDS') ?? '';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => BigInt(s));
  }

  get entryChatIds(): bigint[] {
    const raw = this.config.get<string>('TELEGRAM_ENTRY_CHAT_IDS') ?? '';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => BigInt(s));
  }

  get archiveChatId(): bigint {
    const raw = this.config.get<string>('TELEGRAM_ARCHIVE_CHAT_ID');
    if (!raw) {
      throw new Error('缺少环境变量 TELEGRAM_ARCHIVE_CHAT_ID');
    }
    return BigInt(raw);
  }

  isOperator(telegramId: bigint | number | string): boolean {
    const id = typeof telegramId === 'bigint' ? telegramId : BigInt(telegramId);
    return this.operatorIds.some((op) => op === id);
  }

  isEntryChat(chatId: bigint | number | string): boolean {
    const id = typeof chatId === 'bigint' ? chatId : BigInt(chatId);
    return this.entryChatIds.some((c) => c === id);
  }
}
