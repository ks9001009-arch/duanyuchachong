import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AppConfigService } from '../config/app-config.service';
import { AppConfigModule } from '../config/app-config.module';
import { CustomerModule } from '../customer/customer.module';
import { AdminBootstrapService } from './bootstrap/admin-bootstrap.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtStrategy } from './auth/jwt.strategy';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { AdminCustomersController } from './customers/admin-customers.controller';
import { AdminCustomersService } from './customers/admin-customers.service';
import { AdminPendingController } from './pending/admin-pending.controller';
import { AdminPendingService } from './pending/admin-pending.service';
import { AdminLogsController } from './logs/admin-logs.controller';
import { AdminLogsService } from './logs/admin-logs.service';
import { AdminExportController } from './export/admin-export.controller';
import { AdminExportService } from './export/admin-export.service';
import { AdminImportController } from './import/admin-import.controller';
import { AdminImportService } from './import/admin-import.service';

@Module({
  imports: [
    CustomerModule,
    AppConfigModule,
    PassportModule.register({ defaultStrategy: 'admin-jwt' }),
    JwtModule.registerAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.adminJwtSecret,
        signOptions: {
          expiresIn: config.adminJwtExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
        },
      }),
    }),
  ],
  controllers: [
    AuthController,
    DashboardController,
    AdminCustomersController,
    AdminPendingController,
    AdminLogsController,
    AdminExportController,
    AdminImportController,
  ],
  providers: [
    AdminBootstrapService,
    AuthService,
    JwtStrategy,
    DashboardService,
    AdminCustomersService,
    AdminPendingService,
    AdminLogsService,
    AdminExportService,
    AdminImportService,
  ],
})
export class AdminModule {}
