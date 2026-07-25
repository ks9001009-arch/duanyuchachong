import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  get nodeEnv(): string {
    return this.config.get<string>('NODE_ENV') ?? 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

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

  get appTimezone(): string {
    return this.config.get<string>('APP_TIMEZONE') ?? 'Asia/Yangon';
  }

  get adminInitialUsername(): string {
    return this.config.get<string>('ADMIN_INITIAL_USERNAME')?.trim() || 'admin';
  }

  get adminInitialPassword(): string {
    const password = this.config.get<string>('ADMIN_INITIAL_PASSWORD');
    if (!password) {
      throw new Error('缺少环境变量 ADMIN_INITIAL_PASSWORD');
    }
    return password;
  }

  get adminJwtSecret(): string {
    const secret = this.config.get<string>('ADMIN_JWT_SECRET');
    if (!secret) {
      throw new Error('缺少环境变量 ADMIN_JWT_SECRET');
    }
    return secret;
  }

  get adminJwtExpiresIn(): string {
    return this.config.get<string>('ADMIN_JWT_EXPIRES_IN') ?? '8h';
  }

  /** 后台操作写入导入日志/resolve 时使用的系统操作者 Telegram ID（必须 > 0） */
  get adminSystemOperatorTelegramId(): bigint {
    const raw = this.config
      .get<string>('ADMIN_SYSTEM_OPERATOR_TELEGRAM_ID')
      ?.trim();
    if (!raw || !/^\d+$/.test(raw)) {
      throw new Error(
        '缺少或非法环境变量 ADMIN_SYSTEM_OPERATOR_TELEGRAM_ID（须为正整数字符串）',
      );
    }
    const id = BigInt(raw);
    if (id <= 0n) {
      throw new Error('ADMIN_SYSTEM_OPERATOR_TELEGRAM_ID 必须大于 0');
    }
    return id;
  }

  get adminCorsOrigins(): string[] {
    const raw =
      this.config.get<string>('ADMIN_CORS_ORIGINS') ??
      'http://localhost:5173,https://duan-yu.com,https://www.duan-yu.com';
    const list = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!list.includes('http://localhost:5173')) {
      list.push('http://localhost:5173');
    }
    return list;
  }

  get enableSwagger(): boolean {
    const raw = this.config.get<string>('ENABLE_SWAGGER');
    if (raw == null || raw === '') {
      return !this.isProduction;
    }
    return raw === 'true' || raw === '1';
  }

  /** 启动时校验后台必要密钥；绝不记录明文 */
  assertAdminSecretsConfigured(): void {
    const password = this.config.get<string>('ADMIN_INITIAL_PASSWORD');
    const secret = this.config.get<string>('ADMIN_JWT_SECRET');
    if (!password || !secret) {
      throw new Error(
        '缺少必要环境变量 ADMIN_INITIAL_PASSWORD 或 ADMIN_JWT_SECRET，应用无法启动',
      );
    }
    if (this.isProduction && (password.length < 8 || secret.length < 16)) {
      throw new Error(
        '生产环境要求 ADMIN_INITIAL_PASSWORD 至少 8 位，ADMIN_JWT_SECRET 至少 16 位',
      );
    }
    // 校验系统操作者 ID（getter 内含规则）
    void this.adminSystemOperatorTelegramId;
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
