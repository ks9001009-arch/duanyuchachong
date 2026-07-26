import { isTelegramGetUpdatesConflict } from '../src/telegram/telegram-errors';

describe('Telegram getUpdates 409 冲突识别', () => {
  it('识别 409 Conflict 文案', () => {
    expect(
      isTelegramGetUpdatesConflict(
        '409: Conflict: terminated by other getUpdates request; make sure that only one bot instance is running',
      ),
    ).toBe(true);
  });

  it('普通错误不误判', () => {
    expect(isTelegramGetUpdatesConflict('Unauthorized')).toBe(false);
  });
});
