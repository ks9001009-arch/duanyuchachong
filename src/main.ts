import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { TelegramBotService } from './telegram/telegram-bot.service';
import { AppConfigService } from './config/app-config.service';
import { AdminBootstrapService } from './admin/bootstrap/admin-bootstrap.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  const config = app.get(AppConfigService);
  config.assertAdminSecretsConfigured();

  // 触发初始管理员创建（OnModuleInit 也会执行；此处确保配置已校验）
  app.get(AdminBootstrapService);

  const corsOrigins = config.adminCorsOrigins;
  if (config.isProduction && corsOrigins.includes('*')) {
    throw new Error('生产环境禁止 ADMIN_CORS_ORIGINS=*');
  }

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (config.enableSwagger) {
    const doc = new DocumentBuilder()
      .setTitle('Telegram Customer Registry Admin API')
      .setDescription('后台管理 API（不含真实 Token/密码）')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));
    Logger.log('Swagger enabled at /api/docs', 'Bootstrap');
  }

  const adminDistCandidates = [
    join(process.cwd(), 'admin-web', 'dist'),
    join(__dirname, '..', 'admin-web', 'dist'),
  ];
  const adminReady = adminDistCandidates.some((dir) =>
    existsSync(join(dir, 'index.html')),
  );
  Logger.log(
    adminReady
      ? `管理后台构建产物已就绪（将由 ServeStatic 托管）`
      : `警告：未找到 admin-web/dist/index.html，前端路由将 404。candidates=${adminDistCandidates.join(' | ')}`,
    'Bootstrap',
  );

  // 必须先监听 PORT，再启动 Long Polling。
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`HTTP listening on ${port}`);

  const bot = app.get(TelegramBotService);
  // Bot 启动失败不拖垮 HTTP（健康检查 / 管理后台仍可用），后台持续重试
  void startTelegramBotWithRetry(bot);

  const shutdown = async (signal: string) => {
    Logger.log(`收到 ${signal}，正在关闭...`, 'Bootstrap');
    await bot.stop();
    await app.close();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

async function startTelegramBotWithRetry(bot: TelegramBotService): Promise<void> {
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      await bot.start();
      Logger.log('Telegram Customer Registry Bot 已启动（long polling）', 'Bootstrap');
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const delayMs = Math.min(3000 * attempt, 30_000);
      Logger.error(
        `Telegram Bot 启动失败（第 ${attempt} 次）：${message}；${delayMs}ms 后重试`,
        undefined,
        'Bootstrap',
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

bootstrap().catch((error: unknown) => {
  console.error('启动失败:', error instanceof Error ? error.message : error);
  process.exit(1);
});
