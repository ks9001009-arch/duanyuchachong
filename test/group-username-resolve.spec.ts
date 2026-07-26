import { formatGroupImportResolvedReply } from '../src/telegram/message-formatter';

describe('formatGroupImportResolvedReply', () => {
  const customer = {
    customerCode: 'C000001',
    telegramId: 123456789n,
    username: 'longslon',
    displayName: '测试昵称',
    phone: null,
    archiveMessageLink: null,
  } as never;

  it('新建正式客户文案', () => {
    const text = formatGroupImportResolvedReply({
      customer,
      created: true,
      profileUpdated: false,
      resolvedUsername: 'Longslon',
    });
    expect(text).toContain('已通过用户名解析到 Telegram ID');
    expect(text).toContain('123456789');
    expect(text).toContain('@Longslon');
  });

  it('已存在客户文案', () => {
    const text = formatGroupImportResolvedReply({
      customer,
      created: false,
      profileUpdated: true,
      resolvedUsername: 'longslon',
    });
    expect(text).toContain('该客户已存在');
    expect(text).toContain('资料已更新');
  });
});
