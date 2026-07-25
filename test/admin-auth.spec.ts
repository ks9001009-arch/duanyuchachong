import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import {
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { AdminUserStatus } from '@prisma/client';
import { AuthService } from '../src/admin/auth/auth.service';
import { AdminBootstrapService } from '../src/admin/bootstrap/admin-bootstrap.service';
import { AppConfigService } from '../src/config/app-config.service';
import { serializeBigInts } from '../src/admin/common/admin-response';
import { getDayBoundsInTimeZone } from '../src/admin/common/timezone';

describe('Admin auth & bootstrap', () => {
  const config = {
    adminInitialUsername: 'admin',
    adminInitialPassword: 'test-password-123456',
    adminJwtExpiresIn: '8h',
    assertAdminSecretsConfigured: jest.fn(),
  } as unknown as AppConfigService;

  it('初始管理员创建；已存在时不覆盖密码', async () => {
    const prisma: any = {
      adminUser: {
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1),
        create: jest.fn(async ({ data }: any) => ({ id: 'a1', ...data })),
      },
    };
    const bootstrap = new AdminBootstrapService(prisma, config);
    await bootstrap.onModuleInit();
    expect(prisma.adminUser.create).toHaveBeenCalledTimes(1);
    const hash = prisma.adminUser.create.mock.calls[0][0].data.passwordHash;
    expect(hash).not.toContain('test-password');
    expect(await bcrypt.compare('test-password-123456', hash)).toBe(true);

    await bootstrap.onModuleInit();
    expect(prisma.adminUser.create).toHaveBeenCalledTimes(1);
  });

  it('正确密码登录成功；错误密码失败；DISABLED 不能登录；写登录日志', async () => {
    const passwordHash = await bcrypt.hash('good-pass-123', 10);
    const admin: {
      id: string;
      username: string;
      passwordHash: string;
      displayName: string;
      status: AdminUserStatus;
    } = {
      id: 'adm1',
      username: 'admin',
      passwordHash,
      displayName: '管理员',
      status: AdminUserStatus.ACTIVE,
    };
    const logs: any[] = [];
    const prisma: any = {
      adminUser: {
        findUnique: jest.fn(async ({ where }: any) => {
          if (where.username === 'admin') return { ...admin };
          return null;
        }),
        update: jest.fn(async ({ data }: any) => ({ ...admin, ...data })),
      },
      adminLoginLog: {
        create: jest.fn(async ({ data }: any) => {
          logs.push(data);
          return data;
        }),
      },
    };
    const jwt = {
      signAsync: jest.fn(async () => 'token-xyz'),
    } as unknown as JwtService;
    const auth = new AuthService(prisma, jwt, config);

    const ok = await auth.login(
      { username: 'admin', password: 'good-pass-123' },
      { ipAddress: '1.1.1.1' },
    );
    expect(ok.success).toBe(true);
    expect(ok.data.accessToken).toBe('token-xyz');
    expect((ok.data as any).admin.passwordHash).toBeUndefined();
    expect(logs.some((l) => l.success === true)).toBe(true);

    await expect(
      auth.login({ username: 'admin', password: 'wrong' }, {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(logs.some((l) => l.success === false)).toBe(true);

    admin.status = AdminUserStatus.DISABLED;
    await expect(
      auth.login({ username: 'admin', password: 'good-pass-123' }, {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('修改密码成功；旧密码错误拒绝', async () => {
    const passwordHash = await bcrypt.hash('old-pass-123', 10);
    const prisma: any = {
      adminUser: {
        findUnique: jest.fn(async () => ({
          id: 'adm1',
          passwordHash,
        })),
        update: jest.fn(async ({ data }: any) => data),
      },
    };
    const auth = new AuthService(
      prisma,
      { signAsync: jest.fn() } as unknown as JwtService,
      config,
    );
    const admin = {
      id: 'adm1',
      username: 'admin',
      displayName: null,
      status: AdminUserStatus.ACTIVE,
    };

    await expect(
      auth.changePassword(admin, {
        oldPassword: 'bad',
        newPassword: 'new-pass-123',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const result = await auth.changePassword(admin, {
      oldPassword: 'old-pass-123',
      newPassword: 'new-pass-123',
    });
    expect(result.success).toBe(true);
    expect(prisma.adminUser.update).toHaveBeenCalled();
    const newHash = prisma.adminUser.update.mock.calls[0][0].data.passwordHash;
    expect(await bcrypt.compare('new-pass-123', newHash)).toBe(true);
  });

  it('BigInt 序列化为字符串；时区今日边界可用', () => {
    const data = serializeBigInts({
      telegramId: 123456789n,
      nested: { id: 1n },
    });
    expect(data.telegramId).toBe('123456789');
    expect(typeof data.nested.id).toBe('string');

    const { start, end } = getDayBoundsInTimeZone('Asia/Yangon');
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('登录日志写入失败时错误密码仍返回 UnauthorizedException', async () => {
    const passwordHash = await bcrypt.hash('good-pass-123', 10);
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const prisma: any = {
      adminUser: {
        findUnique: jest.fn(async () => ({
          id: 'adm1',
          username: 'admin',
          passwordHash,
          displayName: '管理员',
          status: AdminUserStatus.ACTIVE,
        })),
        update: jest.fn(),
      },
      adminLoginLog: {
        create: jest.fn(async () => {
          throw new Error('db down');
        }),
      },
    };
    const auth = new AuthService(
      prisma,
      { signAsync: jest.fn() } as unknown as JwtService,
      config,
    );

    await expect(
      auth.login({ username: 'admin', password: 'wrong' }, {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(warnSpy).toHaveBeenCalled();
    const warnArg = String(warnSpy.mock.calls[0]?.[0] ?? '');
    expect(warnArg).not.toMatch(/good-pass|passwordHash|jwt|secret/i);
    expect(warnArg).toContain('success=false');
    warnSpy.mockRestore();
  });

  it('登录成功后日志写入失败仍返回 accessToken', async () => {
    const passwordHash = await bcrypt.hash('good-pass-123', 10);
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const prisma: any = {
      adminUser: {
        findUnique: jest.fn(async () => ({
          id: 'adm1',
          username: 'admin',
          passwordHash,
          displayName: '管理员',
          status: AdminUserStatus.ACTIVE,
        })),
        update: jest.fn(async () => ({})),
      },
      adminLoginLog: {
        create: jest.fn(async () => {
          throw new Error('db down');
        }),
      },
    };
    const auth = new AuthService(
      prisma,
      { signAsync: jest.fn(async () => 'token-ok') } as unknown as JwtService,
      config,
    );

    const result = await auth.login(
      { username: 'admin', password: 'good-pass-123' },
      {},
    );
    expect(result.success).toBe(true);
    expect(result.data.accessToken).toBe('token-ok');
    expect(warnSpy).toHaveBeenCalled();
    const warnArg = String(warnSpy.mock.calls[0]?.[0] ?? '');
    expect(warnArg).not.toMatch(/good-pass|passwordHash|token-ok|secret/i);
    expect(warnArg).toContain('success=true');
    warnSpy.mockRestore();
  });
});
