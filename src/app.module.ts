import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService } from './config/app-config.service';
import { PrismaModule } from './prisma/prisma.module';
import { CounterModule } from './counter/counter.module';
import { CustomerModule } from './customer/customer.module';
import { TelegramModule } from './telegram/telegram.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    PrismaModule,
    CounterModule,
    CustomerModule,
    TelegramModule,
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppModule {}
