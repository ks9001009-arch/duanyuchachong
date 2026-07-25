import { Button, Descriptions, Skeleton, Space, Table, Tag, message } from 'antd';
import { ArrowLeftOutlined, CopyOutlined, LinkOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchCustomerById } from '@/api/customers';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/ErrorState';
import { getErrorMessage } from '@/utils/errors';
import {
  displayText,
  displayUsername,
  formatDateTime,
} from '@/utils/format';
import type { ImportLogItem, PendingCustomer } from '@/types/api';

export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ['customer', id],
    queryFn: () => fetchCustomerById(id),
    enabled: Boolean(id),
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div>
        <PageHeader title="客户详情" />
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    );
  }

  if (query.isError || !query.data) {
    const msg = getErrorMessage(query.error);
    const notFound = msg.includes('不存在');
    return (
      <div>
        <PageHeader
          title="客户详情"
          extra={
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/customers')}>
              返回列表
            </Button>
          }
        />
        <ErrorState
          message={notFound ? '客户不存在或已被删除' : msg}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const c = query.data;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(String(c.telegramId));
      message.success('已复制 Telegram ID');
    } catch {
      message.error('复制失败');
    }
  };

  return (
    <div>
      <PageHeader
        title={`客户详情 · ${c.customerCode}`}
        extra={
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/customers')}>
              返回列表
            </Button>
            <Button icon={<CopyOutlined />} onClick={() => void copyId()}>
              复制 Telegram ID
            </Button>
            {c.archiveMessageLink ? (
              <Button
                icon={<LinkOutlined />}
                href={c.archiveMessageLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                打开存档
              </Button>
            ) : null}
          </Space>
        }
      />

      <Descriptions bordered size="small" column={{ xs: 1, md: 2 }}>
        <Descriptions.Item label="客户编号">{c.customerCode}</Descriptions.Item>
        <Descriptions.Item label="Telegram ID">{String(c.telegramId)}</Descriptions.Item>
        <Descriptions.Item label="username">
          {displayUsername(c.username)}
        </Descriptions.Item>
        <Descriptions.Item label="displayName">
          {displayText(c.displayName)}
        </Descriptions.Item>
        <Descriptions.Item label="firstName">
          {displayText(c.firstName)}
        </Descriptions.Item>
        <Descriptions.Item label="lastName">
          {displayText(c.lastName)}
        </Descriptions.Item>
        <Descriptions.Item label="状态">
          {c.status === 'IDENTIFIED' ? (
            <Tag color="green">已识别</Tag>
          ) : (
            <Tag>{c.status}</Tag>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="首次录入人">
          {displayText(c.firstImportedName || c.firstImportedUsername)}（
          {String(c.firstImportedById)}）
        </Descriptions.Item>
        <Descriptions.Item label="首次录入来源">
          {c.firstImportSource}
        </Descriptions.Item>
        <Descriptions.Item label="首次录入时间">
          {formatDateTime(c.firstImportedAt)}
        </Descriptions.Item>
        <Descriptions.Item label="最后观察时间">
          {formatDateTime(c.lastObservedAt)}
        </Descriptions.Item>
        <Descriptions.Item label="创建时间">
          {formatDateTime(c.createdAt)}
        </Descriptions.Item>
        <Descriptions.Item label="更新时间">
          {formatDateTime(c.updatedAt)}
        </Descriptions.Item>
        <Descriptions.Item label="存档链接" span={2}>
          {c.archiveMessageLink ? (
            <a
              href={c.archiveMessageLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              {c.archiveMessageLink}
            </a>
          ) : (
            '—'
          )}
        </Descriptions.Item>
      </Descriptions>

      <PageHeader title="关联 Pending" />
      <Table<PendingCustomer>
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 900 }}
        dataSource={c.resolvedPendingRecords ?? []}
        locale={{ emptyText: '无关联 Pending' }}
        columns={[
          { title: 'Pending 编号', dataIndex: 'pendingCode', width: 120 },
          { title: '状态', dataIndex: 'status', width: 120 },
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
        ]}
      />

      <PageHeader title="最近录入日志" />
      <Table<ImportLogItem>
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ x: 1000 }}
        dataSource={c.importLogs ?? []}
        locale={{ emptyText: '暂无录入日志' }}
        columns={[
          {
            title: '时间',
            dataIndex: 'createdAt',
            width: 180,
            render: formatDateTime,
          },
          { title: '来源', dataIndex: 'source', width: 160 },
          { title: '结果', dataIndex: 'result', width: 140 },
          {
            title: '失败原因',
            dataIndex: 'failureReason',
            ellipsis: true,
            render: (v: string | null) => displayText(v),
          },
          {
            title: '操作员',
            dataIndex: 'operatorTelegramId',
            width: 140,
            render: (v: string) => String(v),
          },
        ]}
      />

      <div style={{ marginTop: 16 }}>
        <Link to="/customers">← 返回客户列表</Link>
      </div>
    </div>
  );
}
