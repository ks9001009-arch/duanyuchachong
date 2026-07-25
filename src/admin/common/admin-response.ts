/**
 * 将对象中的 BigInt 递归转为字符串，便于安全 JSON 输出。
 */
export function serializeBigInts<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  ) as T;
}

export function ok<T>(data: T) {
  return { success: true as const, data: serializeBigInts(data) };
}

export function fail(message: string) {
  return { success: false as const, message };
}

export function paginated<T>(
  items: T[],
  page: number,
  pageSize: number,
  total: number,
) {
  return ok({
    items: serializeBigInts(items),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    },
  });
}

export function parsePositiveInt(
  value: unknown,
  fallback: number,
  opts?: { min?: number; max?: number },
): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  let result = Math.trunc(n);
  if (opts?.min != null) result = Math.max(opts.min, result);
  if (opts?.max != null) result = Math.min(opts.max, result);
  return result;
}

export function parseOptionalBigInt(raw: string | undefined | null): bigint | null {
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  if (!/^-?\d+$/.test(s)) {
    throw new Error('INVALID_BIGINT');
  }
  return BigInt(s);
}

export function parseRequiredBigInt(raw: string): bigint {
  const v = parseOptionalBigInt(raw);
  if (v == null) throw new Error('INVALID_BIGINT');
  return v;
}
