import React from 'react';
import { useParams } from 'react-router-dom';
import { Card, Typography } from 'antd';

const { Title, Paragraph } = Typography;

export const FlagDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <Card data-testid="flag-detail-page">
      <Title level={4}>Flag 详情 (ID: {id})</Title>
      <Paragraph type="secondary">
        全屏工作台将在 Ticket 03 中完整就绪。
      </Paragraph>
    </Card>
  );
};
