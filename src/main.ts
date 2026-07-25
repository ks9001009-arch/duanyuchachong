import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  // 必须先监听 PORT，再启动 Long Polling。
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`HTTP listening on ${port}`);

  const bot = app.get(TelegramBotService);
  await bot.start();
  Logger.log('Telegram Customer Registry Bot 已启动（long polling）', 'Bootstrap');

  const shutdown = async (signal: string) => {
    Logger.log(`收到 ${signal}，正在关闭...`, 'Bootstrap');
    await bot.stop();
    await app.close();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((error: unknown) => {
  console.error('启动失败:', error instanceof Error ? error.message : error);
  process.exit(1);
});
