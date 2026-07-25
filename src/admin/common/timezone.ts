/**
 * 按 IANA 时区计算“今日”起止（半开区间 [start, end)）。
 * Asia/Yangon 无夏令时，同样适用其他时区。
 */
export function getDayBoundsInTimeZone(
  timeZone: string,
  now = new Date(),
): { start: Date; end: Date } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const partsOf = (date: Date) => {
    const parts = formatter.formatToParts(date);
    const map: Record<string, string> = {};
    for (const p of parts) {
      if (p.type !== 'literal') map[p.type] = p.value;
    }
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      hour: Number(map.hour),
      minute: Number(map.minute),
      second: Number(map.second),
    };
  };

  const nowParts = partsOf(now);
  const noonUtcGuess = Date.UTC(
    nowParts.year,
    nowParts.month - 1,
    nowParts.day,
    12,
    0,
    0,
  );
  const noonParts = partsOf(new Date(noonUtcGuess));
  const asIfUtc = Date.UTC(
    noonParts.year,
    noonParts.month - 1,
    noonParts.day,
    noonParts.hour,
    noonParts.minute,
    noonParts.second,
  );
  const offsetMs = asIfUtc - noonUtcGuess;
  const start = new Date(
    Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day, 0, 0, 0) -
      offsetMs,
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function parseDateBound(raw?: string, endOfDay = false): Date | undefined {
  if (!raw || !raw.trim()) return undefined;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(endOfDay ? `${s}T23:59:59.999Z` : `${s}T00:00:00.000Z`);
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}
