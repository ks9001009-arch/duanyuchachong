import { apiClient } from './client';
import type { AdminProfile, LoginResult } from '@/types/api';

export async function loginApi(username: string, password: string) {
  const { data } = await apiClient.post<LoginResult>('/auth/login', {
    username,
    password,
  });
  return data;
}

export async function fetchMe() {
  const { data } = await apiClient.get<AdminProfile>('/auth/me');
  return data;
}

export async function changePasswordApi(oldPassword: string, newPassword: string) {
  const { data } = await apiClient.post<{ message: string }>(
    '/auth/change-password',
    { oldPassword, newPassword },
  );
  return data;
}
