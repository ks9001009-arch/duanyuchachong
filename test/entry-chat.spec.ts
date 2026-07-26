import { EntryChatService } from '../src/telegram/entry-chat.service';

describe('EntryChatService', () => {
  it('环境变量白名单直接视为已授权', async () => {
    const prisma = {
      boundEntryChat: {
        findUnique: jest.fn(),
      },
    };
    const config = {
      isEntryChat: jest.fn().mockReturnValue(true),
    };
    const svc = new EntryChatService(prisma as never, config as never);
    await expect(svc.isEntryChat(123n)).resolves.toBe(true);
    expect(prisma.boundEntryChat.findUnique).not.toHaveBeenCalled();
  });

  it('数据库 active 绑定视为已授权', async () => {
    const prisma = {
      boundEntryChat: {
        findUnique: jest.fn().mockResolvedValue({ active: true }),
      },
    };
    const config = {
      isEntryChat: jest.fn().mockReturnValue(false),
    };
    const svc = new EntryChatService(prisma as never, config as never);
    await expect(svc.isEntryChat(456n)).resolves.toBe(true);
  });

  it('bind 会 upsert 为 active', async () => {
    const upsert = jest.fn().mockResolvedValue({ chatId: 1n, active: true });
    const prisma = { boundEntryChat: { upsert } };
    const config = { isEntryChat: jest.fn() };
    const svc = new EntryChatService(prisma as never, config as never);
    await svc.bind({
      chatId: 1n,
      title: '测试群',
      operatorTelegramId: 9n,
      operatorUsername: 'admin',
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { chatId: 1n },
        create: expect.objectContaining({ active: true, title: '测试群' }),
        update: expect.objectContaining({ active: true }),
      }),
    );
  });
});
