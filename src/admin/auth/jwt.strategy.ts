import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AdminUserStatus } from '@prisma/client';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';

export type JwtPayload = {
  sub: string;
  username: string;
};

export type AuthAdmin = {
  id: string;
  username: string;
  displayName: string | null;
  status: AdminUserStatus;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.adminJwtSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthAdmin> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        displayName: true,
        status: true,
      },
    });
    if (!admin || admin.status !== AdminUserStatus.ACTIVE) {
      throw new UnauthorizedException('未授权');
    }
    return admin;
  }
}
