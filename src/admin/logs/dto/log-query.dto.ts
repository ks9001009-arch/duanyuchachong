import { IsBooleanString, IsIn, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  CustomerImportResult,
  CustomerImportSource,
} from '@prisma/client';

export class ImportLogQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  pageSize?: number;

  @IsOptional()
  @IsIn(Object.values(CustomerImportResult))
  result?: CustomerImportResult;

  @IsOptional()
  @IsIn(Object.values(CustomerImportSource))
  source?: CustomerImportSource;

  @IsOptional()
  @IsString()
  operatorTelegramId?: string;

  @IsOptional()
  @IsString()
  targetTelegramId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}

export class AdminLoginLogQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  pageSize?: number;

  @IsOptional()
  @IsBooleanString()
  success?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}
