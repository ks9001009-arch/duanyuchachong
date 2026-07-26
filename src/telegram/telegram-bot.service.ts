import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import {
  CustomerImportResult,
  CustomerImportSource,
  PendingFailureReason,
  PendingTelegramCustomer,
  TelegramCustomer,
} from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';
import { CustomerRegistryService } from '../customer/customer-registry.service';
import {
  leadHasContent,
  normalizePhone,
  parseLeadText,
} from '../customer/group-lead-parse';
import { buildDisplayName, buildTelegramMessageLink, formatDateTime } from '../common/utils';
import {
  batchUserPickerKeyboard,
  createRequestId,
  mainMenuKeyboard,
  MENU,
  resolveSelectKeyboard,
  singleUserPickerKeyboard,
} from './keyboards';
import {
  formatCreatedReply,
  formatCustomerQuery,
  formatDuplicateReply,
  formatGroupDedupReply,
  formatGroupImportHitReply,
  formatGroupImportPendingReply,
  formatHelpText,
  formatHiddenForwardReply,
  formatIdentifiedArchiveCard,
  formatMainMenuText,
  formatMergedReply,
  formatPendingArchiveCard,
  formatPendingCreatedReply,
  formatPendingQuery,
  formatResolvedArchiveReply,
  formatResolvedReply,
} from './message-formatter';
import { OperatorSessionStore } from './operator-session.store';
import { plainReplyExtra } from './reply-options';
import { isTelegramGetUpdatesConflict } from './telegram-errors';

