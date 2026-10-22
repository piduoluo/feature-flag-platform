import React from 'react';
import { Layout, Typography, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { FlagOutlined } from '@ant-design/icons';
import { FlagListPage } from './pages/FlagListPage';

const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;

export const App: React.FC = () => {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
        },
      }}
    >
      <Layout style={{ minHeight: '100vh', background: '#f5f7fa' }}>
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            background: '#ffffff',
            borderBottom: '1px solid #f0f0f0',
            padding: '0 24px',
            height: 64,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: '#1677ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 20,
              }}
            >
              <FlagOutlined />
            </div>
            <div>
              <Title level={4} style={{ margin: 0, lineHeight: 1.2 }}>
                Feature Flag 与灰度规则平台
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                特性开关 · 灰度规则 · 确定性评估 · 原子审计
              </Text>
            </div>
          </div>
        </Header>

        <Content style={{ padding: '0' }}>
          <FlagListPage />
        </Content>

        <Footer style={{ textAlign: 'center', color: '#8c8c8c', fontSize: 12, padding: '16px 24px' }}>
          Feature Flag Platform ©2026 Powered by Go + React + PostgreSQL
        </Footer>
      </Layout>
    </ConfigProvider>
  );
};

export default App;
