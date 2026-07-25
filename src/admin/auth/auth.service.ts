import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AdminUserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { ChangePasswordDto, LoginDto } from './dto/auth.dto';
import { AuthAdmin } from './jwt.strategy';
import { ok } from '../common/admin-response';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async login(
    dto: LoginDto,
    meta: { ipAddress?: string; userAgent?: string },
  ) {
    const username = dto.username.trim();
    const admin = await this.prisma.adminUser.findUnique({
      where: { username },
    });

    const invalid = async (reason: string) => {
      await this.writeLoginLogSafely({
        adminUserId: admin?.id ?? null,
        username,
        success: false,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
        failureReason: reason,
      });
      throw new UnauthorizedException('用户名或密码错误');
    };

    if (!admin || admin.status !== AdminUserStatus.ACTIVE) {
      await invalid(!admin ? 'USER_NOT_FOUND' : 'USER_DISABLED');
    }

    const matched = await bcrypt.compare(dto.password, admin!.passwordHash);
    if (!matched) {
      await invalid('BAD_PASSWORD');
    }

    await this.prisma.adminUser.update({
      where: { id: admin!.id },
      data: { lastLoginAt: new Date() },
    });

    await this.writeLoginLogSafely({
      adminUserId: admin!.id,
      username: admin!.username,
      success: true,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    });

    const expiresIn = this.config.adminJwtExpiresIn;
    const accessToken = await this.jwt.signAsync(
      { sub: admin!.id, username: admin!.username },
      { expiresIn: expiresIn as `${number}${'s' | 'm' | 'h' | 'd'}` },
    );

    return ok({
      accessToken,
      expiresIn,
      admin: {
        id: admin!.id,
        username: admin!.username,
        displayName: admin!.displayName,
      },
    });
  }

  me(admin: AuthAdmin) {
    return ok({
      id: admin.id,
      username: admin.username,
      displayName: admin.displayName,
    });
  }

  async changePassword(admin: AuthAdmin, dto: ChangePasswordDto) {
    const row = await this.prisma.adminUser.findUnique({
      where: { id: admin.id },
    });
    if (!row) {
      throw new UnauthorizedException('未授权');
    }

    const matched = await bcrypt.compare(dto.oldPassword, row.passwordHash);
    if (!matched) {
      throw new BadRequestException('旧密码错误');
    }

    if (dto.newPassword.length < 8) {
      throw new BadRequestException('新密码至少 8 位');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
      },
    });

    return ok({ message: '密码已修改' });
  }

  private async writeLoginLogSafely(data: {
    adminUserId: string | null;
    username: string;
    success: boolean;
    ipAddress?: string | null;
    userAgent?: string | null;
    failureReason?: string | null;
  }): Promise<void> {
    try {
      await this.prisma.adminLoginLog.create({ data });
    } catch (error) {
      const errName =
        error instanceof Error ? error.constructor.name : typeof error;
      this.logger.warn(
        `AdminLoginLog 写入失败 username=${data.username} success=${data.success} error=${errName}`,
      );
    }
  }
}
