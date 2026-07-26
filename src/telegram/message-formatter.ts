import {
  PendingTelegramCustomer,
  TelegramCustomer,
} from '@prisma/client';
import {
  archiveLinkText,
  failureReasonLabel,
  formatDateTime,
  sourceLabel,
} from '../common/utils';
import { GROUP_ID_UPLOAD_REMINDER } from '../customer/group-lead-parse';

export function formatCreatedReply(
  customer: TelegramCustomer,
  archiveMode: 'hint' | 'url' = 'hint',
): string {
  return [
    '✅ 客户录入成功',
    '',
    `客户编号：${customer.customerCode}`,
    `Telegram ID：`,
    `${customer.telegramId.toString()}`,
    `用户名：${customer.username ? `@${customer.username}` : '无'}`,
    `昵称：${customer.displayName ?? '无'}`,
    `电话：${customer.phone ?? '无'}`,
    '',
    `首次录入员：${customer.firstImportedName ?? customer.firstImportedUsername ?? customer.firstImportedById.toString()}`,
    `首次录入时间：${formatDateTime(customer.firstImportedAt)}`,
    `录入来源：${sourceLabel(customer.firstImportSource)}`,
    `存档：${archiveLinkText(customer.archiveMessageLink, archiveMode)}`,
  ].join('\n');
}

export function formatDuplicateReply(
  customer: TelegramCustomer,
  archiveMode: 'hint' | 'url' = 'hint',
): string {
  return [
    '⚠️ 该客户已经存在',
    '',
    `客户编号：${customer.customerCode}`,
    `Telegram ID：`,
    `${customer.telegramId.toString()}`,
    `用户名：${customer.username ? `@${customer.username}` : '无'}`,
    `昵称：${customer.displayName ?? '无'}`,
    `电话：${customer.phone ?? '无'}`,
    '',
    `首次录入员：${customer.firstImportedName ?? customer.firstImportedUsername ?? customer.firstImportedById.toString()}`,
    `首次录入时间：${formatDateTime(customer.firstImportedAt)}`,
    `首次录入来源：${sourceLabel(customer.firstImportSource)}`,
    `存档：${archiveLinkText(customer.archiveMessageLink, archiveMode)}`,
    '',
    '本次操作：未重复写入',
  ].join('\n');
}

export function formatPendingCreatedReply(
  pending: PendingTelegramCustomer,
  archiveMode: 'hint' | 'url' = 'hint',
): string {
  return [
    '⏳ 已创建待确认客户',
    '',
    `临时编号：${pending.pendingCode}`,
    `可见昵称：${pending.visibleName ?? '无'}`,
    'Telegram ID：暂未取得',
    '',
    `原因：${failureReasonLabel(pending.failureReason)}`,
    `录入员：${pending.operatorDisplayName ?? pending.operatorUsername ?? pending.operatorTelegramId.toString()}`,
    '状态：等待补充 Telegram ID',
    '',
    `存档：${archiveLinkText(pending.archiveMessageLink, archiveMode)}`,
  ].join('\n');
}

export function formatHiddenForwardReply(
  pending: PendingTelegramCustomer,
): string {
  return [
    '⚠️ 暂时无法获得客户 Telegram ID',
    '',
    '原因：客户隐藏了转发来源。',
    '',
    '已保存为待确认客户。',
    '',
    `临时编号：${pending.pendingCode}`,
    `可见昵称：${pending.visibleName ?? '无'}`,
    `录入员：${pending.operatorDisplayName ?? pending.operatorUsername ?? pending.operatorTelegramId.toString()}`,
    '状态：等待补充 Telegram ID',
    '',
    '后续可以通过“选择客户”完成身份确认。',
  ].join('\n');
}

