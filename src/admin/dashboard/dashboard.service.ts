import { Injectable } from '@nestjs/common';
import {
  CustomerImportResult,
  PendingCustomerStatus,
  TelegramCustomerStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { getDayBoundsInTimeZone } from '../common/timezone';
import { ok } from '../common/admin-response';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async summary() {
    const { start, end } = getDayBoundsInTimeZone(this.config.appTimezone);

    const [
      identifiedCustomers,
      pendingCustomers,
      todayCreatedCustomers,
      todayPendingCustomers,
      todayDuplicateImports,
      todayFailedImports,
      totalImportLogs,
    ] = await Promise.all([
      this.prisma.telegramCustomer.count({
        where: { status: TelegramCustomerStatus.IDENTIFIED },
      }),
      this.prisma.pendingTelegramCustomer.count({
        where: { status: PendingCustomerStatus.PENDING_ID },
      }),
      this.prisma.telegramCustomer.count({
        where: { firstImportedAt: { gte: start, lt: end } },
      }),
      this.prisma.pendingTelegramCustomer.count({
        where: { createdAt: { gte: start, lt: end } },
      }),
      this.prisma.telegramCustomerImportLog.count({
        where: {
          createdAt: { gte: start, lt: end },
          result: CustomerImportResult.DUPLICATE,
        },
      }),
      this.prisma.telegramCustomerImportLog.count({
        where: {
          createdAt: { gte: start, lt: end },
          result: {
            in: [
              CustomerImportResult.FAILED,
              CustomerImportResult.INVALID,
              CustomerImportResult.HIDDEN_SENDER,
            ],
          },
        },
      }),
      this.prisma.telegramCustomerImportLog.count(),
    ]);

    return ok({
      identifiedCustomers,
      pendingCustomers,
      todayCreatedCustomers,
      todayPendingCustomers,
      todayDuplicateImports,
      todayFailedImports,
      totalImportLogs,
    });
  }
}
