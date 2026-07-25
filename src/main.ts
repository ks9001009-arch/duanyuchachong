import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { TelegramBotService } from './telegram/telegram-bot.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  // 必须先监听 PORT，再启动 Long Polling。
  // 否则 Telegram getMe/网络稍慢时，Render 端口扫描会超时（No open ports detected）。
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
  console.error('启动失败:', error);
  process.exit(1);
});