type SharedUser = {
  user_id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

@Injectable()
export class TelegramBotService implements OnModuleInit {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot!: Telegraf<Context>;
  private readonly sessions = new OperatorSessionStore();

  constructor(
    private readonly config: AppConfigService,
    private readonly registry: CustomerRegistryService,
  ) {}

  onModuleInit() {
    this.registry.setArchiveSender({
      sendIdentifiedArchive: (customer) => this.sendIdentifiedArchive(customer),
      sendPendingArchive: (pending) => this.sendPendingArchive(pending),
      replyPendingResolved: (params) => this.replyPendingResolved(params),
    });
  }

  async start() {
    this.bot = new Telegraf(this.config.botToken);
    this.registerHandlers();

    // 清掉可能残留的 webhook，避免与 long polling 冲突
    try {
      await this.bot.telegram.deleteWebhook({ drop_pending_updates: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`deleteWebhook 失败（可忽略）：${message}`);
    }

    const maxAttempts = 12;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.bot.launch({ dropPendingUpdates: true });
        this.logger.log('Telegraf long polling 已启动');
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const conflict = isTelegramGetUpdatesConflict(message);

        if (!conflict || attempt === maxAttempts) {
          throw error;
        }

        // Render 滚动发布时旧实例可能尚未释放 getUpdates，退避重试
        const delayMs = Math.min(1500 * attempt, 12_000);
        this.logger.warn(
          `Telegram getUpdates 冲突 (409)，${delayMs}ms 后重试 (${attempt}/${maxAttempts})：${message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  async stop() {
    if (this.bot) {
      this.bot.stop('shutdown');
    }
  }

  private registerHandlers() {
    this.bot.start(async (ctx) => {
      if (!(await this.ensureAuthorized(ctx))) return;
      await ctx.reply(formatMainMenuText(), mainMenuKeyboard());
    });

    this.bot.hears(MENU.PICK_SINGLE, async (ctx) => {
      if (!(await this.ensureAuthorized(ctx))) return;
      const requestId = createRequestId();
      const operatorId = BigInt(ctx.from!.id);
      this.sessions.set(operatorId, {
        mode: 'USER_PICKER_SINGLE',
        requestId,
        createdAt: Date.now(),
      });
      await ctx.reply(
        '请点击下方按钮，选择一位客户进行查重录入：',
        singleUserPickerKeyboard(requestId),
      );
    });

    this.bot.hears(MENU.PICK_BATCH, async (ctx) => {
      if (!(await this.ensureAuthorized(ctx))) return;
      const requestId = createRequestId();
      const operatorId = BigInt(ctx.from!.id);
      this.sessions.set(operatorId, {
        mode: 'USER_PICKER_BATCH',
        requestId,
        createdAt: Date.now(),
      });
      await ctx.reply(
        '请点击下方按钮，批量选择客户（最多 10 人）：',
        batchUserPickerKeyboard(requestId),
      );
    });

    this.bot.hears(MENU.FORWARD_HINT, async (ctx) => {
      if (!(await this.ensureAuthorized(ctx))) return;
      await ctx.reply(
        [
          '↪️ 转发客户消息',
          '',
          '请将客户消息转发给本机器人（私聊任意用户可用），或在授权录入群内由授权接待员转发。',
          '若客户隐藏了转发来源，将保存为待确认客户。',
        ].join('\n'),
        mainMenuKeyboard(),
      );
    });

    this.bot.hears(MENU.PENDING_LIST, async (ctx) => {
      if (!(await this.ensureAuthorized(ctx))) return;
      const list = await this.registry.listPending(15);
      if (list.length === 0) {
        await ctx.reply('当前没有待确认客户。', mainMenuKeyboard());
        return;
      }
      const lines = list.map(
        (p, i) =>
          `${i + 1}. ${p.pendingCode}｜${p.visibleName ?? '无昵称'}｜${formatDateTime(p.createdAt)}`,
      );
      await ctx.reply(
        [
          '⏳ 待确认客户（最近15条）',
          '',
          ...lines,
          '',
          '补充身份：',
          '/resolve P编号 TelegramID',
          '或 /resolve_select P编号',
        ].join('\n'),
        mainMenuKeyboard(),
      );
    });

    this.bot.hears(MENU.QUERY_HINT, async (ctx) => {
      if (!(await this.ensureAuthorized(ctx))) return;
      await ctx.reply(
        [
          '🔎 查询客户',
          '',
          '/id <TelegramID> — 精准查询正式客户',
          '/pending <P编号> — 查询待确认客户',
          '/username <用户名> — 用户名辅助查询',
          '/name <昵称> — 昵称模糊查询（仅供辅助）',
        ].join('\n'),
        mainMenuKeyboard(),
      );
    });

    this.bot.hears(MENU.HELP, async (ctx) => {
      if (!(await this.ensureAuthorized(ctx))) return;
      await ctx.reply(formatHelpText(), mainMenuKeyboard());
    });

    this.bot.hears(MENU.RESOLVE_SELECT, async (ctx) => {
      if (!(await this.ensureAuthorized(ctx))) return;
      await ctx.reply(
        '请发送：/resolve_select P000123\n然后选择对应客户完成身份确认。',
        mainMenuKeyboard(),
      );
    });

    this.bot.hears('↩️ 返回菜单', async (ctx) => {
      if (!(await this.ensureAuthorized(ctx))) return;
      if (ctx.from) this.sessions.clear(BigInt(ctx.from.id));
      await ctx.reply(formatMainMenuText(), mainMenuKeyboard());
    });

    this.bot.command('id', async (ctx) => {
      if (!(await this.ensureAuthorized(ctx))) return;
      const arg = this.getCommandArg(ctx);
      if (!arg || !/^-?\d+$/.test(arg)) {
        await ctx.reply('用法：/id 123456789');
        return;
      }
      const customer = await this.registry.findByTelegramId(BigInt(arg));
      if (!customer) {
        await ctx.reply('❌ 未找到该 Telegram ID 对应的正式客户。');
        return;
      }
      await ctx.reply(
        formatCustomerQuery(customer),
        plainReplyExtra({ archiveLink: customer.archiveMessageLink }),
      );
    });

    this.bot.command('pending', async (ctx) => {
      if (!(await this.ensureAuthorized(ctx))) return;
      const arg = this.getCommandArg(ctx)?.toUpperCase();
      if (!arg || !/^P\d+$/.test(arg)) {
        await ctx.reply('用法：/pending P000123');
        return;
      }
      const pending = await this.registry.findByPendingCode(arg);
      if (!pending) {
        await ctx.reply('❌ 未找到该临时编号对应的待确认客户。');
        return;
      }
      await ctx.reply(
        formatPendingQuery(pending),
        plainReplyExtra({ archiveLink: pending.archiveMessageLink }),
      );
    });

    this.bot.command('username', async (ctx) => {
      if (!(await this.ensureAuthorized(ctx))) return;
      const arg = this.getCommandArg(ctx);
      if (!arg) {
        await ctx.reply('用法：/username zhangsan');
        return;
      }
      const rows = await this.registry.searchByUsername(arg);
      if (rows.length === 0) {
        await ctx.reply('❌ 未找到匹配的用户名记录。');
        return;
      }
      const lines = rows.map((c, i) =>
        [
          `${i + 1}. ${c.customerCode}`,
          `Telegram ID：${c.telegramId.toString()}`,
          `用户名：${c.username ? `@${c.username}` : '无'}`,
          `昵称：${c.displayName ?? '无'}`,
        ].join('\n'),
      );
      await ctx.reply(
        [
          `🔎 找到 ${rows.length} 条可能记录`,
          '',
          '⚠️ 用户名查询仅供辅助，不能作为精准查重结果。',
          '',
          ...lines,
        ].join('\n\n'),
      );
    });

    this.bot.command('name', async (ctx) => {
      if (!(await this.ensureAuthorized(ctx))) return;
      const arg = this.getCommandArg(ctx);
      if (!arg) {
        await ctx.reply('用法：/name 张三');
        return;
      }
      const rows = await this.registry.searchByDisplayName(arg);
      if (rows.length === 0) {
        await ctx.reply('❌ 未找到匹配的昵称记录。');
        return;
      }
      const lines = rows.map((c, i) =>
        [
          `${i + 1}. ${c.customerCode}`,
          `Telegram ID：${c.telegramId.toString()}`,
          `用户名：${c.username ? `@${c.username}` : '无'}`,
          `昵称：${c.displayName ?? '无'}`,
        ].join('\n'),
      );
      await ctx.reply(
        [
          `🔎 找到 ${rows.length} 条可能记录`,
          '',
          '⚠️ 昵称查询仅供辅助，不能作为精准查重结果。',
          '',
          ...lines,
        ].join('\n\n'),
      );
    });

    this.bot.command('resolve', async (ctx) => {
      if (!(await this.ensureAuthorized(ctx))) return;
      const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
      const parts = text.trim().split(/\s+/);
      if (parts.length < 3) {
        await ctx.reply('用法：/resolve P000123 123456789');
        return;
      }
      const pendingCode = parts[1]!.toUpperCase();
      const idRaw = parts[2]!;
      if (!/^P\d+$/.test(pendingCode) || !/^\d+$/.test(idRaw)) {
        await ctx.reply('用法：/resolve P000123 123456789');
        return;
      }
      await this.handleResolve(ctx, pendingCode, BigInt(idRaw));
    });

    this.bot.command('resolve_select', async (ctx) => {
      if (!(await this.ensureAuthorized(ctx))) return;
      const arg = this.getCommandArg(ctx)?.toUpperCase();
      if (!arg || !/^P\d+$/.test(arg)) {
        await ctx.reply('用法：/resolve_select P000123');
        return;
      }
      const pending = await this.registry.findByPendingCode(arg);
      if (!pending) {
        await ctx.reply('❌ 未找到该临时编号。');
        return;
      }
      if (pending.status !== 'PENDING_ID') {
        await ctx.reply(`该记录状态为 ${pending.status}，无法继续补充。`);
        return;
      }
      const requestId = createRequestId();
      this.sessions.set(BigInt(ctx.from!.id), {
        mode: 'RESOLVE_SELECT',
        pendingCode: arg,
        requestId,
        createdAt: Date.now(),
      });
      await ctx.reply(
        `请选择临时编号 ${arg} 对应的客户：`,
        resolveSelectKeyboard(requestId),
      );
    });

    // 群聊查重并录入：/查重 /查 /find ， /录入 /记 /import
    this.bot.hears(
      /^\/(?:查重|查|find|dedup)(?:@\w+)?(?:\s|$)/iu,
      async (ctx) => {
        if (!(await this.ensureAuthorized(ctx))) return;
        await this.handleGroupDedup(ctx);
      },
    );

    this.bot.hears(
      /^\/(?:录入|记|import|lead)(?:@\w+)?(?:\s|[\r\n]|$)/iu,
      async (ctx) => {
        if (!(await this.ensureAuthorized(ctx))) return;
        await this.handleGroupImport(ctx);
      },
    );

    this.bot.on(message('users_shared'), async (ctx) => {
      if (!(await this.ensureAuthorized(ctx))) return;
      await this.handleUsersShared(ctx);
    });

    this.bot.on('message', async (ctx) => {
      if (!ctx.message || !('forward_origin' in ctx.message) || !ctx.message.forward_origin) {
        return;
      }
      if (!(await this.ensureAuthorized(ctx, { silentUnauthorizedChat: true }))) {
        return;
      }
      await this.handleForward(ctx);
    });
  }

  private async handleUsersShared(ctx: Context) {
    const msg = ctx.message;
    if (!msg || !('users_shared' in msg) || !msg.users_shared) return;

    const shared = msg.users_shared as {
      request_id: number;
      users?: SharedUser[];
      user_ids?: number[];
    };
    const operator = this.getOperator(ctx);
    const session = this.sessions.get(operator.telegramId);

    if (!session || session.requestId !== shared.request_id) {
      await ctx.reply('会话已过期或不匹配，请重新从菜单发起选择。', mainMenuKeyboard());
      return;
    }

    const users = this.extractSharedUsers(shared);
    if (users.length === 0) {
      await ctx.reply('❌ 未收到有效用户信息。');
      return;
    }

    if (session.mode === 'RESOLVE_SELECT') {
      const user = users[0]!;
      this.sessions.clear(operator.telegramId);
      await this.handleResolve(ctx, session.pendingCode, BigInt(user.user_id), {
        telegramId: BigInt(user.user_id),
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
      });
      return;
    }

    if (session.mode === 'USER_PICKER_SINGLE') {
      this.sessions.clear(operator.telegramId);
      const user = users[0]!;
      const outcome = await this.registry.checkAndImportIdentifiedCustomer({
        profile: {
          telegramId: BigInt(user.user_id),
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
        },
        operator,
        source: CustomerImportSource.USER_PICKER_SINGLE,
        sourceChatId: BigInt(ctx.chat!.id),
        sourceMessageId: BigInt(msg.message_id),
      });
      const text =
        outcome.kind === 'CREATED'
          ? formatCreatedReply(outcome.customer, 'url')
          : formatDuplicateReply(outcome.customer, 'url');
      await ctx.reply(
        text,
        plainReplyExtra({ replyKeyboard: mainMenuKeyboard() }),
      );
      return;
    }

    if (session.mode === 'USER_PICKER_BATCH') {
      this.sessions.clear(operator.telegramId);
      let created = 0;
      let duplicate = 0;
      let updated = 0;
      let failed = 0;

      for (const user of users) {
        try {
          const outcome = await this.registry.checkAndImportIdentifiedCustomer({
            profile: {
              telegramId: BigInt(user.user_id),
              username: user.username,
              firstName: user.first_name,
              lastName: user.last_name,
            },
            operator,
            source: CustomerImportSource.USER_PICKER_BATCH,
            sourceChatId: BigInt(ctx.chat!.id),
            sourceMessageId: BigInt(msg.message_id),
          });
          if (outcome.kind === 'CREATED') created += 1;
          else if (outcome.profileUpdated) updated += 1;
          else duplicate += 1;
        } catch (error) {
          this.logger.warn(`批量录入失败: ${String(error)}`);
          failed += 1;
        }
      }

      await ctx.reply(
        [
          '📥 批量处理完成',
          '',
          `本次选择：${users.length} 人`,
          `✅ 正式录入：${created} 人`,
          `⚠️ 已经存在：${duplicate} 人`,
          `🔄 资料更新：${updated} 人`,
          `❌ 失败：${failed} 人`,
        ].join('\n'),
        mainMenuKeyboard(),
      );
    }
  }

  private async handleForward(ctx: Context) {
    const msg = ctx.message as Context['message'] & {
      forward_origin?: {
        type: string;
        sender_user?: {
          id: number;
          username?: string;
          first_name?: string;
          last_name?: string;
        };
        sender_user_name?: string;
      };
      message_id: number;
    };
    if (!msg?.forward_origin) return;

    const operator = this.getOperator(ctx);
    const origin = msg.forward_origin;
    const sourceChatId = BigInt(ctx.chat!.id);
    const sourceMessageId = BigInt(msg.message_id);

    if (origin.type === 'user' && origin.sender_user) {
      const user = origin.sender_user;
      const outcome = await this.registry.checkAndImportIdentifiedCustomer({
        profile: {
          telegramId: BigInt(user.id),
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
        },
        operator,
        source: CustomerImportSource.FORWARDED_MESSAGE,
        sourceChatId,
        sourceMessageId,
      });
      const text =
        outcome.kind === 'CREATED'
          ? formatCreatedReply(outcome.customer)
          : formatDuplicateReply(outcome.customer);
      await ctx.reply(
        text,
        plainReplyExtra({ archiveLink: outcome.customer.archiveMessageLink }),
      );
      return;
    }

    if (origin.type === 'hidden_user') {
      const pending = await this.registry.createPendingCustomer({
        visibleName: origin.sender_user_name ?? null,
        failureReason: PendingFailureReason.HIDDEN_FORWARD_ORIGIN,
        operator,
        sourceChatId,
        sourceMessageId,
      });
      await ctx.reply(formatHiddenForwardReply(pending));
      await ctx.reply(
        formatPendingCreatedReply(pending),
        plainReplyExtra({ archiveLink: pending.archiveMessageLink }),
      );
      return;
    }

    if (origin.type === 'channel') {
      await this.registry.writeInvalidLog({
        operator,
        source: CustomerImportSource.FORWARDED_MESSAGE,
        result: CustomerImportResult.INVALID,
        failureReason: 'CHANNEL_FORWARD',
        sourceChatId,
        sourceMessageId,
      });
      await ctx.reply('❌ 该消息来源于频道，不能作为个人客户录入。');
      return;
    }

    if (origin.type === 'chat') {
      await this.registry.writeInvalidLog({
        operator,
        source: CustomerImportSource.FORWARDED_MESSAGE,
        result: CustomerImportResult.INVALID,
        failureReason: 'CHAT_OR_ANONYMOUS_ADMIN',
        sourceChatId,
        sourceMessageId,
      });
      await ctx.reply(
        '❌ 该消息以群组或匿名管理员身份发送，无法识别个人 Telegram ID。',
      );
      return;
    }

    await this.registry.writeInvalidLog({
      operator,
      source: CustomerImportSource.FORWARDED_MESSAGE,
      result: CustomerImportResult.FAILED,
      failureReason: `UNKNOWN_FORWARD_ORIGIN:${origin.type}`,
      sourceChatId,
      sourceMessageId,
    });
    await ctx.reply('❌ 无法识别该转发来源，未创建客户记录。');
  }

  private async handleResolve(
    ctx: Context,
    pendingCode: string,
    telegramId: bigint,
    profile?: {
      telegramId: bigint;
      username?: string;
      firstName?: string;
      lastName?: string;
    },
  ) {
    try {
      const outcome = await this.registry.resolvePendingCustomer({
        pendingCode,
        telegramId,
        operator: this.getOperator(ctx),
        profile,
      });
      if (outcome.kind === 'RESOLVED') {
        await ctx.reply(
          formatResolvedReply({
            pendingCode: outcome.pending.pendingCode,
            telegramId,
            customerCode: outcome.customer.customerCode,
          }),
          mainMenuKeyboard(),
        );
      } else {
        await ctx.reply(
          formatMergedReply({
            pendingCode: outcome.pending.pendingCode,
            telegramId,
            customer: outcome.customer,
          }),
          mainMenuKeyboard(),
        );
      }
    } catch (error) {
      await ctx.reply(`❌ 补充身份失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async sendIdentifiedArchive(customer: TelegramCustomer) {
    const chatId = this.config.archiveChatId;
    const sent = await this.bot.telegram.sendMessage(
      chatId.toString(),
      formatIdentifiedArchiveCard(customer),
    );
    const chat = await this.bot.telegram.getChat(chatId.toString());
    const username =
      chat && 'username' in chat ? (chat.username as string | undefined) : undefined;
    const messageLink = buildTelegramMessageLink({
      chatId,
      messageId: sent.message_id,
      chatUsername: username,
      chatType: chat.type,
    });
    return {
      chatId,
      messageId: BigInt(sent.message_id),
      messageLink,
    };
  }

  private async sendPendingArchive(pending: PendingTelegramCustomer) {
    const chatId = this.config.archiveChatId;
    const sent = await this.bot.telegram.sendMessage(
      chatId.toString(),
      formatPendingArchiveCard(pending),
    );
    const chat = await this.bot.telegram.getChat(chatId.toString());
    const username =
      chat && 'username' in chat ? (chat.username as string | undefined) : undefined;
    const messageLink = buildTelegramMessageLink({
      chatId,
      messageId: sent.message_id,
      chatUsername: username,
      chatType: chat.type,
    });
    return {
      chatId,
      messageId: BigInt(sent.message_id),
      messageLink,
    };
  }

  private async replyPendingResolved(params: {
    archiveChatId: bigint;
    archiveMessageId: bigint;
    telegramId: bigint;
    customerCode: string;
    operatorName: string;
    resolvedAt: Date;
  }) {
    await this.bot.telegram.sendMessage(
      params.archiveChatId.toString(),
      formatResolvedArchiveReply(params),
      { reply_parameters: { message_id: Number(params.archiveMessageId) } },
    );
  }

  private async handleGroupDedup(ctx: Context) {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const keyword = text
      .replace(/^\/(?:查重|查|find|dedup)(?:@\w+)?\s*/iu, '')
      .trim();
    if (!keyword) {
      await ctx.reply('用法：/查重 关键词（用户名、昵称或电话）');
      return;
    }
    const matches = await this.registry.softDedupSearch({ keyword });
    await ctx.reply(
      formatGroupDedupReply({
        keyword,
        customers: matches.customers,
        pendings: matches.pendings,
      }),
    );
  }

  private async handleGroupImport(ctx: Context) {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const input = parseLeadText(
      text.replace(/^\/(?:录入|记|import|lead)/iu, '/记'),
    );
    if (!leadHasContent(input)) {
      await ctx.reply(
        [
          '群聊查重并录入用法：',
          '/录入',
          '用户名: @xxx',
          '昵称: 张三',
          '电话: 09xxxxxxxx',
          '需求: 客户要什么',
          '',
          '流程：先按用户名/昵称/电话查重 → 已存在则提示 → 不存在则写入待确认，再补 Telegram ID。',
          '精准录入请用菜单「选择客户」或转发消息。',
        ].join('\n'),
      );
      return;
    }

    try {
      const matches = await this.registry.softDedupSearch({
        username: input.username,
        nickname: input.nickname,
        phone: input.phone,
      });

      if (matches.customers.length > 0 || matches.pendings.length > 0) {
        await ctx.reply(
          formatGroupImportHitReply({
            customers: matches.customers,
            pendings: matches.pendings,
          }),
        );
        return;
      }

      const noteParts: string[] = [];
      const phone = normalizePhone(input.phone);
      if (phone) noteParts.push(`电话:${phone}`);
      if (input.phone && !phone) noteParts.push(`电话原文:${input.phone.trim()}`);
      if (input.requirement?.trim()) {
        noteParts.push(`需求:${input.requirement.trim()}`);
      }

      const sourceChatId = ctx.chat ? BigInt(ctx.chat.id) : null;
      const sourceMessageId =
        ctx.message && 'message_id' in ctx.message
          ? BigInt(ctx.message.message_id)
          : null;

      const pending = await this.registry.createPendingCustomer({
        visibleName: input.nickname?.trim() || null,
        visibleUsername: input.username?.replace(/^@+/, '').trim() || null,
        note: noteParts.length > 0 ? noteParts.join('；') : null,
        failureReason: PendingFailureReason.MANUAL_PENDING,
        operator: this.getOperator(ctx),
        sourceChatId,
        sourceMessageId,
        source: CustomerImportSource.MANUAL_ID,
      });

      await ctx.reply(
        formatGroupImportPendingReply(pending),
        plainReplyExtra({ archiveLink: pending.archiveMessageLink }),
      );
    } catch (error) {
      await ctx.reply(
        `❌ 录入失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private extractSharedUsers(shared: {
    users?: SharedUser[];
    user_ids?: number[];
  }): SharedUser[] {
    if (shared.users && shared.users.length > 0) {
      return shared.users;
    }
    if (shared.user_ids && shared.user_ids.length > 0) {
      return shared.user_ids.map((id) => ({ user_id: id }));
    }
    return [];
  }

  private getOperator(ctx: Context) {
    const from = ctx.from!;
    return {
      telegramId: BigInt(from.id),
      username: from.username ?? null,
      displayName: buildDisplayName(from.first_name, from.last_name),
    };
  }

  private getCommandArg(ctx: Context): string | undefined {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const parts = text.trim().split(/\s+/);
    return parts.slice(1).join(' ').trim() || undefined;
  }

  private async ensureAuthorized(
    ctx: Context,
    options?: { silentUnauthorizedChat?: boolean },
  ): Promise<boolean> {
    if (!ctx.from) return false;

    // 私聊完全开放
    if (!ctx.chat || ctx.chat.type === 'private') {
      return true;
    }

    // 授权录入群：任意成员可用（含 /记 /查）
    if (!this.config.isEntryChat(BigInt(ctx.chat.id))) {
      if (!options?.silentUnauthorizedChat) {
        // 未授权群不主动回复
      }
      return false;
    }

    return true;
  }
}
