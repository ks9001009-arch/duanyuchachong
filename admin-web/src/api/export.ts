import { getAccessToken } from '@/utils/auth-storage';

function parseFilename(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) {
    return fallback;
  }
  const utf8 = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      // fall through
    }
  }
  const plain = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plain?.[1] || fallback;
}

async function downloadExport(
  path: string,
  fallbackName: string,
): Promise<void> {
  const token = getAccessToken();
  const res = await fetch(path, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    let message = '导出失败';
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const filename = parseFilename(
    res.headers.get('Content-Disposition'),
    fallbackName,
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 下载客户工作表 xlsx */
export async function downloadFullBackup(): Promise<void> {
  await downloadExport(
    '/api/admin/export/backup',
    `duanyu-customers-${Date.now()}.xlsx`,
  );
}

/** 下载全量 JSON 系统备份 */
export async function downloadJsonBackup(): Promise<void> {
  await downloadExport(
    '/api/admin/export/backup-json',
    `duanyu-backup-${Date.now()}.json`,
  );
}
