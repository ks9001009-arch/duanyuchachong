import {
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminExceptionFilter } from '../src/admin/common/admin-exception.filter';
import { AppConfigService } from '../src/config/app-config.service';

function mockHost(url: string) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const response = { status, json };
  const request = { url };
  return {
    host: {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as any,
    status,
    json,
  };
}

describe('AdminExceptionFilter & ADMIN_SYSTEM_OPERATOR_TELEGRAM_ID', () => {
  it('未知 Error 不把原始 message 返回客户端', () => {
    const filter = new AdminExceptionFilter();
    const { host, status, json } = mockHost('/api/admin/customers');
    filter.catch(new Error('database connection xxx secret=abc'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: '服务器内部错误',
    });
    const body = json.mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain('database connection');
    expect(JSON.stringify(body)).not.toContain('secret=abc');
  });

  it('HttpException 保留预期 message', () => {
    const filter = new AdminExceptionFilter();
    const { host, status, json } = mockHost('/api/admin/auth/login');
    filter.catch(new HttpException('用户名或密码错误', HttpStatus.UNAUTHORIZED), host);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: '用户名或密码错误',
    });
  });

  it('ServiceUnavailableException 在 /health 仍返回 503', () => {
    const filter = new AdminExceptionFilter();
    const { host, status, json } = mockHost('/health');
    filter.catch(
      new ServiceUnavailableException({
        status: 'error',
        database: 'disconnected',
      }),
      host,
    );
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalled();
  });

  it('ADMIN_SYSTEM_OPERATOR_TELEGRAM_ID 未配置或为 0 时校验失败；合法值可转 BigInt', () => {
    const missing = new AppConfigService({
      get: (key: string) => {
        if (key === 'ADMIN_SYSTEM_OPERATOR_TELEGRAM_ID') return '';
        return undefined;
      },
    } as ConfigService);
    expect(() => missing.adminSystemOperatorTelegramId).toThrow(
      /ADMIN_SYSTEM_OPERATOR_TELEGRAM_ID/,
    );

    const zero = new AppConfigService({
      get: (key: string) => {
        if (key === 'ADMIN_SYSTEM_OPERATOR_TELEGRAM_ID') return '0';
        return undefined;
      },
    } as ConfigService);
    expect(() => zero.adminSystemOperatorTelegramId).toThrow(/大于 0/);

    const ok = new AppConfigService({
      get: (key: string) => {
        if (key === 'ADMIN_SYSTEM_OPERATOR_TELEGRAM_ID') return '900001';
        return undefined;
      },
    } as ConfigService);
    expect(ok.adminSystemOperatorTelegramId).toBe(900001n);
  });
});
