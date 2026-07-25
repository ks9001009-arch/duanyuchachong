import {
  CustomerImportResult,
  CustomerImportSource,
  PendingCustomerStatus,
  PendingFailureReason,
} from '@prisma/client';
import { CustomerRegistryService } from '../src/customer/customer-registry.service';
import { CounterService } from '../src/counter/counter.service';

function createMockPrisma() {
  const customers = new Map<string, any>();
  const pending = new Map<string, any>();
  const logs: any[] = [];
  let customerSeq = 0;
  let pendingSeq = 0;

  const prisma: any = {
    telegramCustomer: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.telegramId != null) {
          for (const c of customers.values()) {
            if (c.telegramId === where.telegramId) return c;
          }
        }
        if (where.id) return customers.get(where.id) ?? null;
        return null;
      }),
      findMany: jest.fn(async ({ where }: any) => {
        let list = [...customers.values()];
        if (where?.OR) {
          list = list.filter((c) =>
            where.OR.some((cond: any) => {
              if (typeof cond.usernameNormalized === 'string') {
                return c.usernameNormalized === cond.usernameNormalized;
              }
              if (cond.usernameNormalized?.startsWith) {
                return (c.usernameNormalized ?? '').startsWith(
                  cond.usernameNormalized.startsWith,
                );
              }
              if (cond.displayName?.contains) {
                return (c.displayName ?? '')
                  .toLowerCase()
                  .includes(cond.displayName.contains.toLowerCase());
              }
              return false;
            }),
          );
          return list;
        }
        if (where?.usernameNormalized) {
          const n = where.usernameNormalized;
          if (typeof n === 'string') {
            list = list.filter((c) => c.usernameNormalized === n);
          } else if (n.startsWith) {
            list = list.filter((c) =>
              (c.usernameNormalized ?? '').startsWith(n.startsWith),
            );
          }
        }
        if (where?.displayName?.contains) {
          const q = where.displayName.contains.toLowerCase();
          list = list.filter((c) =>
            (c.displayName ?? '').toLowerCase().includes(q),
          );
        }
        return list;
      }),
      create: jest.fn(async ({ data }: any) => {
        if ([...customers.values()].some((c) => c.telegramId === data.telegramId)) {
          const err: any = new Error('Unique constraint');
          err.code = 'P2002';
          throw err;
        }
        const row = {
          id: `cust_${++customerSeq}`,
          ...data,
          status: 'IDENTIFIED',
          firstImportedAt: new Date(),
          lastObservedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          archiveChatId: null,
          archiveMessageId: null,
          archiveMessageLink: null,
        };
        customers.set(row.id, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = customers.get(where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      }),
    },
    pendingTelegramCustomer: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.pendingCode) {
          for (const p of pending.values()) {
            if (p.pendingCode === where.pendingCode) return { ...p };
          }
        }
        return null;
      }),
      findMany: jest.fn(async () =>
        [...pending.values()].filter((p) => p.status === 'PENDING_ID'),
      ),
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `pend_${++pendingSeq}`,
          ...data,
          status: PendingCustomerStatus.PENDING_ID,
          createdAt: new Date(),
          updatedAt: new Date(),
          archiveChatId: null,
          archiveMessageId: null,
          archiveMessageLink: null,
          resolvedCustomerId: null,
          resolvedByTelegramId: null,
          resolvedAt: null,
        };
        pending.set(row.id, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const row = pending.get(where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      }),
    },
    telegramCustomerImportLog: {
      create: jest.fn(async ({ data }: any) => {
        logs.push(data);
        return data;
      }),
    },
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
    _customers: customers,
    _pending: pending,
    _logs: logs,
  };

  return prisma;
}

