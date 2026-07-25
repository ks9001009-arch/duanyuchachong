import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { clearAuthStorage, getAccessToken } from '@/utils/auth-storage';

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
};

let redirectingToLogin = false;

export const apiClient = axios.create({
  baseURL: '/api/admin',
  timeout: 15_000,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => {
    const body = response.data as ApiEnvelope<unknown>;
    if (body && typeof body === 'object' && 'success' in body) {
      if (body.success === false) {
        const err = new axios.AxiosError(
          body.message || '请求失败',
          String(response.status),
          response.config,
          response.request,
          {
            ...response,
            data: body,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            config: response.config,
          },
        );
        return Promise.reject(err);
      }
      response.data = body.data;
    }
    return response;
  },
  (error: AxiosError<ApiEnvelope<unknown>>) => {
    if (error.response?.status === 401) {
      clearAuthStorage();
      if (
        typeof window !== 'undefined' &&
        !window.location.pathname.startsWith('/login') &&
        !redirectingToLogin
      ) {
        redirectingToLogin = true;
        try {
          window.location.assign('/login');
        } catch {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  },
);

export function resetLoginRedirectFlag(): void {
  redirectingToLogin = false;
}
