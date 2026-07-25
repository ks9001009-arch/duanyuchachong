import { Button, Result } from 'antd';

type Props = {
  message?: string;
  onRetry?: () => void;
};

export function ErrorState({ message = '加载失败', onRetry }: Props) {
  return (
    <Result
      status="error"
      title="出错了"
      subTitle={message}
      extra={
        onRetry ? (
          <Button type="primary" onClick={onRetry}>
            重试
          </Button>
        ) : undefined
      }
    />
  );
}

export function EmptyState({ description = '暂无数据' }: { description?: string }) {
  return (
    <Result status="info" title={description} style={{ padding: '24px 0' }} />
  );
}
