import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Skeleton,
  message,
} from 'antd';
import { useQuery } from '@tanstack/react-query';
import { changePasswordApi, fetchMe } from '@/api/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { getErrorMessage } from '@/utils/errors';
import { displayText } from '@/utils/format';

export function SettingsPage() {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchMe,
  });

  if (query.isLoading) {
    return (
      <div>
        <PageHeader title="账号设置" />
        <Skeleton active />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div>
        <PageHeader title="账号设置" />
        <ErrorState
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const me = query.data;

  const onFinish = async (values: {
    oldPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => {
    if (submitting) return;
    if (values.newPassword !== values.confirmPassword) {
      message.error('两次输入的新密码不一致');
      return;
    }
    if (values.newPassword === values.oldPassword) {
      message.error('新密码不能与当前密码相同');
      return;
    }
    setSubmitting(true);
    try {
      const result = await changePasswordApi(
        values.oldPassword,
        values.newPassword,
      );
      message.success(result.message || '密码已修改');
      form.resetFields();
    } catch (err) {
      message.error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title="账号设置" />
      <Card title="管理员信息" style={{ marginBottom: 16 }}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="当前 /auth/me 仅返回基础身份信息（不含状态与创建时间）。"
        />
        <Descriptions bordered size="small" column={1}>
          <Descriptions.Item label="管理员 ID">{me.id}</Descriptions.Item>
          <Descriptions.Item label="用户名">{me.username}</Descriptions.Item>
          <Descriptions.Item label="显示名称">
            {displayText(me.displayName)}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="修改密码">
        <Form form={form} layout="vertical" onFinish={onFinish} style={{ maxWidth: 420 }}>
          <Form.Item
            name="oldPassword"
            label="当前密码"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password autoComplete="current-password" disabled={submitting} />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 8, message: '新密码至少 8 位' },
            ]}
          >
            <Input.Password autoComplete="new-password" disabled={submitting} />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator(_, value: string) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的新密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" disabled={submitting} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={submitting}>
            保存新密码
          </Button>
        </Form>
      </Card>
    </div>
  );
}
