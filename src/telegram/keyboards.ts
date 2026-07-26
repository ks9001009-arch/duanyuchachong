import { Markup } from 'telegraf';
import { createRequestId } from './operator-session.store';

export const MENU = {
  PICK_SINGLE: '🔍 选择客户查重',
  PICK_BATCH: '📥 批量选择客户',
  FORWARD_HINT: '↪️ 转发客户消息',
  PENDING_LIST: '⏳ 待确认客户',
  QUERY_HINT: '🔎 查询客户',
  QUERY_USER_ID: '🆔 查询用户ID',
  HELP: 'ℹ️ 使用说明',
  RESOLVE_SELECT: '✅ 为待确认客户补充身份',
} as const;

type ReplyKeyboard = ReturnType<typeof Markup.keyboard>;

/** Bot API 较新字段；telegraf 类型可能尚未包含 */
function userRequestExtra(maxQuantity: number) {
  return {
    user_is_bot: false,
    max_quantity: maxQuantity,
    request_name: true,
    request_username: true,
    request_photo: false,
  } as {
    user_is_bot: boolean;
    max_quantity: number;
  };
}

export function mainMenuKeyboard(): ReplyKeyboard {
  return Markup.keyboard([
    [MENU.PICK_SINGLE, MENU.PICK_BATCH],
    [MENU.FORWARD_HINT, MENU.PENDING_LIST],
    [MENU.QUERY_HINT, MENU.QUERY_USER_ID],
    [MENU.HELP, MENU.RESOLVE_SELECT],
  ]).resize();
}

export function singleUserPickerKeyboard(requestId: number): ReplyKeyboard {
  return Markup.keyboard([
    Markup.button.userRequest('👤 选择一位客户', requestId, userRequestExtra(1)),
    Markup.button.text('↩️ 返回菜单'),
  ]).resize();
}

export function batchUserPickerKeyboard(requestId: number): ReplyKeyboard {
  return Markup.keyboard([
    Markup.button.userRequest(
      '👥 批量选择客户（最多10人）',
      requestId,
      userRequestExtra(10),
    ),
    Markup.button.text('↩️ 返回菜单'),
  ]).resize();
}

export function resolveSelectKeyboard(requestId: number): ReplyKeyboard {
  return Markup.keyboard([
    Markup.button.userRequest(
      '👤 选择对应客户以补充身份',
      requestId,
      userRequestExtra(1),
    ),
    Markup.button.text('↩️ 返回菜单'),
  ]).resize();
}

export function queryUserIdKeyboard(requestId: number): ReplyKeyboard {
  return Markup.keyboard([
    Markup.button.userRequest('👤 选择用户以查看 ID', requestId, userRequestExtra(1)),
    Markup.button.text('↩️ 返回菜单'),
  ]).resize();
}

export { createRequestId };