describe('CustomerRegistryService', () => {
  const operator = {
    telegramId: 987654321n,
    username: 'liming',
    displayName: '李明',
  };

  let prisma: any;
  let counter: CounterService;
  let service: CustomerRegistryService;

  beforeEach(() => {
    prisma = createMockPrisma();
    counter = {
      nextCustomerCode: jest
        .fn()
        .mockImplementation(async () => {
          const n = prisma._customers.size + 1;
          return `C${String(n).padStart(6, '0')}`;
        }),
      nextPendingCode: jest
        .fn()
        .mockImplementation(async () => {
          const n = prisma._pending.size + 1;
          return `P${String(n).padStart(6, '0')}`;
        }),
    } as unknown as CounterService;
    service = new CustomerRegistryService(prisma, counter);
    service.setArchiveSender({
      sendIdentifiedArchive: jest.fn(async () => ({
        chatId: -1001234567890n,
        messageId: 10n,
        messageLink: 'https://t.me/c/1234567890/10',
      })),
      sendPendingArchive: jest.fn(async () => ({
        chatId: -1001234567890n,
        messageId: 20n,
        messageLink: 'https://t.me/c/1234567890/20',
      })),
      replyPendingResolved: jest.fn(async () => undefined),
    });
  });

  it('新客户创建（BigInt）', async () => {
    const result = await service.checkAndImportIdentifiedCustomer({
      profile: {
        telegramId: 123456789n,
        username: 'zhangsan',
        firstName: '张三',
      },
      operator,
      source: CustomerImportSource.USER_PICKER_SINGLE,
    });
    expect(result.kind).toBe('CREATED');
    expect(typeof result.customer.telegramId).toBe('bigint');
    expect(result.customer.telegramId).toBe(123456789n);
    expect(result.customer.customerCode).toBe('C000001');
    expect(result.customer.archiveMessageLink).toContain('t.me');
    expect(prisma._logs[0].result).toBe(CustomerImportResult.CREATED);
  });

  it('Telegram ID 重复不重复创建，并写日志', async () => {
    await service.checkAndImportIdentifiedCustomer({
      profile: { telegramId: 111n, username: 'a', firstName: 'A' },
      operator,
      source: CustomerImportSource.USER_PICKER_SINGLE,
    });
    const second = await service.checkAndImportIdentifiedCustomer({
      profile: { telegramId: 111n, username: 'a', firstName: 'A' },
      operator,
      source: CustomerImportSource.USER_PICKER_SINGLE,
    });
    expect(second.kind).toBe('DUPLICATE');
    expect(prisma._customers.size).toBe(1);
    expect(
      prisma._logs.some((l: any) => l.result === CustomerImportResult.DUPLICATE),
    ).toBe(true);
  });

  it('资料变化更新，null 不覆盖已有资料', async () => {
    await service.checkAndImportIdentifiedCustomer({
      profile: {
        telegramId: 222n,
        username: 'olduser',
        firstName: '旧名',
        lastName: '保留',
      },
      operator,
      source: CustomerImportSource.USER_PICKER_SINGLE,
    });

    const updated = await service.checkAndImportIdentifiedCustomer({
      profile: {
        telegramId: 222n,
        username: 'newuser',
        firstName: null,
        lastName: '',
      },
      operator,
      source: CustomerImportSource.FORWARDED_MESSAGE,
    });

    expect(updated.kind).toBe('DUPLICATE');
    expect(updated.profileUpdated).toBe(true);
    expect(updated.customer.username).toBe('newuser');
    expect(updated.customer.firstName).toBe('旧名');
    expect(updated.customer.lastName).toBe('保留');
  });

  it('并发创建同一 ID 不会产生两条正式客户', async () => {
    const profile = {
      telegramId: 333n,
      username: 'concurrent',
      firstName: '并',
    };
    const tasks = Array.from({ length: 8 }, () =>
      service.checkAndImportIdentifiedCustomer({
        profile,
        operator,
        source: CustomerImportSource.USER_PICKER_BATCH,
      }),
    );
    const results = await Promise.all(tasks);
    const created = results.filter((r) => r.kind === 'CREATED');
    expect(created.length).toBe(1);
    expect(prisma._customers.size).toBe(1);
  });

  it('hidden_user 创建待确认记录，编号唯一，可查询，保留存档链接', async () => {
    const p1 = await service.createPendingCustomer({
      visibleName: '张三',
      failureReason: PendingFailureReason.HIDDEN_FORWARD_ORIGIN,
      operator,
    });
    const p2 = await service.createPendingCustomer({
      visibleName: '李四',
      failureReason: PendingFailureReason.HIDDEN_FORWARD_ORIGIN,
      operator,
    });
    expect(p1.pendingCode).toBe('P000001');
    expect(p2.pendingCode).toBe('P000002');
    expect(p1.archiveMessageLink).toContain('t.me');

    const found = await service.findByPendingCode('P000001');
    expect(found?.visibleName).toBe('张三');
    expect(found?.status).toBe(PendingCustomerStatus.PENDING_ID);

    // 昵称不能当正式唯一身份：同名可并存
    expect(prisma._pending.size).toBe(2);
  });

  it('补充身份：新 ID 转正式客户', async () => {
    await service.createPendingCustomer({
      visibleName: '待确认甲',
      failureReason: PendingFailureReason.HIDDEN_FORWARD_ORIGIN,
      operator,
    });
    const outcome = await service.resolvePendingCustomer({
      pendingCode: 'P000001',
      telegramId: 444n,
      operator,
    });
    expect(outcome.kind).toBe('RESOLVED');
    expect(outcome.customer.telegramId).toBe(444n);
    expect(outcome.pending.status).toBe(PendingCustomerStatus.RESOLVED);
    expect(
      prisma._logs.some(
        (l: any) => l.result === CustomerImportResult.PENDING_RESOLVED,
      ),
    ).toBe(true);
  });

  it('补充身份：已存在 ID 执行合并且保留待确认记录', async () => {
    await service.checkAndImportIdentifiedCustomer({
      profile: { telegramId: 555n, firstName: '王五' },
      operator: { ...operator, displayName: '王五' },
      source: CustomerImportSource.USER_PICKER_SINGLE,
    });
    await service.createPendingCustomer({
      visibleName: '隐藏用户',
      failureReason: PendingFailureReason.HIDDEN_FORWARD_ORIGIN,
      operator,
    });
    const outcome = await service.resolvePendingCustomer({
      pendingCode: 'P000001',
      telegramId: 555n,
      operator,
    });
    expect(outcome.kind).toBe('MERGED');
    expect(outcome.pending.status).toBe(PendingCustomerStatus.MERGED);
    expect(prisma._pending.size).toBe(1);
    expect(
      prisma._logs.some(
        (l: any) => l.result === CustomerImportResult.PENDING_MERGED,
      ),
    ).toBe(true);
  });

  it('已完成记录不能重复处理', async () => {
    await service.createPendingCustomer({
      visibleName: '甲',
      failureReason: PendingFailureReason.MANUAL_PENDING,
      operator,
    });
    await service.resolvePendingCustomer({
      pendingCode: 'P000001',
      telegramId: 666n,
      operator,
    });
    await expect(
      service.resolvePendingCustomer({
        pendingCode: 'P000001',
        telegramId: 777n,
        operator,
      }),
    ).rejects.toThrow(/无法重复处理/);
  });

  it('查询：Telegram ID / pendingCode / username / 昵称 / 无结果', async () => {
    await service.checkAndImportIdentifiedCustomer({
      profile: {
        telegramId: 888n,
        username: 'zhangsan',
        firstName: '张三',
      },
      operator,
      source: CustomerImportSource.USER_PICKER_SINGLE,
    });
    await service.createPendingCustomer({
      visibleName: '待查',
      failureReason: PendingFailureReason.ID_NOT_AVAILABLE,
      operator,
    });

    expect((await service.findByTelegramId(888n))?.customerCode).toBe('C000001');
    expect(await service.findByTelegramId(999n)).toBeNull();
    expect((await service.findByPendingCode('P000001'))?.pendingCode).toBe(
      'P000001',
    );
    expect(await service.findByPendingCode('P999999')).toBeNull();

    const byUser = await service.searchByUsername('@ZhangSan');
    expect(byUser.length).toBeGreaterThanOrEqual(1);
    const byName = await service.searchByDisplayName('张');
    expect(byName.length).toBeGreaterThanOrEqual(1);
    expect(await service.searchByUsername('nobody_xxx')).toEqual([]);
    expect(await service.searchByDisplayName('不存在昵称zzz')).toEqual([]);
  });
});
