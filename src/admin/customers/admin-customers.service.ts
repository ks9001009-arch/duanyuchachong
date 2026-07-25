import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeUsername } from '../../common/utils';
import {
  ok,
  paginated,
  parseOptionalBigInt,
  parsePositiveInt,
  parseRequiredBigInt,
} from '../common/admin-response';
import { parseDateBound } from '../common/timezone';
import { CustomerListQueryDto } from './dto/customer-query.dto';

const CUSTOMER_SORT_WHITELIST = new Set([
  'firstImportedAt',
  'createdAt',
  'lastObservedAt',
  'customerCode',
]);

@Injectable()
export class AdminCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: CustomerListQueryDto) {
    const page = parsePositiveInt(query.page, 1, { min: 1 });
    if (query.pageSize != null && Number(query.pageSize) > 100) {
      throw new BadRequestException('pageSize 最大为 100');
    }
    const pageSize = parsePositiveInt(query.pageSize, 20, {
      min: 1,
      max: 100,
    });

    let telegramId: bigint | undefined;
    let operatorTelegramId: bigint | undefined;
    try {
      telegramId = parseOptionalBigInt(query.telegramId) ?? undefined;
      operatorTelegramId =
        parseOptionalBigInt(query.operatorTelegramId) ?? undefined;
    } catch {
      throw new BadRequestException('非法的 Telegram ID');
    }

    const where: Prisma.TelegramCustomerWhereInput = {};
    if (telegramId != null) where.telegramId = telegramId;
    if (operatorTelegramId != null) where.firstImportedById = operatorTelegramId;
    if (query.status) where.status = query.status;

    if (query.username) {
      const normalized = normalizeUsername(query.username);
      if (normalized) where.usernameNormalized = normalized;
    }

    if (query.keyword?.trim()) {
      const kw = query.keyword.trim();
      const normalized = normalizeUsername(kw);
      where.OR = [
        { customerCode: { contains: kw, mode: 'insensitive' } },
        { displayName: { contains: kw, mode: 'insensitive' } },
        ...(normalized
          ? [{ usernameNormalized: { contains: normalized } }]
          : [{ username: { contains: kw, mode: 'insensitive' as const } }]),
      ];
    }

    const dateFrom = parseDateBound(query.dateFrom, false);
    const dateTo = parseDateBound(query.dateTo, true);
    if (dateFrom || dateTo) {
      where.firstImportedAt = {};
      if (dateFrom) where.firstImportedAt.gte = dateFrom;
      if (dateTo) where.firstImportedAt.lte = dateTo;
    }

    const sortBy = CUSTOMER_SORT_WHITELIST.has(query.sortBy ?? '')
      ? (query.sortBy as string)
      : 'firstImportedAt';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.telegramCustomer.count({ where }),
      this.prisma.telegramCustomer.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          customerCode: true,
          telegramId: true,
          username: true,
          displayName: true,
          status: true,
          firstImportedById: true,
          firstImportedUsername: true,
          firstImportedName: true,
          firstImportedAt: true,
          firstImportSource: true,
          archiveMessageLink: true,
          lastObservedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return paginated(rows, page, pageSize, total);
  }

  async getById(id: string) {
    const customer = await this.prisma.telegramCustomer.findUnique({
      where: { id },
      include: {
        resolvedPendingRecords: {
          orderBy: { createdAt: 'desc' },
        },
        importLogs: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
    if (!customer) {
      throw new NotFoundException('客户不存在');
    }
    return ok(customer);
  }

  async getByTelegramId(telegramIdRaw: string) {
    let telegramId: bigint;
    try {
      telegramId = parseRequiredBigInt(telegramIdRaw);
    } catch {
      throw new BadRequestException('非法的 Telegram ID');
    }

    const customer = await this.prisma.telegramCustomer.findUnique({
      where: { telegramId },
      include: {
        resolvedPendingRecords: {
          orderBy: { createdAt: 'desc' },
        },
        importLogs: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
    if (!customer) {
      throw new NotFoundException('客户不存在');
    }
    return ok(customer);
  }
}
