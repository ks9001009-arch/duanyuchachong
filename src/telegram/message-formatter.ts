import {
  PendingTelegramCustomer,
  TelegramCustomer,
  GroupLead,
} from '@prisma/client';
import {
  archiveLinkText,
  failureReasonLabel,
  formatDateTime,
  sourceLabel,
} from '../common/utils';
import type { SoftMatchResult } from '../customer/group-lead.service';

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
    '【精准查重 · Telegram ID】',
    '1. 选择客户查重 / 批量选择 / 转发消息',
    '2. /id <TelegramID>  /pending <P编号>',
    '3. /username <用户名>  /name <昵称>（仅辅助）',
    '4. /resolve P000123 123456789',
    '',
    '【群线索 · 软记录】',
    '5. /记  — 记录用户名/昵称/电话/需求（可多行）',
    '6. /查 <关键词> — 按用户名/昵称/电话软查询',
    '',
    '注意：',
    '- 正式客户以 Telegram ID 唯一查重（百分百）',
    '- 群线索按用户名/昵称/电话软匹配，可能误报，仅供参考',
    '- 授权录入群内任意成员可用 /记 /查；未授权群不响应',
    '- 私聊消息无法生成跨接待员通用链接',
  ].join('\n');
}

export function formatLeadCreatedReply(
  lead: GroupLead,
  softMatches: SoftMatchResult,
): string {
  const lines = [
    '📝 群线索已记录',
    '',
    `线索编号：${lead.leadCode}`,
    `用户名：${lead.username ? `@${lead.username}` : '无'}`,
    `昵称：${lead.nickname ?? '无'}`,
    `电话：${lead.phone ?? '无'}`,
    `需求：${lead.requirement ?? '无'}`,
    `录入员：${lead.operatorDisplayName ?? lead.operatorUsername ?? lead.operatorTelegramId.toString()}`,
    `存档：${archiveLinkText(lead.archiveMessageLink, 'hint')}`,
    '',
    '说明：此为软记录，不是 Telegram ID 精准客户。',
  ];

  if (softMatches.customers.length > 0 || softMatches.leads.some((x) => x.id !== lead.id)) {
    lines.push('', '⚠️ 疑似重复（非 ID 精准查重）：');
    for (const c of softMatches.customers.slice(0, 5)) {
      lines.push(
        `- 正式客户 ${c.customerCode}｜${c.username ? `@${c.username}` : '无用户名'}｜${c.displayName ?? '无昵称'}`,
      );
    }
    for (const l of softMatches.leads.filter((x) => x.id !== lead.id).slice(0, 5)) {
      lines.push(
        `- 线索 ${l.leadCode}｜${l.username ? `@${l.username}` : '无'}｜${l.nickname ?? '无'}｜${l.phone ?? '无电话'}`,
      );
    }
  }

  return lines.join('\n');
}

export function formatLeadSearchReply(matches: SoftMatchResult, keyword: string): string {
  if (matches.customers.length === 0 && matches.leads.length === 0) {
    return [
      '🔍 软查询无结果',
      '',
      `关键词：${keyword}`,
      '',
      '说明：按用户名/昵称/电话匹配，非 Telegram ID 精准查重。',
    ].join('\n');
  }

  const lines = [
    '🔍 软查询结果（疑似匹配，仅供参考）',
    '',
    `关键词：${keyword}`,
  ];

  if (matches.customers.length > 0) {
    lines.push('', '正式客户：');
    for (const c of matches.customers.slice(0, 8)) {
      lines.push(
        `- ${c.customerCode}｜ID ${c.telegramId.toString()}｜${c.username ? `@${c.username}` : '无'}｜${c.displayName ?? '无'}`,
      );
    }
  }

  if (matches.leads.length > 0) {
    lines.push('', '群线索：');
    for (const l of matches.leads.slice(0, 8)) {
      lines.push(
        `- ${l.leadCode}｜${l.username ? `@${l.username}` : '无'}｜${l.nickname ?? '无'}｜${l.phone ?? '无电话'}｜${l.requirement ?? '无需求'}`,
      );
    }
  }

  return lines.join('\n');
}

export function formatLeadArchiveCard(lead: GroupLead): string {
  return [
    '📝 群线索存档',
    '',
    `线索编号：${lead.leadCode}`,
    `用户名：${lead.username ? `@${lead.username}` : '无'}`,
    `昵称：${lead.nickname ?? '无'}`,
    `电话：${lead.phone ?? '无'}`,
    `需求：${lead.requirement ?? '无'}`,
    `录入员：${lead.operatorDisplayName ?? lead.operatorUsername ?? lead.operatorTelegramId.toString()}`,
    `时间：${formatDateTime(lead.createdAt)}`,
    lead.matchedCustomerId
      ? `关联正式客户：${lead.matchedCustomerId}`
      : '关联正式客户：无',
  ].join('\n');
}

export function formatMainMenuText(): string {
  return [
    '📋 Telegram 客户查重录入',
    '',
    '请选择操作：',
    '（群内也可用 /记 /查 记录用户名·昵称·电话·需求）',
  ].join('\n');
}
