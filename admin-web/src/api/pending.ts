import { apiClient } from './client';
import type {
  PaginatedData,
  PendingCustomer,
  ResolvePendingResult,
} from '@/types/api';
import { cleanParams } from '@/utils/query';

export type PendingQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  pendingCode?: string;
  status?: string;
  operatorTelegramId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type ResolvePendingBody = {
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
};

export async function fetchPendingCustomers(query: PendingQuery) {
  const { data } = await apiClient.get<PaginatedData<PendingCustomer>>(
    '/pending-customers',
    { params: cleanParams(query) },
  );
  return data;
}

export async function fetchPendingById(id: string) {
  const { data } = await apiClient.get<PendingCustomer>(
    `/pending-customers/${id}`,
  );
  return data;
}

export async function resolvePending(id: string, body: ResolvePendingBody) {
  const { data } = await apiClient.post<ResolvePendingResult>(
    `/pending-customers/${id}/resolve`,
    body,
  );
  return data;
}
