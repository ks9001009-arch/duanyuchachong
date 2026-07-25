import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomerRegistryService } from '../../customer/customer-registry.service';
import { AppConfigService } from '../../config/app-config.service';
import {
  ok,
  paginated,
  parseOptionalBigInt,
  parsePositiveInt,
  parseRequiredBigInt,
} from '../common/admin-response';
import { parseDateBound } from '../common/timezone';
import { PendingListQueryDto, ResolvePendingDto } from './dto/pending.dto';
import { AuthAdmin } from '../auth/jwt.strategy';

@Injectable()
export class AdminPendingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: CustomerRegistryService,
    private readonly config: AppConfigService,
  ) {}

  async list(query: PendingListQueryDto) {
    const page = parsePositiveInt(query.page, 1, { min: 1 });
    if (query.pageSize != null && Number(query.pageSize) > 100) {
      throw new BadRequestException('pageSize 最大为 100');
    }
    const pageSize = parsePositiveInt(query.pageSize, 20, {
      min: 1,
      max: 100,
    });

    let operatorTelegramId: bigint | undefined;
    try {
      operatorTelegramId =
        parseOptionalBigInt(query.operatorTelegramId) ?? undefined;
    } catch {
      throw new BadRequestException('非法的 Telegram ID');
    }

    const where: Prisma.PendingTelegramCustomerWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.pendingCode) {
      where.pendingCode = query.pendingCode.trim().toUpperCase();
    }
    if (operatorTelegramId != null) {
      where.operatorTelegramId = operatorTelegramId;
    }

    if (query.keyword?.trim()) {
      const kw = query.keyword.trim();
      where.OR = [
        { pendingCode: { contains: kw, mode: 'insensitive' } },
        { visibleName: { contains: kw, mode: 'insensitive' } },
        { visibleUsername: { contains: kw, mode: 'insensitive' } },
        { note: { contains: kw, mode: 'insensitive' } },
      ];
    }

    const dateFrom = parseDateBound(query.dateFrom, false);
    const dateTo = parseDateBound(query.dateTo, true);
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = dateFrom;
      if (dateTo) where.createdAt.lte = dateTo;
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.pendingTelegramCustomer.count({ where }),
      this.prisma.pendingTelegramCustomer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          pendingCode: true,
          visibleName: true,
          visibleUsername: true,
          note: true,
          failureReason: true,
          status: true,
          operatorTelegramId: true,
          operatorUsername: true,
          operatorDisplayName: true,
          archiveMessageLink: true,
          resolvedCustomerId: true,
          resolvedByTelegramId: true,
          resolvedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return paginated(rows, page, pageSize, total);
  }

  async getById(id: string) {
    const pending = await this.prisma.pendingTelegramCustomer.findUnique({
      where: { id },
      include: { resolvedCustomer: true },
    });
    if (!pending) {
      throw new NotFoundException('待确认客户不存在');
    }
    return ok(pending);
  }

  async resolve(id: string, dto: ResolvePendingDto, admin: AuthAdmin) {
    const pending = await this.prisma.pendingTelegramCustomer.findUnique({
      where: { id },
    });
    if (!pending) {
      throw new NotFoundException('待确认客户不存在');
    }
    if (pending.status !== 'PENDING_ID') {
      throw new BadRequestException(
        `待确认记录状态为 ${pending.status}，无法重复处理`,
      );
    }

    let telegramId: bigint;
    try {
      telegramId = parseRequiredBigInt(dto.telegramId);
    } catch {
      throw new BadRequestException('非法的 Telegram ID');
    }

    const firstName =
      dto.firstName ??
      (dto.displayName ? dto.displayName.split(/\s+/)[0] : undefined);
    const lastName =
      dto.lastName ??
      (dto.displayName
        ? dto.displayName.split(/\s+/).slice(1).join(' ') || undefined
        : undefined);

    try {
      const outcome = await this.registry.resolvePendingCustomer({
        pendingCode: pending.pendingCode,
        telegramId,
        operator: {
          telegramId: this.config.adminSystemOperatorTelegramId,
          username: admin.username,
          displayName: admin.displayName ?? admin.username,
        },
        profile: {
          telegramId,
          username: dto.username,
          firstName,
          lastName,
        },
        metadata: {
          adminUserId: admin.id,
          adminUsername: admin.username,
          source: 'ADMIN_API',
        },
      });

      return ok({
        kind: outcome.kind,
        pending: outcome.pending,
        customer: outcome.customer,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '处理待确认客户失败';
      if (message.includes('无法重复处理') || message.includes('不存在')) {
        throw new BadRequestException(message);
      }
      throw error;
    }
  }
}
