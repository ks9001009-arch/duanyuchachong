import { Module } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { CustomerModule } from '../customer/customer.module';

@Module({
  imports: [CustomerModule],
  providers: [TelegramBotService],
  exports: [TelegramBotService],
})
export class TelegramModule {}
