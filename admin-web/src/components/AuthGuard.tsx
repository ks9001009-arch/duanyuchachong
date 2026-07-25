import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from '@/contexts/AuthContext';

export function AuthGuard() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="app-boot-loading">
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

export function GuestGuard() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-boot-loading">
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
