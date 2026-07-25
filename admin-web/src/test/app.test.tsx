import type { ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import MockAdapter from 'axios-mock-adapter';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { apiClient, resetLoginRedirectFlag } from '@/api/client';
import { AuthProvider } from '@/contexts/AuthContext';
import { AuthGuard, GuestGuard } from '@/components/AuthGuard';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { setAccessToken, setStoredAdmin, getAccessToken } from '@/utils/auth-storage';
import { isPositiveTelegramId } from '@/utils/format';
import { getErrorMessage } from '@/utils/errors';
import { cleanParams } from '@/utils/query';
import axios from 'axios';

function renderWithProviders(
  ui: ReactElement,
  initialEntries: string[] = ['/'],
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <ConfigProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ConfigProvider>,
  );
}

describe('auth guards', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
    resetLoginRedirectFlag();
  });

  afterEach(() => {
    mock.restore();
  });

  it('未登录访问受保护页面跳转 /login', async () => {
    renderWithProviders(
      <Routes>
        <Route element={<AuthGuard />}>
          <Route path="/dashboard" element={<div>DashboardOK</div>} />
        </Route>
        <Route path="/login" element={<div>LoginOK</div>} />
      </Routes>,
      ['/dashboard'],
    );

    expect(await screen.findByText('LoginOK')).toBeInTheDocument();
  });

  it('已登录访问 /login 跳转 /dashboard', async () => {
    setAccessToken('token-1');
    setStoredAdmin({ id: '1', username: 'admin', displayName: 'Admin' });
    mock.onGet('/auth/me').reply(200, {
      success: true,
      data: { id: '1', username: 'admin', displayName: 'Admin' },
    });

    renderWithProviders(
      <Routes>
        <Route element={<GuestGuard />}>
          <Route path="/login" element={<div>LoginOK</div>} />
        </Route>
        <Route path="/dashboard" element={<div>DashboardOK</div>} />
      </Routes>,
      ['/login'],
    );

    expect(await screen.findByText('DashboardOK')).toBeInTheDocument();
  });

  it('登录成功保存 Token', async () => {
    mock.onPost('/auth/login').reply(200, {
      success: true,
      data: {
        accessToken: 'new-token',
        expiresIn: '8h',
        admin: { id: '1', username: 'admin', displayName: null },
      },
    });

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<div>DashboardOK</div>} />
      </Routes>,
      ['/login'],
    );

    await userEvent.type(screen.getByLabelText('用户名'), 'admin');
    await userEvent.type(screen.getByLabelText('密码'), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /登\s*录/ }));

    await waitFor(() => {
      expect(getAccessToken()).toBe('new-token');
    });
    expect(await screen.findByText('DashboardOK')).toBeInTheDocument();
  });

  it('登录失败显示错误', async () => {
    mock.onPost('/auth/login').reply(401, {
      success: false,
      message: '用户名或密码错误',
    });

    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
      ['/login'],
    );

    await userEvent.type(screen.getByLabelText('用户名'), 'admin');
    await userEvent.type(screen.getByLabelText('密码'), 'bad');
    await userEvent.click(screen.getByRole('button', { name: /登\s*录/ }));

    expect(await screen.findByText('用户名或密码错误')).toBeInTheDocument();
  });
});

describe('api client', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
    resetLoginRedirectFlag();
    setAccessToken('old-token');
    setStoredAdmin({ id: '1', username: 'admin', displayName: null });
  });

  afterEach(() => {
    mock.restore();
  });

  it('401 清除 Token', async () => {
    // jsdom 的 location.assign 可能不可 spy，拦截器仍应清 token
    const originalPath = window.location.pathname;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: '/dashboard', assign: vi.fn() },
    });
    mock.onGet('/dashboard/summary').reply(401, {
      success: false,
      message: '未授权',
    });

    await expect(apiClient.get('/dashboard/summary')).rejects.toBeTruthy();
    expect(getAccessToken()).toBeNull();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, pathname: originalPath },
    });
  });

  it('网络错误显示友好提示', () => {
    const err = new axios.AxiosError('Network Error');
    err.message = 'Network Error';
    expect(getErrorMessage(err)).toBe('无法连接服务器，请稍后重试');
  });
});

