import React from 'react';
import { Card, Typography } from 'antd';

const { Title, Paragraph } = Typography;

export const GlobalAuditLogsPage: React.FC = () => {
  return (
    <Card data-testid="global-audit-logs-page">
      <Title level={4}>全局操作历史</Title>
      <Paragraph type="secondary">
        全局运维审计全功能控制台将在 Ticket 08B 中完整就绪。
      </Paragraph>
    </Card>
  );
};
