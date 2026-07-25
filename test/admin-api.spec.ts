import { BadRequestException } from '@nestjs/common';
import {
  CustomerImportResult,
  CustomerImportSource,
  PendingCustomerStatus,
  PendingFailureReason,
} from '@prisma/client';
import { AdminCustomersService } from '../src/admin/customers/admin-customers.service';
import { AdminPendingService } from '../src/admin/pending/admin-pending.service';
import { AdminLogsService } from '../src/admin/logs/admin-logs.service';
import { CustomerRegistryService } from '../src/customer/customer-registry.service';
import { AppConfigService } from '../src/config/app-config.service';

const adminConfig = {
  adminSystemOperatorTelegramId: 900001n,
} as unknown as AppConfigService;

describe('Admin customers / pending / logs API services', () => {
  it('客户列表分页、telegramId、username、日期过滤；BigInt 输出字符串；非法 ID 400；pageSize>100 拒绝', async () => {
    const rows = [
      {
        id: 'c1',
        customerCode: 'C000001',
        telegramId: 111n,
        username: 'demo',
        displayName: 'Demo',
        status: 'IDENTIFIED',
        firstImportedById: 9n,
        firstImportedUsername: 'op',
        firstImportedName: '接待员',
        firstImportedAt: new Date('2026-07-20T00:00:00Z'),
        firstImportSource: 'USER_PICKER_SINGLE',
        archiveMessageLink: null,
        lastObservedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    const prisma: any = {
      telegramCustomer: {
        count: jest.fn(async () => 1),
        findMany: jest.fn(async () => rows),
        findUnique: jest.fn(async () => null),
      },
    };
    prisma.$transaction = jest.fn(async (ops: Promise<any>[]) => Promise.all(ops));

    const service = new AdminCustomersService(prisma);
    const list = await service.list({
      page: 1,
      pageSize: 20,
      telegramId: '111',
      username: '@Demo',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
    });
    expect(list.success).toBe(true);
    expect(list.data.pagination.total).toBe(1);
    expect(list.data.items[0].telegramId).toBe('111');
    expect(list.data.items[0].firstImportedById).toBe('9');

    await expect(service.getByTelegramId('abc')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.list({ pageSize: 101 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('待确认分页；resolve 复用核心服务且不用 0n；已处理不可重复', async () => {
    const pendingRow = {
      id: 'p1',
      pendingCode: 'P000001',
      visibleName: '张三',
      status: PendingCustomerStatus.PENDING_ID,
      failureReason: PendingFailureReason.HIDDEN_FORWARD_ORIGIN,
    };
    const prisma: any = {
      $transaction: jest.fn(async (ops: Promise<any>[]) => Promise.all(ops)),
      pendingTelegramCustomer: {
        count: jest.fn(async () => 1),
        findMany: jest.fn(async () => [
          {
            ...pendingRow,
            visibleUsername: null,
            note: null,
            operatorTelegramId: 1n,
            operatorUsername: 'op',
            operatorDisplayName: 'Op',
            archiveMessageLink: null,
            resolvedCustomerId: null,
            resolvedByTelegramId: null,
            resolvedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(pendingRow)
          .mockResolvedValueOnce({
            ...pendingRow,
            status: PendingCustomerStatus.RESOLVED,
          }),
      },
    };

    const registry = {
      resolvePendingCustomer: jest.fn(async (input: any) => ({
        kind: 'RESOLVED',
        pending: { ...pendingRow, status: PendingCustomerStatus.RESOLVED },
        customer: {
          id: 'c1',
          customerCode: 'C000001',
          telegramId: input.telegramId,
        },
      })),
    } as unknown as CustomerRegistryService;

    const service = new AdminPendingService(prisma, registry, adminConfig);
    const list = await service.list({ page: 1, pageSize: 20 });
    expect(list.data.items[0].operatorTelegramId).toBe('1');

    const admin = {
      id: 'adm1',
      username: 'admin',
      displayName: '管理员',
      status: 'ACTIVE' as const,
    };
    const resolved = await service.resolve(
      'p1',
      { telegramId: '999' },
      admin,
    );
    expect(resolved.data.kind).toBe('RESOLVED');
    const call = (registry.resolvePendingCustomer as jest.Mock).mock.calls[0][0];
    expect(call.operator.telegramId).toBe(900001n);
    expect(call.operator.telegramId).not.toBe(0n);
    expect(call.metadata.adminUserId).toBe('adm1');
    expect(call.metadata.source).toBe('ADMIN_API');

    await expect(
      service.resolve('p1', { telegramId: '999' }, admin),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolve 已存在 ID 走 MERGED；import logs 分页筛选；login logs 无密码字段', async () => {
    const registry = {
      resolvePendingCustomer: jest.fn(async () => ({
        kind: 'MERGED',
        pending: { id: 'p2', pendingCode: 'P000002', status: 'MERGED' },
        customer: { id: 'c9', customerCode: 'C000099', telegramId: 555n },
      })),
    } as unknown as CustomerRegistryService;

    const prismaPending: any = {
      pendingTelegramCustomer: {
        findUnique: jest.fn(async () => ({
          id: 'p2',
          pendingCode: 'P000002',
          status: PendingCustomerStatus.PENDING_ID,
        })),
      },
    };
    const pendingService = new AdminPendingService(
      prismaPending,
      registry,
      adminConfig,
    );
    const merged = await pendingService.resolve(
      'p2',
      { telegramId: '555' },
      { id: 'a', username: 'admin', displayName: null, status: 'ACTIVE' as const },
    );
    expect(merged.data.kind).toBe('MERGED');
    expect(merged.data.customer.telegramId).toBe('555');
    expect(
      (registry.resolvePendingCustomer as jest.Mock).mock.calls[0][0].operator
        .telegramId,
    ).toBe(900001n);

    const prismaLogs: any = {
      $transaction: jest.fn(async (ops: Promise<any>[]) => Promise.all(ops)),
      telegramCustomerImportLog: {
        count: jest.fn(async () => 1),
        findMany: jest.fn(async () => [
          {
            id: 'l1',
            customerId: 'c1',
            targetTelegramId: 1n,
            operatorTelegramId: 2n,
            operatorUsername: 'op',
            operatorDisplayName: 'Op',
            source: CustomerImportSource.USER_PICKER_SINGLE,
            result: CustomerImportResult.CREATED,
            failureReason: null,
            archiveMessageLink: null,
            metadata: { x: 1 },
            createdAt: new Date(),
            customer: { customerCode: 'C000001' },
          },
        ]),
      },
      adminLoginLog: {
        count: jest.fn(async () => 1),
        findMany: jest.fn(async () => [
          {
            id: 'll1',
            adminUserId: 'a1',
            username: 'admin',
            success: true,
            ipAddress: '1.1.1.1',
            userAgent: 'jest',
            failureReason: null,
            createdAt: new Date(),
          },
        ]),
      },
    };

    const logs = new AdminLogsService(prismaLogs);
    const importResult = await logs.importLogs({
      page: 1,
      result: CustomerImportResult.CREATED,
      operatorTelegramId: '2',
    });
    expect(importResult.data.items[0].targetTelegramId).toBe('1');
    expect(importResult.data.items[0].customerCode).toBe('C000001');

    const loginResult = await logs.adminLoginLogs({ page: 1, success: 'true' });
    const item = loginResult.data.items[0] as Record<string, unknown>;
    expect(item.passwordHash).toBeUndefined();
    expect(item.password).toBeUndefined();
    expect(Object.keys(item)).not.toContain('passwordHash');
  });
});
