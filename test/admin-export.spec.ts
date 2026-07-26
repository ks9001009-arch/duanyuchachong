import {
  AdminExportService,
  formatCustomerBackupLine,
} from '../src/admin/export/admin-export.service';
import {
  NO_TELEGRAM_USERNAME_LABEL,
  toSheetRow,
} from '../src/admin/export/customer-sheet-format';
import { extractPhoneFromPendingNote } from '../src/customer/customer-registry.service';

describe('customer sheet format', () => {
  it('无用户名使用占位文案', () => {
    expect(
      toSheetRow({
        displayName: '张三',
        username: null,
        phone: '13800138000',
        telegramId: 123456789n,
      }),
    ).toEqual([
      '张三',
      NO_TELEGRAM_USERNAME_LABEL,
      '13800138000',
      '123456789',
    ]);
  });

  it('TXT 行含占位用户名', () => {
    expect(
      formatCustomerBackupLine({
        displayName: '张三',
        username: '',
        phone: '',
        telegramId: 1n,
      }),
    ).toBe(`张三-${NO_TELEGRAM_USERNAME_LABEL}--1`);
  });
});

describe('extractPhoneFromPendingNote', () => {
  it('解析电话与电话原文', () => {
    expect(extractPhoneFromPendingNote('电话:13800138000；需求:咨询')).toBe(
      '13800138000',
    );
    expect(extractPhoneFromPendingNote('电话原文:+86 138-0013-8000')).toMatch(
      /138/,
    );
  });
});

describe('AdminExportService', () => {
  it('客户清单文本导出含占位用户名', async () => {
    const prisma = {
      telegramCustomer: {
        findMany: jest.fn().mockResolvedValue([
          {
            displayName: '李四',
            username: null,
            phone: '13900001111',
            telegramId: 42n,
          },
        ]),
      },
    };
    const svc = new AdminExportService(prisma as never);
    const text = await svc.buildCustomerExportText();
    expect(text).toBe(`李四-${NO_TELEGRAM_USERNAME_LABEL}-13900001111-42\n`);
  });

  it('xlsx 缓冲可生成', async () => {
    const prisma = {
      telegramCustomer: {
        findMany: jest.fn().mockResolvedValue([
          {
            displayName: '王五',
            username: 'wangwu',
            phone: null,
            telegramId: 7n,
          },
        ]),
      },
    };
    const svc = new AdminExportService(prisma as never);
    const buf = await svc.buildCustomerWorkbookBuffer();
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.byteLength).toBeGreaterThan(100);
  });

  it('JSON 备份不含 passwordHash', async () => {
    const prisma = {
      telegramCustomer: {
        findMany: jest.fn().mockResolvedValue([{ id: 'c1', telegramId: 1n }]),
      },
      pendingTelegramCustomer: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      telegramCustomerImportLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      groupLead: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      adminLoginLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      adminUser: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a1', username: 'admin', displayName: null },
        ]),
      },
      systemCounter: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const svc = new AdminExportService(prisma as never);
    const backup = await svc.buildFullBackup();

    expect(backup.format).toBe('duanyu-customer-registry-backup');
    expect(backup.version).toBe(2);
    expect(backup.counts.customers).toBe(1);
    expect(backup.data.customers[0].telegramId).toBe('1');
    expect(JSON.stringify(backup)).not.toContain('passwordHash');
  });
});
