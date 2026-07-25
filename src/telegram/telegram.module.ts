import { Module } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { CustomerModule } from '../customer/customer.module';
import { AppConfigService } from '../config/app-config.service';

@Module({
  imports: [CustomerModule],
  providers: [TelegramBotService, AppConfigService],
  exports: [TelegramBotService],
})
export class TelegramModule {}
