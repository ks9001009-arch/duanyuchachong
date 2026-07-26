import {
  extractPhones,
  extractUsernames,
  parseTelegramExportHtml,
  recordsFromTextBlock,
} from '../src/admin/import/telegram-export-parse';

describe('telegram-export-parse', () => {
  it('解析单条 @用户名', () => {
    const html = `
      <div class="text">
        <a href="https://t.me/Nikostyper">@Nikostyper</a>
      </div>
    `;
    const records = parseTelegramExportHtml(html);
    expect(records).toHaveLength(1);
    expect(records[0]?.username).toBe('nikostyper');
    expect(records[0]?.phone).toBeNull();
  });

  it('解析单条电话', () => {
    const html = `
      <div class="text">
        <a href="tel:+4571400956">+4571400956</a>
      </div>
    `;
    const records = parseTelegramExportHtml(html);
    expect(records).toHaveLength(1);
    expect(records[0]?.phone).toBe('+4571400956');
    expect(records[0]?.username).toBeNull();
  });

  it('一对用户名+电话合并为一条', () => {
    const records = recordsFromTextBlock(
      `<a href="https://t.me/foo_bar">@foo_bar</a><br><a href="tel:+491234567890">+491234567890</a>`,
    );
    expect(records).toHaveLength(1);
    expect(records[0]?.username).toBe('foo_bar');
    expect(records[0]?.phone).toMatch(/491234567890/);
  });

  it('大杂烩拆成多条并去重', () => {
    const html = `
      <div class="text">
        <a href="https://t.me/UserOne">@UserOne</a><br>
        <a href="tel:+491111111111">+491111111111</a><br>
        <a href="https://t.me/UserTwo">@UserTwo</a><br>
        <a href="https://t.me/UserOne">@UserOne</a>
      </div>
    `;
    const records = parseTelegramExportHtml(html);
    const usernames = records.map((r) => r.username).filter(Boolean);
    const phones = records.map((r) => r.phone).filter(Boolean);
    expect(usernames).toEqual(expect.arrayContaining(['userone', 'usertwo']));
    expect(usernames.filter((u) => u === 'userone')).toHaveLength(1);
    expect(phones.length).toBe(1);
  });

  it('extractUsernames / extractPhones 辅助函数', () => {
    expect(extractUsernames('@Abc_def12 你好')).toContain('Abc_def12');
    expect(extractPhones('call +49 162 151 0241 now')[0]).toMatch(/491621510241/);
  });

  it('忽略无用户名无电话的正文', () => {
    const html = `<div class="text">1</div>`;
    expect(parseTelegramExportHtml(html)).toHaveLength(0);
  });
});
