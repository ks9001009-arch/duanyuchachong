import { useMemo } from 'react';
import {
  Button,
  DatePicker,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';
import { fetchAdminLoginLogs } from '@/api/logs';
import { PageHeader } from '@/components/PageHeader';
import { getErrorMessage } from '@/utils/errors';
import { displayText, formatDateTime } from '@/utils/format';
import type { AdminLoginLogItem } from '@/types/api';

const PAGE_SIZES = [20, 50, 100];

export function AdminLoginLogsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const queryParams = useMemo(() => {
    const page = Number(searchParams.get('page') || '1') || 1;
    const pageSize = Number(searchParams.get('pageSize') || '20') || 20;
    return {
      page,
      pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : 20,
      username: searchParams.get('username') || undefined,
      success: searchParams.get('success') || undefined,
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
    };
  }, [searchParams]);

  const query = useQuery({
    queryKey: ['admin-login-logs', queryParams],
    queryFn: () => fetchAdminLoginLogs(queryParams),
  });

  const updateParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next);
  };

  const columns: ColumnsType<AdminLoginLogItem> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 180,
      render: formatDateTime,
    },
    {
      title: '用户名',
      dataIndex: 'username',
      width: 140,
      render: (v: string | null) => displayText(v),
    },
    {
      title: '结果',
      dataIndex: 'success',
      width: 100,
      render: (success: boolean) =>
        success ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag>,
    },
    {
      title: 'IP',
      dataIndex: 'ipAddress',
      width: 140,
      render: (v: string | null) => displayText(v),
    },
    {
      title: 'User Agent',
      dataIndex: 'userAgent',
      ellipsis: true,
      render: (v: string | null) => (
        <Tooltip title={v || undefined}>{displayText(v)}</Tooltip>
      ),
    },
    {
      title: '失败原因',
      dataIndex: 'failureReason',
      width: 180,
      ellipsis: true,
      render: (v: string | null) => (
        <Tooltip title={v || undefined}>{displayText(v)}</Tooltip>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="登录日志"
        extra={
          <Button
            icon={<ReloadOutlined />}
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            刷新
          </Button>
        }
      />
      <Form
        layout="inline"
        className="filter-form"
        onFinish={(values: {
          username?: string;
          success?: string;
          dateRange?: [Dayjs, Dayjs];
        }) => {
          updateParams({
            page: '1',
            username: values.username?.trim(),
            success: values.success,
            dateFrom: values.dateRange?.[0]?.format('YYYY-MM-DD'),
            dateTo: values.dateRange?.[1]?.format('YYYY-MM-DD'),
          });
        }}
        initialValues={{
          username: queryParams.username,
          success: queryParams.success,
          dateRange:
            queryParams.dateFrom && queryParams.dateTo
              ? [dayjs(queryParams.dateFrom), dayjs(queryParams.dateTo)]
              : undefined,
        }}
      >
        <Form.Item name="username" label="用户名">
          <Input allowClear style={{ width: 140 }} />
        </Form.Item>
        <Form.Item name="success" label="结果">
          <Select
            allowClear
            style={{ width: 120 }}
            options={[
              { value: 'true', label: '成功' },
              { value: 'false', label: '失败' },
            ]}
          />
        </Form.Item>
        <Form.Item name="dateRange" label="日期">
          <DatePicker.RangePicker />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              查询
            </Button>
            <Button onClick={() => setSearchParams(new URLSearchParams())}>
              重置
            </Button>
          </Space>
        </Form.Item>
      </Form>

      {query.isError ? (
        <div style={{ color: '#cf1322', marginBottom: 12 }}>
          {getErrorMessage(query.error)}
        </div>
      ) : null}

      <Table
        rowKey="id"
        loading={query.isLoading || query.isFetching}
        columns={columns}
        dataSource={query.data?.items ?? []}
        scroll={{ x: 1000 }}
        locale={{ emptyText: '暂无登录日志' }}
        onChange={(pagination: TablePaginationConfig) => {
          updateParams({
            page: String(pagination.current || 1),
            pageSize: String(pagination.pageSize || 20),
          });
        }}
        pagination={{
          current: query.data?.pagination.page ?? queryParams.page,
          pageSize: query.data?.pagination.pageSize ?? queryParams.pageSize,
          total: query.data?.pagination.total ?? 0,
          showSizeChanger: true,
          pageSizeOptions: PAGE_SIZES.map(String),
          showTotal: (total) => `共 ${total} 条`,
        }}
      />
    </div>
  );
}
