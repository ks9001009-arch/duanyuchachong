import { AppConfigService } from '../src/config/app-config.service';

/**
 * 私聊开放策略的轻量断言：与 telegram-bot.service ensureAuthorized 保持一致。
 * 私聊不校验 operator；群聊需 operator + entry chat。
 */
function canUseBot(params: {
  chatType: 'private' | 'group' | 'supergroup';
  isOperator: boolean;
  isEntryChat: boolean;
}): boolean {
  if (params.chatType === 'private') return true;
  return params.isOperator && params.isEntryChat;
}

describe('私聊开放权限策略', () => {
  it('私聊：非接待员也可用', () => {
    expect(
      canUseBot({
        chatType: 'private',
        isOperator: false,
        isEntryChat: false,
      }),
    ).toBe(true);
  });

  it('群聊：非接待员不可用', () => {
    expect(
      canUseBot({
        chatType: 'supergroup',
        isOperator: false,
        isEntryChat: true,
      }),
    ).toBe(false);
  });

  it('群聊：接待员但不在授权群不可用', () => {
    expect(
      canUseBot({
        chatType: 'group',
        isOperator: true,
        isEntryChat: false,
      }),
    ).toBe(false);
  });

  it('群聊：接待员且授权群可用', () => {
    expect(
      canUseBot({
        chatType: 'supergroup',
        isOperator: true,
        isEntryChat: true,
      }),
    ).toBe(true);
  });

  it('AppConfigService.isOperator 仍按名单判断（群聊用）', () => {
    const config = {
      get: (key: string) => {
        if (key === 'TELEGRAM_OPERATOR_IDS') return '100,200';
        return undefined;
      },
    };
    const svc = new AppConfigService(config as never);
    expect(svc.isOperator(100)).toBe(true);
    expect(svc.isOperator(999)).toBe(false);
  });
});
