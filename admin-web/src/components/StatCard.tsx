import { Card, Typography } from 'antd';

type Props = {
  title: string;
  value: string;
  hint?: string;
};

export function StatCard({ title, value, hint }: Props) {
  return (
    <Card size="small" className="stat-card">
      <Typography.Text type="secondary">{title}</Typography.Text>
      <div className="stat-card-value">{value}</div>
      {hint ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {hint}
        </Typography.Text>
      ) : null}
    </Card>
  );
}
