import { useMemo, useState } from 'react';
import {
  Layout,
  Menu,
  Button,
  Drawer,
  Typography,
  Space,
  Grid,
  theme,
} from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  HourglassOutlined,
  FileSearchOutlined,
  LoginOutlined,
  SettingOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const { Header, Sider, Content } = Layout;

const TITLE_MAP: Record<string, string> = {
  '/dashboard': '数据概览',
  '/customers': '客户数据',
  '/pending-customers': '待确认客户',
  '/import-logs': '录入记录',
  '/admin-login-logs': '登录日志',
  '/settings': '账号设置',
};

function resolveTitle(pathname: string): string {
  if (pathname.startsWith('/customers/')) return '客户详情';
  return TITLE_MAP[pathname] ?? '段誉数据后台';
}

const MENU_ITEMS = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '数据概览' },
  { key: '/customers', icon: <TeamOutlined />, label: '客户数据' },
  {
    key: '/pending-customers',
    icon: <HourglassOutlined />,
    label: '待确认客户',
  },
  { key: '/import-logs', icon: <FileSearchOutlined />, label: '录入记录' },
  {
    key: '/admin-login-logs',
    icon: <LoginOutlined />,
    label: '登录日志',
  },
  { key: '/settings', icon: <SettingOutlined />, label: '账号设置' },
];

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const location = useLocation();
  const navigate = useNavigate();
  const { admin, logout } = useAuth();
  const { token } = theme.useToken();

  const selectedKey = useMemo(() => {
    const match = MENU_ITEMS.find(
      (item) =>
        location.pathname === item.key ||
        location.pathname.startsWith(`${item.key}/`),
    );
    return match?.key ?? location.pathname;
  }, [location.pathname]);

  const title = resolveTitle(location.pathname);
  const adminLabel = admin?.displayName || admin?.username || '管理员';

  const onMenuClick = ({ key }: { key: string }) => {
    navigate(key);
    setDrawerOpen(false);
  };

  const menu = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selectedKey]}
      items={MENU_ITEMS}
      onClick={onMenuClick}
    />
  );

  return (
    <Layout className="app-shell">
      {!isMobile ? (
        <Sider
          collapsible
          collapsed={collapsed}
          trigger={null}
          width={220}
          className="app-sider"
        >
          <div className="sider-brand">
            {collapsed ? '段誉' : '段誉数据后台'}
          </div>
          {menu}
          <div className="sider-logout">
            <Button
              type="text"
              danger
              icon={<LogoutOutlined />}
              block
              onClick={() => {
                logout();
                navigate('/login', { replace: true });
              }}
            >
              {collapsed ? '' : '退出登录'}
            </Button>
          </div>
        </Sider>
      ) : null}

      <Layout>
        <Header
          className="app-header"
          style={{ background: token.colorBgContainer }}
        >
          <Space>
            {isMobile ? (
              <Button
                type="text"
                icon={<MenuOutlined />}
                onClick={() => setDrawerOpen(true)}
              />
            ) : (
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed((v) => !v)}
              />
            )}
            <Typography.Title level={5} style={{ margin: 0 }}>
              {title}
            </Typography.Title>
          </Space>
          <Typography.Text>{adminLabel}</Typography.Text>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>

      <Drawer
        title="段誉数据后台"
        placement="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{ body: { padding: 0, background: '#001529' } }}
        width={240}
      >
        {menu}
        <div className="sider-logout" style={{ padding: 12 }}>
          <Button
            danger
            block
            icon={<LogoutOutlined />}
            onClick={() => {
              logout();
              setDrawerOpen(false);
              navigate('/login', { replace: true });
            }}
          >
            退出登录
          </Button>
        </div>
      </Drawer>
    </Layout>
  );
}
