import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatCode } from '../common/utils';

export const COUNTER_CUSTOMER_CODE = 'CUSTOMER_CODE';
export const COUNTER_PENDING_CODE = 'PENDING_CODE';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class CounterService {
  constructor(private readonly prisma: PrismaService) {}

  async nextCustomerCode(tx?: TxClient): Promise<string> {
    const value = await this.nextValue(COUNTER_CUSTOMER_CODE, tx);
    return formatCode('C', value);
  }

  async nextPendingCode(tx?: TxClient): Promise<string> {
    const value = await this.nextValue(COUNTER_PENDING_CODE, tx);
    return formatCode('P', value);
  }

  private async nextValue(key: string, tx?: TxClient): Promise<bigint> {
    const client = tx ?? this.prisma;

    // 原子 upsert + increment，保证并发安全
    const rows = await client.$queryRaw<Array<{ value: bigint }>>`
      INSERT INTO "SystemCounter" ("key", "value", "updatedAt")
      VALUES (${key}, 1, NOW())
      ON CONFLICT ("key")
      DO UPDATE SET
        "value" = "SystemCounter"."value" + 1,
        "updatedAt" = NOW()
      RETURNING "value"
    `;

    if (!rows[0]) {
      throw new Error(`编号生成失败: ${key}`);
    }
    return rows[0].value;
  }
}
