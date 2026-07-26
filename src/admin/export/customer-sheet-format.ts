/** 导出工作表中：用户未设置 Telegram 用户名时的占位文案 */
export const NO_TELEGRAM_USERNAME_LABEL = '【用户未设置电报用户名】';

export const SHEET_HEADERS = [
  '电报昵称',
  '电报用户名',
  '绑定号码',
  '电报ID',
] as const;

export type CustomerSheetFields = {
  displayName?: string | null;
  username?: string | null;
  phone?: string | null;
  telegramId: bigint | string | number;
};

/** 展示用用户名（导出） */
export function displayUsernameForSheet(
  username?: string | null,
): string {
  const trimmed = (username ?? '').trim();
  return trimmed || NO_TELEGRAM_USERNAME_LABEL;
}

/** 一行四列：昵称 / 用户名 / 电话 / ID */
export function toSheetRow(customer: CustomerSheetFields): string[] {
  return [
    (customer.displayName ?? '').trim(),
    displayUsernameForSheet(customer.username),
    (customer.phone ?? '').trim(),
    customer.telegramId.toString(),
  ];
}

/** TXT：昵称-用户名-电话-ID */
export function formatCustomerBackupLine(
  customer: CustomerSheetFields,
): string {
  return toSheetRow(customer).join('-');
}
