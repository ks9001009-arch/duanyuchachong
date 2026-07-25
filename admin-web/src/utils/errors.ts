import axios from 'axios';

export function getErrorMessage(error: unknown, fallback = '请求失败'): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return '无法连接服务器，请稍后重试';
    }
    const data = error.response.data as { message?: string | string[]; success?: boolean };
    if (typeof data?.message === 'string' && data.message.trim()) {
      return data.message;
    }
    if (Array.isArray(data?.message) && data.message.length > 0) {
      return data.message.join('; ');
    }
    if (error.response.status === 401) {
      return '未授权，请重新登录';
    }
    return fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}
