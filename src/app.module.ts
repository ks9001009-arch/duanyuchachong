import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfigService } from './config/app-config.service';
import { PrismaModule } from './prisma/prisma.module';
import { CounterModule } from './counter/counter.module';
import { CustomerModule } from './customer/customer.module';
import { TelegramModule } from './telegram/telegram.module';
import { AdminModule } from './admin/admin.module';
import { HealthController } from './health.controller';
import { AdminExceptionFilter } from './admin/common/admin-exception.filter';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    CounterModule,
    CustomerModule,
    TelegramModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    AppConfigService,
    {
      provide: APP_FILTER,
      useClass: AdminExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [AppConfigService],
})
export class AppModule {}
