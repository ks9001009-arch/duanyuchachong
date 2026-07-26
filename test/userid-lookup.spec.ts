import { formatUserIdLookup } from '../src/telegram/message-formatter';

describe('formatUserIdLookup', () => {
  it('returns id-only lookup text without import wording', () => {
    const text = formatUserIdLookup({
      telegramId: '123456789',
      username: 'demo_user',
      displayName: 'Demo User',
    });

    expect(text).toContain('Telegram ID：123456789');
    expect(text).toContain('@demo_user');
    expect(text).toContain('仅查询，未录入客户库');
    expect(text).not.toContain('正式客户');
    expect(text).not.toContain('已录入');
  });
});
