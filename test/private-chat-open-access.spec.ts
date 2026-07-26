/**
 * 群授权策略：与 telegram-bot.service ensureAuthorized 保持一致。
 * 私聊全开；群聊仅需授权录入群（任意成员）。
 */
function canUseBot(params: {
  chatType: 'private' | 'group' | 'supergroup';
  isEntryChat: boolean;
}): boolean {
  if (params.chatType === 'private') return true;
  return params.isEntryChat;
}

describe('群聊开放权限策略', () => {
  it('私聊：任何人可用', () => {
    expect(
      canUseBot({ chatType: 'private', isEntryChat: false }),
    ).toBe(true);
  });

  it('授权群：任意成员可用（不要求接待员白名单）', () => {
    expect(
      canUseBot({ chatType: 'supergroup', isEntryChat: true }),
    ).toBe(true);
  });

  it('未授权群：不可用', () => {
    expect(
      canUseBot({ chatType: 'group', isEntryChat: false }),
    ).toBe(false);
  });
});
