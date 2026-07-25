import { Space, Typography } from 'antd';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  extra?: ReactNode;
};

export function PageHeader({ title, extra }: Props) {
  return (
    <div className="page-header">
      <Typography.Title level={4} style={{ margin: 0 }}>
        {title}
      </Typography.Title>
      {extra ? <Space wrap>{extra}</Space> : null}
    </div>
  );
}