export function formatIdentifiedArchiveCard(customer: TelegramCustomer): string {
  return [
    '━━━━━━━━━━━━━━━━━━',
    '📥 正式客户录入',
    '',
    `系统编号：${customer.customerCode}`,
    '',
    'Telegram ID：',
    customer.telegramId.toString(),
    '',
    '用户名：',
    customer.username ? `@${customer.username}` : '无',
    '',
    '昵称：',
    customer.displayName ?? '无',
    '',
    '电话：',
    customer.phone ?? '无',
    '',
    '状态：',
    '已确认',
    '',
    '首次录入员：',
    `${customer.firstImportedName ?? '未知'}（${customer.firstImportedById.toString()}）`,
    '',
    '首次录入时间：',
    formatDateTime(customer.firstImportedAt),
    '',
    '录入来源：',
    sourceLabel(customer.firstImportSource),
    '━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}

export function formatPendingArchiveCard(
  pending: PendingTelegramCustomer,
): string {
  return [
    '━━━━━━━━━━━━━━━━━━',
    '⏳ 待确认客户',
    '',
    '临时编号：',
    pending.pendingCode,
    '',
    '可见昵称：',
    pending.visibleName ?? '无',
    '',
    'Telegram ID：',
    '暂未取得',
    '',
    '原因：',
    failureReasonLabel(pending.failureReason),
    '',
    '录入员：',
    `${pending.operatorDisplayName ?? '未知'}（${pending.operatorTelegramId.toString()}）`,
    '',
    '录入时间：',
    formatDateTime(pending.createdAt),
    '',
    '状态：',
    '等待补充 Telegram ID',
    '━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}

export function formatResolvedReply(params: {
  pendingCode: string;
  telegramId: bigint;
  customerCode: string;
}): string {
  return [
    '✅ 待确认客户已完成身份确认',
    '',
    `临时编号：${params.pendingCode}`,
    `Telegram ID：${params.telegramId.toString()}`,
    `正式客户编号：${params.customerCode}`,
    '状态：已转为正式客户',
  ].join('\n');
}

export function formatMergedReply(params: {
  pendingCode: string;
  telegramId: bigint;
  customer: TelegramCustomer;
}): string {
  return [
    '⚠️ 该 Telegram ID 已经存在',
    '',
    `临时编号：${params.pendingCode}`,
    `Telegram ID：${params.telegramId.toString()}`,
    `已有客户编号：${params.customer.customerCode}`,
    `首次录入员：${params.customer.firstImportedName ?? params.customer.firstImportedUsername ?? params.customer.firstImportedById.toString()}`,
    `首次录入时间：${formatDateTime(params.customer.firstImportedAt)}`,
    '',
    '待确认记录已合并到已有客户。',
  ].join('\n');
}

export function formatResolvedArchiveReply(params: {
  telegramId: bigint;
  customerCode: string;
  operatorName: string;
  resolvedAt: Date;
}): string {
  return [
    '✅ 身份确认完成',
    '',
    `Telegram ID：${params.telegramId.toString()}`,
    `正式客户编号：${params.customerCode}`,
    `确认操作员：${params.operatorName}`,
    `确认时间：${formatDateTime(params.resolvedAt)}`,
  ].join('\n');
}

export function formatCustomerQuery(
  customer: TelegramCustomer,
  archiveMode: 'hint' | 'url' = 'hint',
): string {
  return [
    '✅ 查询到正式客户',
    '',
    `客户编号：${customer.customerCode}`,
    `Telegram ID：${customer.telegramId.toString()}`,
    `用户名：${customer.username ? `@${customer.username}` : '无'}`,
    `昵称：${customer.displayName ?? '无'}`,
    `电话：${customer.phone ?? '无'}`,
    '状态：已确认',
    '',
    `首次录入时间：${formatDateTime(customer.firstImportedAt)}`,
    `首次录入员：${customer.firstImportedName ?? customer.firstImportedUsername ?? customer.firstImportedById.toString()}`,
    `存档：${archiveLinkText(customer.archiveMessageLink, archiveMode)}`,
  ].join('\n');
}

export function formatPendingQuery(
  pending: PendingTelegramCustomer,
  archiveMode: 'hint' | 'url' = 'hint',
): string {
  const statusMap: Record<string, string> = {
    PENDING_ID: '等待补充 Telegram ID',
    RESOLVED: '已转为正式客户',
    MERGED: '已合并到正式客户',
    CANCELLED: '已取消',
  };
  return [
    '⏳ 待确认客户',
    '',
    `临时编号：${pending.pendingCode}`,
    `可见昵称：${pending.visibleName ?? '无'}`,
    `状态：${statusMap[pending.status] ?? pending.status}`,
    `录入员：${pending.operatorDisplayName ?? pending.operatorUsername ?? pending.operatorTelegramId.toString()}`,
    `录入时间：${formatDateTime(pending.createdAt)}`,
    `存档：${archiveLinkText(pending.archiveMessageLink, archiveMode)}`,
  ].join('\n');
}

export function formatHelpText(): string {
  return [
    'ℹ️ 使用说明',
    '',
    '【精准查重录入 · Telegram ID】',
    '1. 选择客户 / 批量选择 / 转发消息',
    '2. /id <TelegramID>  /pending <P编号>',
    '3. /resolve P000123 123456789',
    '',
    '【群聊自动查重录入】',
    '4. 把机器人拉进群并设为管理员',
    '5. 群管理员发送：绑定数据群（或 /bind）',
    '6. 之后直接发客户资料（含 @用户名 和/或 电话）即可自动查重录入',
    '7. 收到回复后，请用接待号私聊机器人补充该客户 Telegram ID',
    '8. 解绑发送：解绑数据群（或 /unbind）',
    '',
    '注意：',
    '- 正式客户以 Telegram ID 唯一查重（百分百）',
    '- 群内按用户名/昵称/电话为辅助查重',
    '- 已绑定群内任意成员发送即可',
  ].join('\n');
}

export function formatGroupImportHitReply(params: {
  customers: TelegramCustomer[];
  pendings: PendingTelegramCustomer[];
}): string {
  const lines = [
    '⚠️ 查重命中：数据疑似已存在，未重复录入',
    '',
    '说明：按用户名/昵称/电话辅助匹配（非 ID 精准）。',
  ];
  for (const c of params.customers.slice(0, 5)) {
    lines.push(
      `- 正式客户 ${c.customerCode}｜ID ${c.telegramId.toString()}｜${c.username ? `@${c.username}` : '无'}｜${c.displayName ?? '无'}`,
    );
  }
  for (const p of params.pendings.slice(0, 5)) {
    lines.push(
      `- 待确认 ${p.pendingCode}｜${p.visibleUsername ? `@${p.visibleUsername}` : '无'}｜${p.visibleName ?? '无'}`,
    );
  }
  lines.push('', GROUP_ID_UPLOAD_REMINDER);
  return lines.join('\n');
}

export function formatGroupImportPendingReply(
  pending: PendingTelegramCustomer,
): string {
  return [
    '✅ 查重未命中，已录入为待确认客户',
    '',
    `临时编号：${pending.pendingCode}`,
    `用户名：${pending.visibleUsername ? `@${pending.visibleUsername}` : '无'}`,
    `昵称：${pending.visibleName ?? '无'}`,
    `备注：${pending.note ?? '无'}`,
    '',
    GROUP_ID_UPLOAD_REMINDER,
    '',
    `也可：/resolve_select ${pending.pendingCode}`,
    `存档：${archiveLinkText(pending.archiveMessageLink, 'hint')}`,
  ].join('\n');
}

export function formatMainMenuText(): string {
  return [
    '📋 Telegram 客户查重录入',
    '',
    '请选择操作：',
    '群内可直接发送：用户名 / 名字 / 电话，自动查重并录入',
  ].join('\n');
}
