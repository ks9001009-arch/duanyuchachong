import { IsIn, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { TelegramCustomerStatus } from '@prisma/client';

export class CustomerListQueryDto {
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
  telegramId?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  operatorTelegramId?: string;

  @IsOptional()
  @IsIn(Object.values(TelegramCustomerStatus))
  status?: TelegramCustomerStatus;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsIn(['firstImportedAt', 'createdAt', 'lastObservedAt', 'customerCode'])
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
