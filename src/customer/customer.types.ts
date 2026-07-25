import {
  CustomerImportSource,
  PendingFailureReason,
  TelegramCustomer,
  PendingTelegramCustomer,
} from '@prisma/client';

export interface OperatorInfo {
  telegramId: bigint;
  username?: string | null;
  displayName?: string | null;
}

export interface IdentifiedProfileInput {
  telegramId: bigint;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface CheckAndImportInput {
  profile: IdentifiedProfileInput;
  operator: OperatorInfo;
  source: CustomerImportSource;
  sourceChatId?: bigint | null;
  sourceMessageId?: bigint | null;
}

export type ImportOutcome =
  | {
      kind: 'CREATED';
      customer: TelegramCustomer;
      profileUpdated: boolean;
    }
  | {
      kind: 'DUPLICATE';
      customer: TelegramCustomer;
      profileUpdated: boolean;
    };

export interface CreatePendingInput {
  visibleName?: string | null;
  visibleUsername?: string | null;
  note?: string | null;
  failureReason: PendingFailureReason;
  operator: OperatorInfo;
  sourceChatId?: bigint | null;
  sourceMessageId?: bigint | null;
}

export interface ResolvePendingInput {
  pendingCode: string;
  telegramId: bigint;
  operator: OperatorInfo;
  profile?: IdentifiedProfileInput;
}

export type ResolveOutcome =
  | {
      kind: 'RESOLVED';
      pending: PendingTelegramCustomer;
      customer: TelegramCustomer;
    }
  | {
      kind: 'MERGED';
      pending: PendingTelegramCustomer;
      customer: TelegramCustomer;
    };

/** 由 Telegram 层注入，用于发送存档卡片；失败不得阻断主流程写入 */
export interface ArchiveSender {
  sendIdentifiedArchive(customer: TelegramCustomer): Promise<{
    chatId: bigint;
    messageId: bigint;
    messageLink: string | null;
  } | null>;

  sendPendingArchive(pending: PendingTelegramCustomer): Promise<{
    chatId: bigint;
    messageId: bigint;
    messageLink: string | null;
  } | null>;

  replyPendingResolved(params: {
    archiveChatId: bigint;
    archiveMessageId: bigint;
    telegramId: bigint;
    customerCode: string;
    operatorName: string;
    resolvedAt: Date;
  }): Promise<void>;
}
