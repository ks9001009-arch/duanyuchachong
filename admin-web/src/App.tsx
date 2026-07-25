import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { AuthGuard, GuestGuard } from '@/components/AuthGuard';
import { AppLayout } from '@/components/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { CustomersPage } from '@/pages/CustomersPage';
import { CustomerDetailPage } from '@/pages/CustomerDetailPage';
import { PendingCustomersPage } from '@/pages/PendingCustomersPage';
import { ImportLogsPage } from '@/pages/ImportLogsPage';
import { AdminLoginLogsPage } from '@/pages/AdminLoginLogsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function RootRedirect() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
}

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1f4b7a',
          borderRadius: 6,
          fontFamily:
            '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
        },
      }}
    >
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<RootRedirect />} />
                <Route element={<GuestGuard />}>
                  <Route path="/login" element={<LoginPage />} />
                </Route>
                <Route element={<AuthGuard />}>
                  <Route element={<AppLayout />}>
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/customers" element={<CustomersPage />} />
                    <Route path="/customers/:id" element={<CustomerDetailPage />} />
                    <Route
                      path="/pending-customers"
                      element={<PendingCustomersPage />}
                    />
                    <Route path="/import-logs" element={<ImportLogsPage />} />
                    <Route
                      path="/admin-login-logs"
                      element={<AdminLoginLogsPage />}
                    />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Route>
                </Route>
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}
