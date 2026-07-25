import { apiClient } from './client';
import type {
  AdminLoginLogItem,
  ImportLogItem,
  PaginatedData,
} from '@/types/api';
import { cleanParams } from '@/utils/query';

export type ImportLogQuery = {
  page?: number;
  pageSize?: number;
  result?: string;
  source?: string;
  operatorTelegramId?: string;
  targetTelegramId?: string;
  customerId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type AdminLoginLogQuery = {
  page?: number;
  pageSize?: number;
  success?: string;
  username?: string;
  dateFrom?: string;
  dateTo?: string;
};

export async function fetchImportLogs(query: ImportLogQuery) {
  const { data } = await apiClient.get<PaginatedData<ImportLogItem>>(
    '/import-logs',
    { params: cleanParams(query) },
  );
  return data;
}

export async function fetchAdminLoginLogs(query: AdminLoginLogQuery) {
  const { data } = await apiClient.get<PaginatedData<AdminLoginLogItem>>(
    '/admin-login-logs',
    { params: cleanParams(query) },
  );
  return data;
}
