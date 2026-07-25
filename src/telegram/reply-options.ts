import { Markup } from 'telegraf';

/**
 * 普通业务回复的发送参数：
 * - 不使用 Markdown / HTML parse_mode，避免 username 下划线等破坏解析
 * - 有存档链接且无底部菜单时：用 inline URL 按钮
 * - 若需要底部菜单键盘：同一消息只能有一种 reply_markup，正文应输出明文 URL
 */
export function plainReplyExtra(options?: {
  archiveLink?: string | null;
  replyKeyboard?: object;
}): Record<string, unknown> {
  const base: Record<string, unknown> = {
    link_preview_options: { is_disabled: true },
  };

  if (options?.replyKeyboard) {
    return { ...base, ...options.replyKeyboard };
  }

  if (options?.archiveLink) {
    return {
      ...base,
      ...Markup.inlineKeyboard([
        Markup.button.url('点击查看存档', options.archiveLink),
      ]),
    };
  }

  return base;
}
