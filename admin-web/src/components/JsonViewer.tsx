import { Typography } from 'antd';

type Props = {
  value: unknown;
};

export function JsonViewer({ value }: Props) {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }

  return (
    <Typography.Paragraph>
      <pre className="json-viewer">{text}</pre>
    </Typography.Paragraph>
  );
}
