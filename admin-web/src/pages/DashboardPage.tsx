import { useState } from 'react';
import { Button, Col, Row, Skeleton, Space, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { fetchDashboardSummary } from '@/api/dashboard';
import { PageHeader } from '@/components/PageHeader';
import { StatCard } from '@/components/StatCard';
import { ErrorState } from '@/components/ErrorState';
import { getErrorMessage } from '@/utils/errors';
import { formatNumber } from '@/utils/format';

dayjs.extend(utc);
dayjs.extend(timezone);

export function DashboardPage() {
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: async () => {
      const data = await fetchDashboardSummary();
      setRefreshedAt(dayjs().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss'));
      return data;
    },
  });

  if (query.isLoading) {
    return (
      <div>
        <PageHeader title="数据概览" />
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div>
        <PageHeader title="数据概览" />
        <ErrorState
          message={getErrorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const d = query.data;

  return (
    <div>
      <PageHeader
        title="数据概览"
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
      <Typography.Paragraph type="secondary">
        统计「今日」按服务端 APP_TIMEZONE；页面时间展示为中国时间（Asia/Shanghai）。
        {refreshedAt ? ` 最后刷新：${refreshedAt}` : null}
      </Typography.Paragraph>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={8} xl={6}>
          <StatCard title="正式客户总数" value={formatNumber(d.identifiedCustomers)} />
        </Col>
        <Col xs={24} sm={12} lg={8} xl={6}>
          <StatCard title="待确认客户" value={formatNumber(d.pendingCustomers)} />
        </Col>
        <Col xs={24} sm={12} lg={8} xl={6}>
          <StatCard title="今日新增客户" value={formatNumber(d.todayCreatedCustomers)} />
        </Col>
        <Col xs={24} sm={12} lg={8} xl={6}>
          <StatCard title="今日待确认客户" value={formatNumber(d.todayPendingCustomers)} />
        </Col>
        <Col xs={24} sm={12} lg={8} xl={6}>
          <StatCard title="今日重复录入" value={formatNumber(d.todayDuplicateImports)} />
        </Col>
        <Col xs={24} sm={12} lg={8} xl={6}>
          <StatCard title="今日失败录入" value={formatNumber(d.todayFailedImports)} />
        </Col>
        <Col xs={24} sm={12} lg={8} xl={6}>
          <StatCard title="累计录入记录" value={formatNumber(d.totalImportLogs)} />
        </Col>
      </Row>
      <Space wrap style={{ marginTop: 24 }}>
        <Link to="/customers">
          <Button type="primary">查看客户</Button>
        </Link>
        <Link to="/pending-customers">
          <Button>处理待确认</Button>
        </Link>
        <Link to="/import-logs">
          <Button>查看录入记录</Button>
        </Link>
      </Space>
    </div>
  );
}
