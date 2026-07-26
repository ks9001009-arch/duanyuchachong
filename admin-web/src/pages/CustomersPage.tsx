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
import type { SorterResult } from 'antd/es/table/interface';
import { ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';
import { fetchCustomers } from '@/api/customers';
import { PageHeader } from '@/components/PageHeader';
import { getErrorMessage } from '@/utils/errors';
import {
  displayText,
  displayUsername,
  formatDateTime,
} from '@/utils/format';
import {
  CUSTOMER_SORT_FIELDS,
  CUSTOMER_STATUSES,
  type CustomerListItem,
} from '@/types/api';

const PAGE_SIZES = [20, 50, 100];

function statusTag(status: string) {
  if (status === 'IDENTIFIED') return <Tag color="green">已识别</Tag>;
  if (status === 'DISABLED') return <Tag color="default">已禁用</Tag>;
  return <Tag>{status}</Tag>;
}

export function CustomersPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const queryParams = useMemo(() => {
    const page = Number(searchParams.get('page') || '1') || 1;
    const pageSize = Number(searchParams.get('pageSize') || '20') || 20;
    return {
      page,
      pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : 20,
      keyword: searchParams.get('keyword') || undefined,
      telegramId: searchParams.get('telegramId') || undefined,
      username: searchParams.get('username') || undefined,
      operatorTelegramId: searchParams.get('operatorTelegramId') || undefined,
      status: searchParams.get('status') || undefined,
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
      sortBy: searchParams.get('sortBy') || 'firstImportedAt',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
    };
  }, [searchParams]);

  const query = useQuery({
    queryKey: ['customers', queryParams],
    queryFn: () => fetchCustomers(queryParams),
  });

  const updateParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next);
  };

  const onFinish = (values: {
    keyword?: string;
    telegramId?: string;
    username?: string;
    operatorTelegramId?: string;
    status?: string;
    dateRange?: [Dayjs, Dayjs];
  }) => {
    updateParams({
      page: '1',
      keyword: values.keyword?.trim(),
      telegramId: values.telegramId?.trim(),
      username: values.username?.trim(),
      operatorTelegramId: values.operatorTelegramId?.trim(),
      status: values.status,
      dateFrom: values.dateRange?.[0]?.format('YYYY-MM-DD'),
      dateTo: values.dateRange?.[1]?.format('YYYY-MM-DD'),
    });
  };

  const columns: ColumnsType<CustomerListItem> = [
    {
      title: '客户编号',
      dataIndex: 'customerCode',
      sorter: true,
      sortOrder:
        queryParams.sortBy === 'customerCode'
          ? queryParams.sortOrder === 'asc'
            ? 'ascend'
            : 'descend'
          : undefined,
      width: 120,
    },
    {
      title: 'Telegram ID',
      dataIndex: 'telegramId',
      width: 160,
      render: (v: string) => <TypographyId value={v} />,
    },
    {
      title: '用户名',
      dataIndex: 'username',
      width: 140,
      render: (v: string | null) => displayUsername(v),
    },
    {
      title: '显示名称',
      dataIndex: 'displayName',
      width: 140,
      ellipsis: true,
      render: (v: string | null) => (
        <Tooltip title={v || undefined}>{displayText(v)}</Tooltip>
      ),
    },
    {
      title: '电话',
      dataIndex: 'phone',
      width: 130,
      render: (v: string | null) => displayText(v),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: statusTag,
    },
    {
      title: '首次录入人',
      key: 'importer',
      width: 160,
      render: (_, row) =>
        displayText(row.firstImportedName || row.firstImportedUsername),
    },
    {
      title: '首次录入时间',
      dataIndex: 'firstImportedAt',
      sorter: true,
      sortOrder:
        queryParams.sortBy === 'firstImportedAt'
          ? queryParams.sortOrder === 'asc'
            ? 'ascend'
            : 'descend'
          : undefined,
      width: 180,
      render: formatDateTime,
    },
    {
      title: '来源',
      dataIndex: 'firstImportSource',
      width: 160,
      ellipsis: true,
      render: (v: string) => <Tooltip title={v}>{v}</Tooltip>,
    },
    {
      title: '最后观察时间',
      dataIndex: 'lastObservedAt',
      sorter: true,
      sortOrder:
        queryParams.sortBy === 'lastObservedAt'
          ? queryParams.sortOrder === 'asc'
            ? 'ascend'
            : 'descend'
          : undefined,
      width: 180,
      render: formatDateTime,
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 100,
      render: (_, row) => <Link to={`/customers/${row.id}`}>详情</Link>,
    },
  ];

  const onTableChange = (
    pagination: TablePaginationConfig,
    _filters: unknown,
    sorter: SorterResult<CustomerListItem> | SorterResult<CustomerListItem>[],
  ) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    const sortField = String(s?.field || '');
    const sortBy = CUSTOMER_SORT_FIELDS.includes(
      sortField as (typeof CUSTOMER_SORT_FIELDS)[number],
    )
      ? sortField
      : queryParams.sortBy;

    updateParams({
      page: String(pagination.current || 1),
      pageSize: String(pagination.pageSize || 20),
      sortBy,
      sortOrder:
        s?.order === 'ascend' ? 'asc' : s?.order === 'descend' ? 'desc' : 'desc',
    });
  };

  return (
    <div>
      <PageHeader
        title="客户数据"
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
        onFinish={onFinish}
        initialValues={{
          keyword: queryParams.keyword,
          telegramId: queryParams.telegramId,
          username: queryParams.username,
          operatorTelegramId: queryParams.operatorTelegramId,
          status: queryParams.status,
          dateRange:
            queryParams.dateFrom && queryParams.dateTo
              ? [dayjs(queryParams.dateFrom), dayjs(queryParams.dateTo)]
              : undefined,
        }}
      >
        <Form.Item name="keyword" label="关键词">
          <Input allowClear placeholder="编号/名称/用户名" style={{ width: 160 }} />
        </Form.Item>
        <Form.Item name="telegramId" label="Telegram ID">
          <Input allowClear placeholder="纯数字" style={{ width: 160 }} />
        </Form.Item>
        <Form.Item name="username" label="用户名">
          <Input allowClear placeholder="可带@" style={{ width: 140 }} />
        </Form.Item>
        <Form.Item name="operatorTelegramId" label="操作员 ID">
          <Input allowClear style={{ width: 140 }} />
        </Form.Item>
        <Form.Item name="status" label="状态">
          <Select
            allowClear
            style={{ width: 120 }}
            options={CUSTOMER_STATUSES.map((s) => ({
              value: s,
              label: s === 'IDENTIFIED' ? '已识别' : '已禁用',
            }))}
          />
        </Form.Item>
        <Form.Item name="dateRange" label="首次录入日期">
          <DatePicker.RangePicker />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              查询
            </Button>
            <Button
              onClick={() => {
                setSearchParams(new URLSearchParams());
              }}
            >
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
        scroll={{ x: 1400 }}
        locale={{ emptyText: '暂无客户数据' }}
        onChange={onTableChange}
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

function TypographyId({ value }: { value: string }) {
  return <span style={{ fontFamily: 'ui-monospace, monospace' }}>{value}</span>;
}
