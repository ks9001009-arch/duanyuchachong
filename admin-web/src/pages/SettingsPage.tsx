import { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Skeleton,
  Space,
  Typography,
  Upload,
  message,
} from 'antd';
import { DownloadOutlined, InboxOutlined, UploadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { useQuery } from '@tanstack/react-query';
import { changePasswordApi, fetchMe } from '@/api/auth';
import { downloadFullBackup, downloadJsonBackup } from '@/api/export';
import {
  importTelegramHtmlFiles,
  type TelegramHtmlImportResult,
} from '@/api/import';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { getErrorMessage } from '@/utils/errors';
import { displayText } from '@/utils/format';

export function SettingsPage() {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [importResult, setImportResult] =
    useState<TelegramHtmlImportResult | null>(null);

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

  const onExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await downloadFullBackup();
      message.success('客户工作表（xlsx）已开始下载');
    } catch (err) {
      message.error(getErrorMessage(err, '导出失败，请稍后重试'));
    } finally {
      setExporting(false);
    }
  };

  const onExportJson = async () => {
    if (exportingJson) return;
    setExportingJson(true);
    try {
      await downloadJsonBackup();
      message.success('系统 JSON 备份已开始下载');
    } catch (err) {
      message.error(getErrorMessage(err, '导出失败，请稍后重试'));
    } finally {
      setExportingJson(false);
    }
  };

  const onImport = async () => {
    if (importing) return;
    const files: File[] = [];
    for (const item of fileList) {
      const raw = item.originFileObj;
      if (raw) files.push(raw as File);
    }
    if (files.length === 0) {
      message.warning('请先选择 messages*.html 文件');
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const result = await importTelegramHtmlFiles(files);
      setImportResult(result);
      message.success(
        `导入完成：新建 ${result.created}，跳过 ${result.skipped}，失败 ${result.failed}`,
      );
    } catch (err) {
      message.error(getErrorMessage(err, '导入失败'));
    } finally {
      setImporting(false);
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

      <Card title="导入旧数据（Telegram 导出 HTML）" style={{ marginBottom: 16 }}>
        <Typography.Paragraph type="secondary">
          上传 Telegram Desktop 导出的 messages.html / messages2.html …。将解析用户名与电话，拆条写入「待确认客户」（无官方
          ID，不直接建正式客户）。已存在记录会自动跳过。
        </Typography.Paragraph>
        <Upload.Dragger
          multiple
          accept=".html,.htm"
          fileList={fileList}
          beforeUpload={() => false}
          onChange={({ fileList: next }) => setFileList(next)}
          disabled={importing}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽 HTML 文件到此处</p>
          <p className="ant-upload-hint">可多选，单文件建议不超过 20MB</p>
        </Upload.Dragger>
        <Space style={{ marginTop: 16 }} wrap>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            loading={importing}
            onClick={() => void onImport()}
          >
            开始导入
          </Button>
        </Space>
        {importResult ? (
          <Alert
            style={{ marginTop: 16 }}
            type="success"
            showIcon
            title={`文件 ${importResult.files} 个｜解析 ${importResult.parsed}｜新建 ${importResult.created}｜跳过 ${importResult.skipped}｜失败 ${importResult.failed}`}
            description={
              importResult.errors.length > 0
                ? importResult.errors.slice(0, 8).join('\n')
                : '可到「待确认客户」查看导入结果。'
            }
          />
        ) : null}
      </Card>

      <Card title="数据备份" style={{ marginBottom: 16 }}>
        <Typography.Paragraph type="secondary">
          导出本地工作表（xlsx）列：电报昵称 / 电报用户名 / 绑定号码 / 电报ID。无用户名时写入「【用户未设置电报用户名】」。机器人会持续扫描并更新昵称与用户名；电话仅在有录入时写入。
        </Typography.Paragraph>
        <Space wrap>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={exporting}
            onClick={() => void onExport()}
          >
            导出客户工作表
          </Button>
          <Button loading={exportingJson} onClick={() => void onExportJson()}>
            导出系统 JSON 备份
          </Button>
        </Space>
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
