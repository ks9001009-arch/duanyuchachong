import { getAccessToken } from '@/utils/auth-storage';

export type TelegramHtmlImportResult = {
  files: number;
  parsed: number;
  created: number;
  skipped: number;
  failed: number;
  errors: string[];
};

export async function importTelegramHtmlFiles(
  files: File[],
): Promise<TelegramHtmlImportResult> {
  const token = getAccessToken();
  const form = new FormData();
  for (const file of files) {
    form.append('files', file);
  }

  const res = await fetch('/api/admin/import/telegram-html', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  const body = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: TelegramHtmlImportResult;
    message?: string;
  } | null;

  if (!res.ok || body?.success === false) {
    throw new Error(body?.message || '导入失败');
  }
  if (!body?.data) {
    throw new Error('导入响应为空');
  }
  return body.data;
}
