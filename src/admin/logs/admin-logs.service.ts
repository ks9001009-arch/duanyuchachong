import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  paginated,
  parseOptionalBigInt,
  parsePositiveInt,
} from '../common/admin-response';
import { parseDateBound } from '../common/timezone';
import { AdminLoginLogQueryDto, ImportLogQueryDto } from './dto/log-query.dto';

@Injectable()
export class AdminLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async importLogs(query: ImportLogQueryDto) {
    const page = parsePositiveInt(query.page, 1, { min: 1 });
    if (query.pageSize != null && Number(query.pageSize) > 100) {
      throw new BadRequestException('pageSize 最大为 100');
    }
    const pageSize = parsePositiveInt(query.pageSize, 20, {
      min: 1,
      max: 100,
    });

    let operatorTelegramId: bigint | undefined;
    let targetTelegramId: bigint | undefined;
    try {
      operatorTelegramId =
        parseOptionalBigInt(query.operatorTelegramId) ?? undefined;
      targetTelegramId =
        parseOptionalBigInt(query.targetTelegramId) ?? undefined;
    } catch {
      throw new BadRequestException('非法的 Telegram ID');
    }

    const where: Prisma.TelegramCustomerImportLogWhereInput = {};
    if (query.result) where.result = query.result;
    if (query.source) where.source = query.source;
    if (query.customerId) where.customerId = query.customerId;
    if (operatorTelegramId != null) where.operatorTelegramId = operatorTelegramId;
    if (targetTelegramId != null) where.targetTelegramId = targetTelegramId;

    const dateFrom = parseDateBound(query.dateFrom, false);
    const dateTo = parseDateBound(query.dateTo, true);
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = dateFrom;
      if (dateTo) where.createdAt.lte = dateTo;
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.telegramCustomerImportLog.count({ where }),
      this.prisma.telegramCustomerImportLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: {
            select: { customerCode: true },
          },
        },
      }),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      customerId: row.customerId,
      customerCode: row.customer?.customerCode ?? null,
      targetTelegramId: row.targetTelegramId,
      operatorTelegramId: row.operatorTelegramId,
      operatorUsername: row.operatorUsername,
      operatorDisplayName: row.operatorDisplayName,
      source: row.source,
      result: row.result,
      failureReason: row.failureReason,
      archiveMessageLink: row.archiveMessageLink,
      metadata: row.metadata,
      createdAt: row.createdAt,
    }));

    return paginated(items, page, pageSize, total);
  }

  async adminLoginLogs(query: AdminLoginLogQueryDto) {
    const page = parsePositiveInt(query.page, 1, { min: 1 });
    const pageSize = parsePositiveInt(query.pageSize, 20, {
      min: 1,
      max: 100,
    });

    const where: Prisma.AdminLoginLogWhereInput = {};
    if (query.success === 'true') where.success = true;
    if (query.success === 'false') where.success = false;
    if (query.username?.trim()) {
      where.username = {
        contains: query.username.trim(),
        mode: 'insensitive',
      };
    }

    const dateFrom = parseDateBound(query.dateFrom, false);
    const dateTo = parseDateBound(query.dateTo, true);
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = dateFrom;
      if (dateTo) where.createdAt.lte = dateTo;
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.adminLoginLog.count({ where }),
      this.prisma.adminLoginLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          adminUserId: true,
          username: true,
          success: true,
          ipAddress: true,
          userAgent: true,
          failureReason: true,
          createdAt: true,
        },
      }),
    ]);

    return paginated(rows, page, pageSize, total);
  }
}
