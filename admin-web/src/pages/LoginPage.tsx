import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/errors';

type FormValues = {
  username: string;
  password: string;
};

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFinish = async (values: FormValues) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(values.username.trim(), values.password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, '登录失败'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <Card className="login-card" variant="borderless">
        <Typography.Title level={3} style={{ marginBottom: 4 }}>
          段誉客户数据管理后台
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          请使用管理员账号登录
        </Typography.Paragraph>
        {error ? (
          <Alert
            type="error"
            showIcon
            message={error}
            style={{ marginBottom: 16 }}
          />
        ) : null}
        <Form layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="用户名"
              autoComplete="username"
              disabled={submitting}
            />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
              autoComplete="current-password"
              disabled={submitting}
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={submitting}>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
