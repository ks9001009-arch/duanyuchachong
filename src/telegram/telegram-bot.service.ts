import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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
import { EntryChatService } from './entry-chat.service';
import {
  leadHasContent,
  normalizePhone,
  parseLeadText,
  shouldAutoImportGroupText,
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
  formatGroupImportHitReply,
  formatGroupImportPendingReply,
  formatGroupImportResolvedReply,
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
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot!: Telegraf<Context>;
  private readonly sessions = new OperatorSessionStore();
  private profileSyncTimer: ReturnType<typeof setInterval> | null = null;
  private profileSyncRunning = false;

  constructor(
    private readonly config: AppConfigService,
    private readonly registry: CustomerRegistryService,
    private readonly entryChats: EntryChatService,
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
        this.startProfileSyncLoop();
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
    this.stopProfileSyncLoop();
    if (this.bot) {
      this.bot.stop('shutdown');
    }
  }

  onModuleDestroy() {
    this.stopProfileSyncLoop();
  }

  private registerHandlers() {
    // 群绑定：未绑定的群也要能收到（不走 ensureAuthorized 的录入群校验）
    this.bot.hears(/^绑定数据群$/, async (ctx) => {
      await this.handleBindEntryChat(ctx);
    });
    this.bot.command('bind', async (ctx) => {
      await this.handleBindEntryChat(ctx);
    });
    this.bot.hears(/^解绑数据群$/, async (ctx) => {
      await this.handleUnbindEntryChat(ctx);
    });
    this.bot.command('unbind', async (ctx) => {
      await this.handleUnbindEntryChat(ctx);
    });

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

    // 群聊：成员直接发用户名/名字/电话 → 自动查重并录入（无专用命令）
    this.bot.on(message('users_shared'), async (ctx) => {
      if (!(await this.ensureAuthorized(ctx))) return;
      await this.handleUsersShared(ctx);
    });

    this.bot.on('message', async (ctx) => {
      if (!ctx.message) return;

      // 凡是消息里出现的用户，若已是正式客户则静默同步昵称/用户名
      await this.observeMessageActors(ctx);

      if ('forward_origin' in ctx.message && ctx.message.forward_origin) {
        if (
          !(await this.ensureAuthorized(ctx, { silentUnauthorizedChat: true }))
        ) {
          return;
        }
        await this.handleForward(ctx);
        return;
      }

      if (!('text' in ctx.message) || !ctx.message.text) return;
      // 仅授权群自动处理；私聊仍用菜单/命令做精准录入
      if (!ctx.chat || ctx.chat.type === 'private') return;
      if (!(await this.ensureAuthorized(ctx, { silentUnauthorizedChat: true }))) {
        return;
      }
      await this.handleGroupAutoImport(ctx);
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

  private async handleGroupAutoImport(ctx: Context) {
    const text =
      ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    if (!text?.trim()) return;

    // 跳过命令、菜单按钮文案、绑定口令（由独立 handler 处理）
    if (text.trim().startsWith('/')) return;
    const bindPhrases = new Set([
      '绑定数据群',
      '解绑数据群',
      '/bind',
      '/unbind',
    ]);
    if (bindPhrases.has(text.trim())) return;
    const menuValues = new Set<string>(Object.values(MENU));
    if (menuValues.has(text.trim())) return;
    if (text.includes('返回菜单')) return;

    const input = parseLeadText(text);
    if (!shouldAutoImportGroupText(input) || !leadHasContent(input)) {
      return;
    }

    const sourceChatId = ctx.chat ? BigInt(ctx.chat.id) : null;
    const sourceMessageId =
      ctx.message && 'message_id' in ctx.message
        ? BigInt(ctx.message.message_id)
        : null;
    const operator = this.getOperator(ctx);

    try {
      // 优先：用公开用户名向 Telegram 解析真实 ID，再按 ID 正式录入
      const resolved = input.username
        ? await this.resolveUserByUsername(input.username)
        : null;

      if (resolved) {
        const outcome = await this.registry.checkAndImportIdentifiedCustomer({
          profile: {
            telegramId: resolved.telegramId,
            username: resolved.username || input.username,
            firstName: resolved.firstName,
            lastName: resolved.lastName,
            displayName: input.nickname,
            phone: input.phone,
          },
          operator,
          source: CustomerImportSource.MANUAL_ID,
          sourceChatId,
          sourceMessageId,
        });
        await ctx.reply(
          formatGroupImportResolvedReply({
            customer: outcome.customer,
            created: outcome.kind === 'CREATED',
            profileUpdated: outcome.profileUpdated,
            resolvedUsername: input.username!,
          }),
          plainReplyExtra({ archiveLink: outcome.customer.archiveMessageLink }),
        );
        return;
      }

      const matches = await this.registry.softDedupSearch({
        username: input.username,
        nickname: input.nickname,
        phone: input.phone,
      });

      if (matches.customers.length > 0 || matches.pendings.length > 0) {
        for (const customer of matches.customers) {
          try {
            await this.registry.syncObservedProfile({
              telegramId: customer.telegramId,
              username: input.username,
              displayName: input.nickname,
              phone: input.phone,
            });
          } catch (error) {
            this.logger.warn(
              `群命中后资料同步失败 ${customer.telegramId.toString()}: ${String(error)}`,
            );
          }
        }
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
      if (input.username) {
        noteParts.push('用户名解析ID失败:暂无公开可解析身份');
      }

      const pending = await this.registry.createPendingCustomer({
        visibleName: input.nickname?.trim() || null,
        visibleUsername: input.username?.replace(/^@+/, '').trim() || null,
        note: noteParts.length > 0 ? noteParts.join('；') : null,
        failureReason: PendingFailureReason.MANUAL_PENDING,
        operator,
        sourceChatId,
        sourceMessageId,
        source: CustomerImportSource.MANUAL_ID,
      });

      await ctx.reply(
        formatGroupImportPendingReply(pending),
        plainReplyExtra({ archiveLink: pending.archiveMessageLink }),
      );
    } catch (error) {
      this.logger.warn(
        `群自动查重录入失败：${error instanceof Error ? error.message : String(error)}`,
      );
      await ctx.reply(
        `❌ 查重录入失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * 通过公开用户名尝试解析 Telegram 用户 ID（Bot API getChat）。
   * 仅对 private 用户生效；频道/群用户名或不可达时返回 null。
   */
  private async resolveUserByUsername(username: string): Promise<{
    telegramId: bigint;
    username?: string;
    firstName?: string;
    lastName?: string;
  } | null> {
    const normalized = username.replace(/^@+/, '').trim();
    if (!normalized || !/^[A-Za-z0-9_]{4,}$/.test(normalized)) {
      return null;
    }
    try {
      const chat = await this.bot.telegram.getChat(`@${normalized}`);
      if (chat.type !== 'private') {
        return null;
      }
      const id = typeof chat.id === 'number' ? chat.id : Number(chat.id);
      if (!Number.isFinite(id)) return null;
      return {
        telegramId: BigInt(id),
        username:
          'username' in chat && chat.username
            ? String(chat.username)
            : normalized,
        firstName:
          'first_name' in chat && chat.first_name
            ? String(chat.first_name)
            : undefined,
        lastName:
          'last_name' in chat && chat.last_name
            ? String(chat.last_name)
            : undefined,
      };
    } catch (error) {
      this.logger.debug(
        `用户名 @${normalized} 无法解析为 Telegram ID：${String(error)}`,
      );
      return null;
    }
  }

  private async handleBindEntryChat(ctx: Context) {
    if (!ctx.chat || ctx.chat.type === 'private') {
      await ctx.reply('请在需要录入的群里发送「绑定数据群」（或 /bind）。');
      return;
    }
    if (!ctx.from) return;

    const allowed = await this.canManageEntryBinding(ctx);
    if (!allowed) {
      await ctx.reply(
        '❌ 仅群管理员或系统接待员可绑定数据群。请先将机器人设为管理员后再试。',
      );
      return;
    }

    const chatId = BigInt(ctx.chat.id);
    const title =
      'title' in ctx.chat ? (ctx.chat.title as string | undefined) : undefined;
    const operator = this.getOperator(ctx);

    try {
      const existing = await this.entryChats.getBinding(chatId);
      await this.entryChats.bind({
        chatId,
        title,
        operatorTelegramId: operator.telegramId,
        operatorUsername: operator.username,
        operatorDisplayName: operator.displayName,
      });

      const wasActive = Boolean(existing?.active);
      await ctx.reply(
        [
          wasActive ? '✅ 本群已是数据群（已刷新绑定）' : '✅ 已绑定为数据群',
          '',
          `群 ID：${chatId.toString()}`,
          title ? `群名称：${title}` : null,
          '',
          '现在可在本群直接发送客户资料（含 @用户名 和/或 电话）：',
          '机器人会自动查重；未命中则录入为待确认。',
          '',
          '解绑请发送：解绑数据群',
        ]
          .filter(Boolean)
          .join('\n'),
      );
    } catch (error) {
      this.logger.warn(
        `绑定数据群失败：${error instanceof Error ? error.message : String(error)}`,
      );
      await ctx.reply(
        `❌ 绑定失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async handleUnbindEntryChat(ctx: Context) {
    if (!ctx.chat || ctx.chat.type === 'private') {
      await ctx.reply('请在群里发送「解绑数据群」（或 /unbind）。');
      return;
    }
    if (!ctx.from) return;

    const allowed = await this.canManageEntryBinding(ctx);
    if (!allowed) {
      await ctx.reply('❌ 仅群管理员或系统接待员可解绑数据群。');
      return;
    }

    const chatId = BigInt(ctx.chat.id);
    try {
      if (this.config.isEntryChat(chatId)) {
        await ctx.reply(
          [
            '⚠️ 本群在服务器环境变量 TELEGRAM_ENTRY_CHAT_IDS 中，',
            '命令解绑无法移除该项。请联系管理员改环境变量，或继续使用。',
          ].join('\n'),
        );
        return;
      }

      const result = await this.entryChats.unbind(chatId);
      if (result.kind === 'NOT_FOUND' || result.kind === 'ALREADY_INACTIVE') {
        await ctx.reply('本群当前未绑定为数据群。');
        return;
      }
      await ctx.reply('✅ 已解绑。本群将不再自动查重录入。重新绑定请发送：绑定数据群');
    } catch (error) {
      await ctx.reply(
        `❌ 解绑失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** 群管理员 / 群主 / 环境变量接待员 可绑定 */
  private async canManageEntryBinding(ctx: Context): Promise<boolean> {
    if (!ctx.from || !ctx.chat) return false;
    if (this.config.isOperator(ctx.from.id)) return true;
    try {
      const member = await ctx.getChatMember(ctx.from.id);
      return member.status === 'creator' || member.status === 'administrator';
    } catch (error) {
      this.logger.warn(
        `读取群成员身份失败：${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  private async observeMessageActors(ctx: Context) {
    const candidates: Array<{
      telegramId: bigint;
      username?: string | null;
      firstName?: string | null;
      lastName?: string | null;
    }> = [];

    if (ctx.from) {
      candidates.push({
        telegramId: BigInt(ctx.from.id),
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
      });
    }

    const msg = ctx.message as
      | (Context['message'] & {
          forward_origin?: {
            type: string;
            sender_user?: {
              id: number;
              username?: string;
              first_name?: string;
              last_name?: string;
            };
          };
          users_shared?: {
            users?: SharedUser[];
          };
        })
      | undefined;

    if (msg?.forward_origin?.type === 'user' && msg.forward_origin.sender_user) {
      const u = msg.forward_origin.sender_user;
      candidates.push({
        telegramId: BigInt(u.id),
        username: u.username,
        firstName: u.first_name,
        lastName: u.last_name,
      });
    }

    if (msg?.users_shared?.users) {
      for (const u of msg.users_shared.users) {
        candidates.push({
          telegramId: BigInt(u.user_id),
          username: u.username,
          firstName: u.first_name,
          lastName: u.last_name,
        });
      }
    }

    for (const profile of candidates) {
      try {
        await this.registry.syncObservedProfile(profile, {
          allowClearUsername: true,
        });
      } catch (error) {
        this.logger.debug(
          `观察同步跳过 ${profile.telegramId.toString()}: ${String(error)}`,
        );
      }
    }
  }

  private startProfileSyncLoop() {
    this.stopProfileSyncLoop();
    // 启动后稍晚扫一轮，之后每 10 分钟扫最久未观察的一批
    setTimeout(() => void this.runProfileSyncSweep(), 45_000);
    this.profileSyncTimer = setInterval(
      () => void this.runProfileSyncSweep(),
      10 * 60 * 1000,
    );
    this.logger.log('客户资料定时扫描已启动（每 10 分钟）');
  }

  private stopProfileSyncLoop() {
    if (this.profileSyncTimer) {
      clearInterval(this.profileSyncTimer);
      this.profileSyncTimer = null;
    }
  }

  /**
   * 对库内 Telegram ID 调用 getChat，刷新用户名/昵称。
   * 电话无法由 Bot API 主动拉取，仅在群录入/人工补充时更新。
   */
  private async runProfileSyncSweep() {
    if (!this.bot || this.profileSyncRunning) return;
    this.profileSyncRunning = true;
    let scanned = 0;
    let updated = 0;
    let failed = 0;
    try {
      const batch = await this.registry.listCustomersForSync(150);
      for (const row of batch) {
        scanned += 1;
        try {
          const chat = await this.bot.telegram.getChat(row.telegramId.toString());
          const username =
            chat && 'username' in chat
              ? ((chat.username as string | undefined) ?? null)
              : null;
          const firstName =
            chat && 'first_name' in chat
              ? ((chat.first_name as string | undefined) ?? null)
              : null;
          const lastName =
            chat && 'last_name' in chat
              ? ((chat.last_name as string | undefined) ?? null)
              : null;

          const result = await this.registry.syncObservedProfile(
            {
              telegramId: row.telegramId,
              username,
              firstName,
              lastName,
            },
            { allowClearUsername: true },
          );
          if (result.updated) updated += 1;
        } catch {
          // 用户未与机器人互动 / 隐私限制 / 已注销等，跳过
          failed += 1;
          // 仍刷新 lastObservedAt，避免反复卡在同一批失败 ID
          try {
            await this.registry.syncObservedProfile({
              telegramId: row.telegramId,
            });
          } catch {
            // ignore
          }
        }
        await new Promise((r) => setTimeout(r, 80));
      }
      this.logger.log(
        `客户资料扫描完成：扫描 ${scanned}，更新 ${updated}，不可达 ${failed}`,
      );
    } catch (error) {
      this.logger.warn(
        `客户资料扫描异常：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.profileSyncRunning = false;
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

    // 授权录入群：环境变量白名单 或 命令「绑定数据群」激活的群
    const chatId = BigInt(ctx.chat.id);
    const allowed = await this.entryChats.isEntryChat(chatId);
    if (!allowed) {
      if (!options?.silentUnauthorizedChat) {
        // 未授权群不主动回复（绑定命令另有独立入口）
      }
      return false;
    }

    return true;
  }
}
