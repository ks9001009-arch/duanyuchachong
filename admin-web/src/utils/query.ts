export function cleanParams(
  input: Record<string, string | number | boolean | undefined | null>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value == null || value === '') continue;
    out[key] = String(value);
  }
  return out;
}

export function readSearchParams(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
}
