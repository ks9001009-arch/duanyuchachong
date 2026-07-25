import { apiClient } from './client';
import type { CustomerDetail, CustomerListItem, PaginatedData } from '@/types/api';
import { cleanParams } from '@/utils/query';

export type CustomerQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  telegramId?: string;
  username?: string;
  operatorTelegramId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

export async function fetchCustomers(query: CustomerQuery) {
  const { data } = await apiClient.get<PaginatedData<CustomerListItem>>(
    '/customers',
    { params: cleanParams(query) },
  );
  return data;
}

export async function fetchCustomerById(id: string) {
  const { data } = await apiClient.get<CustomerDetail>(`/customers/${id}`);
  return data;
}
