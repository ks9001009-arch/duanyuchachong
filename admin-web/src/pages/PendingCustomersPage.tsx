import { useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  message,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';
import { fetchPendingCustomers, resolvePending } from '@/api/pending';
import { PageHeader } from '@/components/PageHeader';
import { getErrorMessage } from '@/utils/errors';
import {
  displayText,
  displayUsername,
  formatDateTime,
  isPositiveTelegramId,
  stripAt,
} from '@/utils/format';
import { PENDING_STATUSES, type PendingCustomer } from '@/types/api';

const PAGE_SIZES = [20, 50, 100];

function pendingStatusTag(status: string) {
  const map: Record<string, { color: string; label: string }> = {
    PENDING_ID: { color: 'orange', label: '待确认' },
    RESOLVED: { color: 'green', label: '已创建' },
    MERGED: { color: 'blue', label: '已合并' },
    CANCELLED: { color: 'default', label: '已取消' },
  };
  const item = map[status] ?? { color: 'default', label: status };
  return <Tag color={item.color}>{item.label}</Tag>;
}

export function PendingCustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [active, setActive] = useState<PendingCustomer | null>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const queryParams = useMemo(() => {
    const page = Number(searchParams.get('page') || '1') || 1;
    const pageSize = Number(searchParams.get('pageSize') || '20') || 20;
    return {
      page,
      pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : 20,
      keyword: searchParams.get('keyword') || undefined,
      pendingCode: searchParams.get('pendingCode') || undefined,
      status: searchParams.get('status') || undefined,
      operatorTelegramId: searchParams.get('operatorTelegramId') || undefined,
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
    };
  }, [searchParams]);

  const query = useQuery({
    queryKey: ['pending-customers', queryParams],
    queryFn: () => fetchPendingCustomers(queryParams),
  });

  const mutation = useMutation({
    mutationFn: (values: {
      telegramId: string;
      username?: string;
      firstName?: string;
      lastName?: string;
      displayName?: string;
    }) => {
      if (!active) throw new Error('未选择记录');
      return resolvePending(active.id, {
        telegramId: values.telegramId,
        username: stripAt(values.username),
        firstName: values.firstName?.trim() || undefined,
        lastName: values.lastName?.trim() || undefined,
        displayName: values.displayName?.trim() || undefined,
      });
    },
    onSuccess: (data) => {
      const kindLabel = data.kind === 'MERGED' ? '已合并到已有客户' : '已创建正式客户';
      message.success(kindLabel);
      setActive(null);
      form.resetFields();
      void queryClient.invalidateQueries({ queryKey: ['pending-customers'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      if (data.customer?.id) {
        Modal.confirm({
          title: '处理成功',
          content: `${kindLabel}：${data.customer.customerCode}`,
          okText: '查看客户',
          cancelText: '关闭',
          onOk: () => {
            window.location.assign(`/customers/${data.customer.id}`);
          },
        });
      }
    },
    onError: (err) => {
      message.error(getErrorMessage(err));
    },
  });

  const updateParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next);
  };

  const columns: ColumnsType<PendingCustomer> = [
    { title: 'Pending 编号', dataIndex: 'pendingCode', width: 120 },
    {
      title: '可见名称',
      dataIndex: 'visibleName',
      width: 140,
      ellipsis: true,
      render: (v: string | null) => (
        <Tooltip title={v || undefined}>{displayText(v)}</Tooltip>
      ),
    },
    {
      title: '可见用户名',
      dataIndex: 'visibleUsername',
      width: 140,
      render: (v: string | null) => displayUsername(v),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 110,
      render: pendingStatusTag,
    },
    {
      title: '操作员',
      key: 'operator',
      width: 160,
      render: (_, row) =>
        `${displayText(row.operatorDisplayName || row.operatorUsername)} (${String(row.operatorTelegramId)})`,
    },
    {
      title: '失败原因',
      dataIndex: 'failureReason',
      width: 140,
      ellipsis: true,
      render: (v: string) => <Tooltip title={v}>{v}</Tooltip>,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: formatDateTime,
    },
    {
      title: '处理时间',
      dataIndex: 'resolvedAt',
      width: 180,
      render: formatDateTime,
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 140,
      render: (_, row) => {
        if (row.status === 'PENDING_ID') {
          return (
            <Button
              type="link"
              onClick={() => {
                setActive(row);
                form.setFieldsValue({
                  telegramId: '',
                  username: row.visibleUsername?.replace(/^@+/, '') || '',
                  firstName: '',
                  lastName: '',
                  displayName: row.visibleName || '',
                });
              }}
            >
              处理
            </Button>
          );
        }
        return (
          <Space>
            <span>{pendingStatusTag(row.status)}</span>
            {row.resolvedCustomerId ? (
              <Link to={`/customers/${row.resolvedCustomerId}`}>查看客户</Link>
            ) : null}
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="待确认客户"
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
          keyword?: string;
          pendingCode?: string;
          status?: string;
          operatorTelegramId?: string;
          dateRange?: [Dayjs, Dayjs];
        }) => {
          updateParams({
            page: '1',
            keyword: values.keyword?.trim(),
            pendingCode: values.pendingCode?.trim(),
            status: values.status,
            operatorTelegramId: values.operatorTelegramId?.trim(),
            dateFrom: values.dateRange?.[0]?.format('YYYY-MM-DD'),
            dateTo: values.dateRange?.[1]?.format('YYYY-MM-DD'),
          });
        }}
        initialValues={{
          keyword: queryParams.keyword,
          pendingCode: queryParams.pendingCode,
          status: queryParams.status,
          operatorTelegramId: queryParams.operatorTelegramId,
          dateRange:
            queryParams.dateFrom && queryParams.dateTo
              ? [dayjs(queryParams.dateFrom), dayjs(queryParams.dateTo)]
              : undefined,
        }}
      >
        <Form.Item name="keyword" label="关键词">
          <Input allowClear style={{ width: 140 }} />
        </Form.Item>
        <Form.Item name="pendingCode" label="Pending 编号">
          <Input allowClear style={{ width: 140 }} />
        </Form.Item>
        <Form.Item name="status" label="状态">
          <Select
            allowClear
            style={{ width: 130 }}
            options={PENDING_STATUSES.map((s) => ({ value: s, label: s }))}
          />
        </Form.Item>
        <Form.Item name="operatorTelegramId" label="操作员 ID">
          <Input allowClear style={{ width: 140 }} />
        </Form.Item>
        <Form.Item name="dateRange" label="创建日期">
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
        scroll={{ x: 1300 }}
        locale={{ emptyText: '暂无待确认客户' }}
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

      <Modal
        title={active ? `处理 ${active.pendingCode}` : '处理待确认'}
        open={Boolean(active)}
        onCancel={() => {
          if (mutation.isPending) return;
          setActive(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={mutation.isPending}
        destroyOnHidden
        okText="提交处理"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => mutation.mutate(values)}
        >
          <Form.Item
            name="telegramId"
            label="Telegram ID"
            rules={[
              { required: true, message: '请输入 Telegram ID' },
              {
                validator: async (_, value: string) => {
                  if (!value) return;
                  if (!isPositiveTelegramId(String(value).trim())) {
                    throw new Error('Telegram ID 必须为大于 0 的纯数字');
                  }
                },
              },
            ]}
            normalize={(v: string) => String(v ?? '').trim()}
          >
            <Input placeholder="纯数字，作为字符串提交" disabled={mutation.isPending} />
          </Form.Item>
          <Form.Item name="username" label="username">
            <Input placeholder="可带 @" disabled={mutation.isPending} />
          </Form.Item>
          <Form.Item name="firstName" label="firstName">
            <Input disabled={mutation.isPending} />
          </Form.Item>
          <Form.Item name="lastName" label="lastName">
            <Input disabled={mutation.isPending} />
          </Form.Item>
          <Form.Item name="displayName" label="displayName">
            <Input disabled={mutation.isPending} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
