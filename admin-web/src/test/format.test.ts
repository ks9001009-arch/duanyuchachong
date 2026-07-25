/// <reference types="vitest/globals" />

import { describe, expect, it } from 'vitest';
import { formatDateTime, formatNumber, displayText } from '@/utils/format';

describe('format utils', () => {
  it('空值显示 —', () => {
    expect(displayText(null)).toBe('—');
    expect(displayText('')).toBe('—');
    expect(formatDateTime(null)).toBe('—');
  });

  it('数字千分位', () => {
    expect(formatNumber(1000)).toBe('1,000');
  });

  it('时间转为中国时区格式', () => {
    // 固定 UTC 时刻
    const text = formatDateTime('2026-01-01T00:00:00.000Z');
    expect(text).toBe('2026-01-01 08:00:00');
  });
});
