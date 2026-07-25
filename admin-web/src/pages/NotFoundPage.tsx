import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Result
      status="404"
      title="页面不存在"
      subTitle="您访问的地址无效，或页面已被移除。"
      extra={
        <Button type="primary" onClick={() => navigate('/dashboard')}>
          返回首页
        </Button>
      }
    />
  );
}
