import {
  archiveLinkText,
  buildDisplayName,
  buildTelegramMessageLink,
  formatCode,
  isMeaningfulText,
  normalizeUsername,
} from '../src/common/utils';
import { plainReplyExtra } from '../src/telegram/reply-options';

describe('buildTelegramMessageLink', () => {
  it('生成私有超级群链接', () => {
    const link = buildTelegramMessageLink({
      chatId: BigInt('-1001234567890'),
      messageId: 42,
      chatType: 'supergroup',
    });
    expect(link).toBe('https://t.me/c/1234567890/42');
  });

  it('生成公开群链接', () => {
    const link = buildTelegramMessageLink({
      chatId: BigInt('-1001234567890'),
      messageId: 99,
      chatUsername: 'my_group',
      chatType: 'supergroup',
    });
    expect(link).toBe('https://t.me/my_group/99');
  });

  it('私聊返回 null', () => {
    const link = buildTelegramMessageLink({
      chatId: BigInt('123456789'),
      messageId: 1,
      chatType: 'private',
    });
    expect(link).toBeNull();
  });

  it('非法 Chat ID 返回 null', () => {
    expect(
      buildTelegramMessageLink({
        chatId: 'not-a-number',
        messageId: 1,
        chatType: 'supergroup',
      }),
    ).toBeNull();
  });

  it('普通负群 ID 无法生成链接时返回 null', () => {
    expect(
      buildTelegramMessageLink({
        chatId: BigInt('-12345'),
        messageId: 1,
        chatType: 'group',
      }),
    ).toBeNull();
  });
});

describe('archiveLinkText', () => {
  it('不生成 Markdown 链接，避免动态内容破坏解析', () => {
    expect(archiveLinkText(null)).toBe('暂无');
    expect(archiveLinkText(undefined)).toBe('暂无');
    expect(archiveLinkText('https://t.me/c/123/1')).toBe('见下方按钮');
    expect(archiveLinkText('https://t.me/c/123/1', 'url')).toBe(
      'https://t.me/c/123/1',
    );
    expect(archiveLinkText('https://t.me/c/123/1')).not.toMatch(/\[.*\]\(/);
  });
});

describe('plainReplyExtra', () => {
  it('不设置 parse_mode', () => {
    const extra = plainReplyExtra({
      archiveLink: 'https://t.me/c/123/1',
    });
    expect(extra.parse_mode).toBeUndefined();
    expect(extra.reply_markup).toBeDefined();
  });

  it('含下划线的用户名场景不依赖 Markdown', () => {
    const text = `用户名：@ji_labs\n存档：见下方按钮`;
    expect(text).toContain('@ji_labs');
    const extra = plainReplyExtra({
      archiveLink: 'https://t.me/c/123/1',
    });
    expect(extra).not.toHaveProperty('parse_mode');
  });
});

describe('utils helpers', () => {
  it('formatCode 补零', () => {
    expect(formatCode('C', 125n)).toBe('C000125');
    expect(formatCode('P', 1n)).toBe('P000001');
  });

  it('normalizeUsername 去@并小写', () => {
    expect(normalizeUsername('@ZhangSan')).toBe('zhangsan');
    expect(normalizeUsername('')).toBeNull();
    expect(normalizeUsername(null)).toBeNull();
  });

  it('isMeaningfulText 拒绝 null/空串', () => {
    expect(isMeaningfulText(null)).toBe(false);
    expect(isMeaningfulText(undefined)).toBe(false);
    expect(isMeaningfulText('')).toBe(false);
    expect(isMeaningfulText('  ')).toBe(false);
    expect(isMeaningfulText('张三')).toBe(true);
  });

  it('buildDisplayName', () => {
    expect(buildDisplayName('张', '三')).toBe('张 三');
    expect(buildDisplayName('张', null)).toBe('张');
    expect(buildDisplayName(null, null)).toBeNull();
  });
});
