import { normalizeUsername } from '../common/utils';

export type ParsedLeadInput = {
  username?: string;
  nickname?: string;
  phone?: string;
  requirement?: string;
};

/** 规范化电话：仅保留数字与开头的 + */
export function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 6) return null;
  return hasPlus ? `+${digits}` : digits;
}

/**
 * 解析 /记 正文（多行键值或宽松单行）。
 * 支持：用户名/username、昵称/nickname/姓名、电话/手机/phone、需求/备注/requirement
 */
export function parseLeadText(raw: string): ParsedLeadInput {
  const text = raw.replace(/^\s*\/记(@\w+)?\s*/u, '').trim();
  if (!text) return {};

  const result: ParsedLeadInput = {};
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const applyKv = (key: string, value: string) => {
    const v = value.trim();
    if (!v) return;
    const k = key.toLowerCase();
    if (
      k === '用户名' ||
      k === 'username' ||
      k === 'tg' ||
      k === 'telegram'
    ) {
      result.username = v.replace(/^@+/, '');
    } else if (
      k === '昵称' ||
      k === 'nickname' ||
      k === '姓名' ||
      k === '名字' ||
      k === 'name'
    ) {
      result.nickname = v;
    } else if (
      k === '电话' ||
      k === '手机' ||
      k === '手机号' ||
      k === 'phone' ||
      k === 'tel'
    ) {
      result.phone = v;
    } else if (
      k === '需求' ||
      k === '备注' ||
      k === '说明' ||
      k === 'requirement' ||
      k === 'note'
    ) {
      result.requirement = v;
    }
  };

  let matchedKv = false;
  for (const line of lines) {
    const m = line.match(/^([^:：]{1,20})\s*[:：]\s*(.+)$/);
    if (m) {
      matchedKv = true;
      applyKv(m[1].trim(), m[2].trim());
    }
  }

  if (matchedKv) {
    return result;
  }

  // 宽松：提取 @username、电话，其余作昵称/需求
  const atMatch = text.match(/@([A-Za-z0-9_]{4,})/);
  if (atMatch) {
    result.username = atMatch[1];
  }

  const phoneMatch = text.match(
    /(\+?\d[\d\s\-()]{5,}\d)/,
  );
  if (phoneMatch) {
    result.phone = phoneMatch[1];
  }

  let rest = text;
  if (atMatch) rest = rest.replace(atMatch[0], ' ');
  if (phoneMatch) rest = rest.replace(phoneMatch[0], ' ');
  rest = rest.replace(/\s+/g, ' ').trim();
  if (rest) {
    // 若只有一段短文本当昵称，较长当需求
    if (rest.length <= 40 && !result.nickname) {
      result.nickname = rest;
    } else {
      result.requirement = rest;
    }
  }

  return result;
}

export function leadHasContent(input: ParsedLeadInput): boolean {
  return Boolean(
    normalizeUsername(input.username) ||
      (input.nickname && input.nickname.trim()) ||
      normalizePhone(input.phone) ||
      (input.requirement && input.requirement.trim()),
  );
}
