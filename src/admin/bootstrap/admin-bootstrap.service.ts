import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';

@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async onModuleInit() {
    this.config.assertAdminSecretsConfigured();

    const count = await this.prisma.adminUser.count();
    if (count > 0) {
      this.logger.log(`管理员账号已存在（${count}），跳过初始化`);
      return;
    }

    const username = this.config.adminInitialUsername;
    const password = this.config.adminInitialPassword;
    const passwordHash = await bcrypt.hash(password, 12);

    await this.prisma.adminUser.create({
      data: {
        username,
        passwordHash,
        displayName: '管理员',
        passwordChangedAt: new Date(),
      },
    });

    this.logger.log(`已创建初始管理员账号：${username}`);
  }
}
