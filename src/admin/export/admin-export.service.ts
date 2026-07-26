import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service';
import { serializeBigInts } from '../common/admin-response';
import {
  SHEET_HEADERS,
  formatCustomerBackupLine,
  toSheetRow,
} from './customer-sheet-format';

export { formatCustomerBackupLine, toSheetRow, SHEET_HEADERS };

@Injectable()
export class AdminExportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 客户清单文本导出。
   * 每行：电报昵称-用户名-电话-电报ID（无用户名用占位文案）
   */
  async buildCustomerExportText(): Promise<string> {
    const customers = await this.loadCustomerRows();
    if (customers.length === 0) return '';
    return `${customers.map(formatCustomerBackupLine).join('\n')}\n`;
  }

  /** 导出本地 xlsx：电报昵称 / 电报用户名 / 绑定号码 / 电报ID */
  async buildCustomerWorkbookBuffer(): Promise<Buffer> {
    const customers = await this.loadCustomerRows();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'duanyu-customer-registry';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('客户底库', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    sheet.addRow([...SHEET_HEADERS]);
    sheet.getRow(1).font = { bold: true };
    for (const c of customers) {
      sheet.addRow(toSheetRow(c));
    }
    sheet.columns = [
      { width: 24 },
      { width: 28 },
      { width: 18 },
      { width: 22 },
    ];
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async loadCustomerRows() {
    return this.prisma.telegramCustomer.findMany({
      orderBy: { firstImportedAt: 'asc' },
      select: {
        displayName: true,
        username: true,
        phone: true,
        telegramId: true,
      },
    });
  }

  /** 全量 JSON 系统备份（不含管理员密码哈希） */
  async buildFullBackup() {
    const [
      customers,
      pendingCustomers,
      importLogs,
      groupLeads,
      adminLoginLogs,
      adminUsers,
      systemCounters,
    ] = await Promise.all([
      this.prisma.telegramCustomer.findMany({
        orderBy: { firstImportedAt: 'asc' },
      }),
      this.prisma.pendingTelegramCustomer.findMany({
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.telegramCustomerImportLog.findMany({
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.groupLead.findMany({
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.adminLoginLog.findMany({
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.adminUser.findMany({
        select: {
          id: true,
          username: true,
          displayName: true,
          status: true,
          lastLoginAt: true,
          passwordChangedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.systemCounter.findMany({
        orderBy: { key: 'asc' },
      }),
    ]);

    const payload = {
      format: 'duanyu-customer-registry-backup',
      version: 2,
      exportedAt: new Date().toISOString(),
      counts: {
        customers: customers.length,
        pendingCustomers: pendingCustomers.length,
        importLogs: importLogs.length,
        groupLeads: groupLeads.length,
        adminLoginLogs: adminLoginLogs.length,
        adminUsers: adminUsers.length,
        systemCounters: systemCounters.length,
      },
      data: {
        customers,
        pendingCustomers,
        importLogs,
        groupLeads,
        adminLoginLogs,
        adminUsers,
        systemCounters,
      },
    };

    return serializeBigInts(payload);
  }
}
