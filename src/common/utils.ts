/**
 * 生成 Telegram 消息链接。
 * 私聊消息不能生成跨账号通用链接，返回 null。
 * 私有超级群：https://t.me/c/{内部群ID}/{messageId}
 * 公开群：https://t.me/{chatUsername}/{messageId}
 */
export function buildTelegramMessageLink(params: {
  chatId: bigint | number | string | null | undefined;
  messageId: bigint | number | string | null | undefined;
  chatUsername?: string | null;
  chatType?: string | null;
}): string | null {
  const { chatId, messageId, chatUsername, chatType } = params;

  if (chatId == null || messageId == null) {
    return null;
  }

  if (chatType === 'private') {
    return null;
  }

  let chatIdStr: string;
  try {
    chatIdStr = typeof chatId === 'bigint' ? chatId.toString() : String(chatId);
  } catch {
    return null;
  }

  if (!/^-?\d+$/.test(chatIdStr)) {
    return null;
  }

  let messageIdNum: number;
  try {
    messageIdNum =
      typeof messageId === 'bigint' ? Number(messageId) : Number(messageId);
  } catch {
    return null;
  }

  if (!Number.isFinite(messageIdNum) || messageIdNum <= 0) {
    return null;
  }

  const username = chatUsername?.replace(/^@/, '').trim();
  if (username) {
    return `https://t.me/${username}/${messageIdNum}`;
  }

  // 私有超级群 / 频道：-100xxxxxxxxxx → 去掉 -100 前缀
  if (chatIdStr.startsWith('-100')) {
    const internalId = chatIdStr.slice(4);
    if (!internalId || !/^\d+$/.test(internalId)) {
      return null;
    }
    return `https://t.me/c/${internalId}/${messageIdNum}`;
  }

  // 普通群负 ID 无法稳定生成 t.me/c 链接
  return null;
}

export function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function buildDisplayName(
  firstName?: string | null,
  lastName?: string | null,
): string | null {
  const parts = [firstName, lastName].filter(
    (p): p is string => typeof p === 'string' && p.trim().length > 0,
  );
  if (parts.length === 0) return null;
  return parts.join(' ').trim();
}

export function normalizeUsername(username?: string | null): string | null {
  if (!username) return null;
  const cleaned = username.replace(/^@/, '').trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
}

export function isMeaningfulText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function formatCode(prefix: 'C' | 'P', value: bigint): string {
  return `${prefix}${value.toString().padStart(6, '0')}`;
}

export function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    USER_PICKER_SINGLE: '联系人选择',
    USER_PICKER_BATCH: '批量联系人选择',
    FORWARDED_MESSAGE: '转发消息',
    MANUAL_ID: '手动录入',
    PENDING_RESOLUTION: '待确认身份补充',
  };
  return map[source] ?? source;
}

export function failureReasonLabel(reason: string): string {
  const map: Record<string, string> = {
    HIDDEN_FORWARD_ORIGIN: '客户隐藏了转发来源',
    ID_NOT_AVAILABLE: '无法获得 Telegram ID',
    MANUAL_PENDING: '手动创建待确认',
  };
  return map[reason] ?? reason;
}

/**
 * 存档链接在正文中的纯文本展示。
 * 不生成 Markdown/HTML；有链接时由调用方附加 inline URL 按钮，
 * 或在必须使用回复键盘时直接输出明文 URL。
 */
export function archiveLinkText(
  link: string | null | undefined,
  mode: 'hint' | 'url' = 'hint',
): string {
  if (!link) return '暂无';
  if (mode === 'url') return link;
  return '见下方按钮';
}