describe('dashboard', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
    setAccessToken('token');
    setStoredAdmin({ id: '1', username: 'admin', displayName: 'Admin' });
    mock.onGet('/auth/me').reply(200, {
      success: true,
      data: { id: '1', username: 'admin', displayName: 'Admin' },
    });
  });

  afterEach(() => {
    mock.restore();
  });

  it('Dashboard 正确渲染统计字段', async () => {
    mock.onGet('/dashboard/summary').reply(200, {
      success: true,
      data: {
        identifiedCustomers: 12,
        pendingCustomers: 3,
        todayCreatedCustomers: 1,
        todayPendingCustomers: 2,
        todayDuplicateImports: 4,
        todayFailedImports: 5,
        totalImportLogs: 1000,
      },
    });

    renderWithProviders(<DashboardPage />, ['/dashboard']);

    expect(await screen.findByText('正式客户总数')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('累计录入记录')).toBeInTheDocument();
    expect(screen.getByText('1,000')).toBeInTheDocument();
  });
});

describe('customers query utils', () => {
  it('客户分页参数保持字符串形式的 Telegram ID', () => {
    const rawId = '9007199254740993';
    const params = cleanParams({
      page: 2,
      pageSize: 50,
      telegramId: rawId,
    });
    expect(params.telegramId).toBe(rawId);
    expect(typeof params.telegramId).toBe('string');
    // Number 会丢精度；业务层必须保持 string
    expect(String(Number(params.telegramId))).not.toBe(rawId);
  });
});

describe('pending resolve validation', () => {
  it('Telegram ID 校验：纯数字且大于 0', () => {
    expect(isPositiveTelegramId('123')).toBe(true);
    expect(isPositiveTelegramId('0')).toBe(false);
    expect(isPositiveTelegramId('-1')).toBe(false);
    expect(isPositiveTelegramId('12a')).toBe(false);
    expect(isPositiveTelegramId('9007199254740993')).toBe(true);
  });
});

describe('settings password', () => {
  let mock: MockAdapter;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
    setAccessToken('token');
    setStoredAdmin({ id: '1', username: 'admin', displayName: null });
    mock.onGet('/auth/me').reply(200, {
      success: true,
      data: { id: '1', username: 'admin', displayName: null },
    });
  });

  afterEach(() => {
    mock.restore();
  });

  it('修改密码不一致时禁止提交', async () => {
    const changeSpy = vi.fn();
    mock.onPost('/auth/change-password').reply((config) => {
      changeSpy(config.data);
      return [200, { success: true, data: { message: '密码已修改' } }];
    });

    renderWithProviders(<SettingsPage />, ['/settings']);
    expect(await screen.findByText('管理员 ID')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('当前密码'), 'oldpass12');
    await userEvent.type(screen.getByLabelText('新密码'), 'newpass123');
    await userEvent.type(screen.getByLabelText('确认新密码'), 'different1');
    await userEvent.click(
      screen.getByRole('button', { name: /保存新密码/ }),
    );

    await waitFor(() => {
      expect(screen.getByText('两次输入的新密码不一致')).toBeInTheDocument();
    });
    expect(changeSpy).not.toHaveBeenCalled();
  });
});

describe('pending resolve refresh', () => {
  it('resolve API 路径与 telegramId 以字符串提交', async () => {
    const mock = new MockAdapter(apiClient);
    setAccessToken('token');
    let body: Record<string, unknown> | null = null;
    mock.onPost('/pending-customers/p1/resolve').reply((config) => {
      body = JSON.parse(config.data as string) as Record<string, unknown>;
      return [
        200,
        {
          success: true,
          data: {
            kind: 'RESOLVED',
            pending: { id: 'p1', status: 'RESOLVED' },
            customer: { id: 'c1', customerCode: 'C000001' },
          },
        },
      ];
    });

    const { resolvePending } = await import('@/api/pending');
    await resolvePending('p1', {
      telegramId: '9007199254740993',
      username: 'demo',
    });

    expect(body).toEqual({
      telegramId: '9007199254740993',
      username: 'demo',
    });
    expect(typeof body!.telegramId).toBe('string');
    mock.restore();
  });
});
