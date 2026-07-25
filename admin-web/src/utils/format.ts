import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Shanghai';

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = dayjs(value);
  if (!d.isValid()) return '—';
  return d.tz(TZ).format('YYYY-MM-DD HH:mm:ss');
}

export function formatNumber(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function displayText(value?: string | null): string {
  if (value == null || String(value).trim() === '') return '—';
  return String(value);
}

export function displayUsername(username?: string | null): string {
  if (!username || !username.trim()) return '—';
  return username.startsWith('@') ? username : `@${username}`;
}

export function stripAt(username?: string): string | undefined {
  if (!username) return undefined;
  return username.replace(/^@+/, '').trim() || undefined;
}

export function isPositiveTelegramId(value: string): boolean {
  return /^\d+$/.test(value) && BigInt(value) > 0n;
}
