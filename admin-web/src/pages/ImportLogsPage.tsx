import { useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Table,
  Tooltip,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';
import { fetchImportLogs } from '@/api/logs';
import { PageHeader } from '@/components/PageHeader';
import { JsonViewer } from '@/components/JsonViewer';
import { getErrorMessage } from '@/utils/errors';
import { displayText, formatDateTime } from '@/utils/format';
import {
  IMPORT_RESULTS,
  IMPORT_SOURCES,
  type ImportLogItem,
} from '@/types/api';

const PAGE_SIZES = [20, 50, 100];

export function ImportLogsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [detail, setDetail] = useState<ImportLogItem | null>(null);

  const queryParams = useMemo(() => {
    const page = Number(searchParams.get('page') || '1') || 1;
    const pageSize = Number(searchParams.get('pageSize') || '20') || 20;
    return {
      page,
      pageSize: PAGE_SIZES.includes(pageSize) ? pageSize : 20,
      result: searchParams.get('result') || undefined,
      source: searchParams.get('source') || undefined,
      operatorTelegramId: searchParams.get('operatorTelegramId') || undefined,
      targetTelegramId: searchParams.get('targetTelegramId') || undefined,
      customerId: searchParams.get('customerId') || undefined,
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
    };
  }, [searchParams]);

  const query = useQuery({
    queryKey: ['import-logs', queryParams],
    queryFn: () => fetchImportLogs(queryParams),
  });

  const updateParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === '') next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next);
  };

  const columns: ColumnsType<ImportLogItem> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 180,
      render: formatDateTime,
    },
    {
      title: '客户编号',
      dataIndex: 'customerCode',
      width: 120,
      render: (v: string | null, row) =>
        row.customerId ? (
          <Link to={`/customers/${row.customerId}`}>{displayText(v)}</Link>
        ) : (
          displayText(v)
        ),
    },
    {
      title: '目标 Telegram ID',
      dataIndex: 'targetTelegramId',
      width: 160,
      render: (v: string | null) => (v == null ? '—' : String(v)),
    },
    {
      title: '操作员',
      key: 'operator',
      width: 160,
      render: (_, row) =>
        `${displayText(row.operatorDisplayName || row.operatorUsername)} (${String(row.operatorTelegramId)})`,
    },
    {
      title: '来源',
      dataIndex: 'source',
      width: 160,
      ellipsis: true,
    },
    {
      title: '结果',
      dataIndex: 'result',
      width: 140,
    },
    {
      title: '失败原因',
      dataIndex: 'failureReason',
      width: 160,
      ellipsis: true,
      render: (v: string | null) => (
        <Tooltip title={v || undefined}>{displayText(v)}</Tooltip>
      ),
    },
    {
      title: '存档',
      dataIndex: 'archiveMessageLink',
      width: 80,
      render: (v: string | null) =>
        v ? (
          <a href={v} target="_blank" rel="noopener noreferrer">
            打开
          </a>
        ) : (
          '—'
        ),
    },
    {
      title: '详情',
      key: 'detail',
      fixed: 'right',
      width: 80,
      render: (_, row) => (
        <Button type="link" onClick={() => setDetail(row)}>
          详情
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="录入记录"
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
          result?: string;
          source?: string;
          operatorTelegramId?: string;
          targetTelegramId?: string;
          customerId?: string;
          dateRange?: [Dayjs, Dayjs];
        }) => {
          updateParams({
            page: '1',
            result: values.result,
            source: values.source,
            operatorTelegramId: values.operatorTelegramId?.trim(),
            targetTelegramId: values.targetTelegramId?.trim(),
            customerId: values.customerId?.trim(),
            dateFrom: values.dateRange?.[0]?.format('YYYY-MM-DD'),
            dateTo: values.dateRange?.[1]?.format('YYYY-MM-DD'),
          });
        }}
        initialValues={{
          result: queryParams.result,
          source: queryParams.source,
          operatorTelegramId: queryParams.operatorTelegramId,
          targetTelegramId: queryParams.targetTelegramId,
          customerId: queryParams.customerId,
          dateRange:
            queryParams.dateFrom && queryParams.dateTo
              ? [dayjs(queryParams.dateFrom), dayjs(queryParams.dateTo)]
              : undefined,
        }}
      >
        <Form.Item name="result" label="结果">
          <Select
            allowClear
            style={{ width: 180 }}
            options={IMPORT_RESULTS.map((v) => ({ value: v, label: v }))}
          />
        </Form.Item>
        <Form.Item name="source" label="来源">
          <Select
            allowClear
            style={{ width: 200 }}
            options={IMPORT_SOURCES.map((v) => ({ value: v, label: v }))}
          />
        </Form.Item>
        <Form.Item name="operatorTelegramId" label="操作员 ID">
          <Input allowClear style={{ width: 140 }} />
        </Form.Item>
        <Form.Item name="targetTelegramId" label="目标 ID">
          <Input allowClear style={{ width: 140 }} />
        </Form.Item>
        <Form.Item name="customerId" label="客户 ID">
          <Input allowClear style={{ width: 180 }} />
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
        scroll={{ x: 1300 }}
        locale={{ emptyText: '暂无录入记录' }}
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

      <Drawer
        title="录入详情"
        width={520}
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        destroyOnHidden
      >
        {detail ? (
          <>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="ID">{detail.id}</Descriptions.Item>
              <Descriptions.Item label="时间">
                {formatDateTime(detail.createdAt)}
              </Descriptions.Item>
              <Descriptions.Item label="客户编号">
                {displayText(detail.customerCode)}
              </Descriptions.Item>
              <Descriptions.Item label="客户 ID">
                {displayText(detail.customerId)}
              </Descriptions.Item>
              <Descriptions.Item label="目标 Telegram ID">
                {detail.targetTelegramId == null
                  ? '—'
                  : String(detail.targetTelegramId)}
              </Descriptions.Item>
              <Descriptions.Item label="来源">{detail.source}</Descriptions.Item>
              <Descriptions.Item label="结果">{detail.result}</Descriptions.Item>
              <Descriptions.Item label="失败原因">
                {displayText(detail.failureReason)}
              </Descriptions.Item>
            </Descriptions>
            <PageHeader title="metadata" />
            <JsonViewer value={detail.metadata} />
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
