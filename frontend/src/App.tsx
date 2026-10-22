import React, { useState } from 'react';
import { Layout, Typography, ConfigProvider, Menu } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { FlagOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { FlagListPage } from './pages/FlagListPage';
import { EvaluationConsolePage } from './pages/EvaluationConsolePage';
import { Environment } from './types';

const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'flags' | 'eval'>('flags');
  const [evalFlagKey, setEvalFlagKey] = useState<string>('');
  const [evalEnv, setEvalEnv] = useState<Environment>('development');

  const handleNavigateToEval = (flagKey: string, env: Environment) => {
    setEvalFlagKey(flagKey);
    setEvalEnv(env);
    setActiveTab('eval');
  };

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
            justifyContent: 'space-between',
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

          <Menu
            mode="horizontal"
            selectedKeys={[activeTab]}
            onClick={(e) => setActiveTab(e.key as 'flags' | 'eval')}
            style={{ borderBottom: 'none', lineHeight: '62px', minWidth: 320 }}
            items={[
              {
                key: 'flags',
                icon: <FlagOutlined />,
                label: '特性开关管理',
              },
              {
                key: 'eval',
                icon: <ThunderboltOutlined />,
                label: '在线评估控制台',
              },
            ]}
          />
        </Header>

        <Content style={{ padding: '0' }}>
          {activeTab === 'flags' ? (
            <FlagListPage onNavigateToEval={handleNavigateToEval} />
          ) : (
            <EvaluationConsolePage
              initialFlagKey={evalFlagKey}
              initialEnvironment={evalEnv}
              onNavigateToFlags={() => setActiveTab('flags')}
            />
          )}
        </Content>

        <Footer style={{ textAlign: 'center', color: '#8c8c8c', fontSize: 12, padding: '16px 24px' }}>
          Feature Flag Platform ©2026 Powered by Go + React + PostgreSQL
        </Footer>
      </Layout>
    </ConfigProvider>
  );
};

export default App;
