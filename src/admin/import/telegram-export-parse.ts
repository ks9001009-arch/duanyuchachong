import { normalizeUsername } from '../../common/utils';
import { normalizePhone } from '../../customer/group-lead-parse';

export type ExportLeadRecord = {
  username: string | null;
  phone: string | null;
  nickname: string | null;
  /** 批次内去重键 */
  key: string;
};

/** 从 Telegram Desktop 导出 HTML 中提取待导入线索（拆条、批内去重） */
export function parseTelegramExportHtml(html: string): ExportLeadRecord[] {
  const blocks = extractTextBlocks(html);
  const byKey = new Map<string, ExportLeadRecord>();

  for (const block of blocks) {
    const records = recordsFromTextBlock(block);
    for (const record of records) {
      if (!byKey.has(record.key)) {
        byKey.set(record.key, record);
      }
    }
  }

  return [...byKey.values()];
}

export function extractTextBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re = /<div class="text">([\s\S]*?)<\/div>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    blocks.push(match[1] ?? '');
  }
  return blocks;
}

export function recordsFromTextBlock(htmlFragment: string): ExportLeadRecord[] {
  const usernames = extractUsernames(htmlFragment);
  const phones = extractPhones(htmlFragment);
  const plain = stripHtml(htmlFragment).trim();

  // 忽略纯短数字闲聊等
  if (usernames.length === 0 && phones.length === 0) {
    return [];
  }

  // 恰好一对：合并为一条
  if (usernames.length === 1 && phones.length === 1) {
    const username = usernames[0]!;
    const phone = phones[0]!;
    return [
      makeRecord({
        username,
        phone,
        nickname: null,
      }),
    ];
  }

  const out: ExportLeadRecord[] = [];
  for (const username of usernames) {
    out.push(makeRecord({ username, phone: null, nickname: null }));
  }
  for (const phone of phones) {
    out.push(makeRecord({ username: null, phone, nickname: null }));
  }

  // 若无用户名/电话以外还有短昵称文本（极少见），且仅有一个实体字段时附上
  if (
    out.length === 1 &&
    plain &&
    !plain.startsWith('+') &&
    !plain.startsWith('@') &&
    plain.length <= 40 &&
    !/^\d+$/.test(plain)
  ) {
    const cleaned = plain
      .replace(/@[\w]+/g, ' ')
      .replace(/\+?\d[\d\s\-()]{5,}\d/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned && cleaned.length >= 2 && cleaned.length <= 40) {
      out[0] = makeRecord({
        username: out[0]!.username,
        phone: out[0]!.phone,
        nickname: cleaned,
      });
    }
  }

  return out;
}

function makeRecord(input: {
  username: string | null;
  phone: string | null;
  nickname: string | null;
}): ExportLeadRecord {
  const username = input.username
    ? normalizeUsername(input.username) || input.username.replace(/^@+/, '').trim()
    : null;
  const phone = input.phone ? normalizePhone(input.phone) || input.phone : null;
  const nickname = input.nickname?.trim() || null;

  let key: string;
  if (username) {
    key = `u:${username.toLowerCase()}`;
  } else if (phone) {
    key = `p:${phone.replace(/\D/g, '')}`;
  } else {
    key = `n:${nickname ?? ''}`;
  }

  return { username, phone, nickname, key };
}

export function extractUsernames(htmlFragment: string): string[] {
  const found = new Set<string>();

  const tmeRe =
    /(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z][A-Za-z0-9_]{3,})/gi;
  let m: RegExpExecArray | null;
  while ((m = tmeRe.exec(htmlFragment)) !== null) {
    const u = m[1];
    if (u && !isReservedTmePath(u)) found.add(u);
  }

  const atRe = /@([A-Za-z][A-Za-z0-9_]{3,})/g;
  const plain = stripHtml(htmlFragment);
  while ((m = atRe.exec(plain)) !== null) {
    if (m[1]) found.add(m[1]);
  }

  return [...found];
}

export function extractPhones(htmlFragment: string): string[] {
  const found = new Set<string>();

  const telRe = /href=["']tel:([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = telRe.exec(htmlFragment)) !== null) {
    const normalized = normalizePhone(decodeHtmlEntities(m[1] ?? ''));
    if (normalized) found.add(normalized);
  }

  const plain = stripHtml(htmlFragment);
  const phoneRe = /(\+?\d[\d\s\-()]{5,}\d)/g;
  while ((m = phoneRe.exec(plain)) !== null) {
    const normalized = normalizePhone(m[1]);
    if (normalized) found.add(normalized);
  }

  return [...found];
}

function isReservedTmePath(path: string): boolean {
  const lower = path.toLowerCase();
  return [
    'share',
    'joinchat',
    'addstickers',
    'proxy',
    'socks',
    'setlanguage',
    'c',
  ].includes(lower);
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»');
}
