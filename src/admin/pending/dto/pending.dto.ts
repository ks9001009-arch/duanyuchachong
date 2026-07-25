import { IsIn, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PendingCustomerStatus } from '@prisma/client';

export class PendingListQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  pageSize?: number;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  pendingCode?: string;

  @IsOptional()
  @IsIn(Object.values(PendingCustomerStatus))
  status?: PendingCustomerStatus;

  @IsOptional()
  @IsString()
  operatorTelegramId?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}

export class ResolvePendingDto {
  @IsString()
  telegramId!: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}
