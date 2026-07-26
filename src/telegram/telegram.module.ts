import { Module } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { EntryChatService } from './entry-chat.service';
import { CustomerModule } from '../customer/customer.module';
import { AppConfigModule } from '../config/app-config.module';

@Module({
  imports: [CustomerModule, AppConfigModule],
  providers: [TelegramBotService, EntryChatService],
  exports: [TelegramBotService, EntryChatService],
})
export class TelegramModule {}
