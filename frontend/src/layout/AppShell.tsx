import React, { useMemo, useState } from 'react';
import { Layout, Menu, Breadcrumb, Typography, Button, Drawer } from 'antd';
import { FlagOutlined, ThunderboltOutlined, HistoryOutlined, MenuOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import './AppShell.css';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export const AppShell: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = location.pathname;

  const selectedKeys = useMemo(() => {
    if (pathname.startsWith('/flags')) {
      return ['/flags'];
    }
    if (pathname.startsWith('/evaluations')) {
      return ['/evaluations'];
    }
    if (pathname.startsWith('/audit-logs')) {
      return ['/audit-logs'];
    }
    return ['/flags'];
  }, [pathname]);

  const breadcrumbItems = useMemo(() => {
    if (pathname === '/flags' || pathname === '/') {
      return [{ key: 'flags', title: '功能开关' }];
    }
    if (pathname.startsWith('/flags/')) {
      return [
        {
          key: 'flags',
          title: <Link to="/flags">功能开关</Link>,
        },
        {
          key: 'detail',
          title: '详情',
        },
      ];
    }
    if (pathname.startsWith('/evaluations')) {
      return [{ key: 'evaluations', title: '规则评估' }];
    }
    if (pathname.startsWith('/audit-logs')) {
      return [{ key: 'audit-logs', title: '全局操作历史' }];
    }
    return [
      {
        key: 'flags',
        title: <Link to="/flags">功能开关</Link>,
      },
      {
        key: 'other',
        title: '未知页面',
      },
    ];
  }, [pathname]);

  const menuItems = [
    {
      key: '/flags',
      icon: <FlagOutlined />,
      label: '功能开关',
    },
    {
      key: '/evaluations',
      icon: <ThunderboltOutlined />,
      label: '规则评估',
    },
    {
      key: '/audit-logs',
      icon: <HistoryOutlined />,
      label: '全局操作历史',
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f7fa' }}>
      <Sider
        className="app-shell-sidebar"
        theme="light"
        width={220}
        style={{
          borderRight: '1px solid #f0f0f0',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          zIndex: 100,
          overflow: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 20px',
            borderBottom: '1px solid #f0f0f0',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: '#1677ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 18,
            }}
          >
            <FlagOutlined />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: '#1f1f1f', lineHeight: 1.2 }}>
              Feature Flag
            </div>
            <Text type="secondary" style={{ fontSize: 11 }}>
              灰度规则平台
            </Text>
          </div>
        </div>

        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          onClick={(e) => navigate(e.key)}
          style={{ borderRight: 'none', marginTop: 8 }}
          items={menuItems}
        />
      </Sider>

      <Layout className="app-shell-main" style={{ minHeight: '100vh', background: '#f5f7fa' }}>
        <Header
          className="app-shell-header"
          style={{
            background: '#ffffff',
            height: 56,
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Button
            className="app-shell-menu-button"
            type="text"
            icon={<MenuOutlined />}
            aria-label="打开导航菜单"
            onClick={() => setMobileMenuOpen(true)}
          />
          <Breadcrumb data-testid="app-breadcrumb" items={breadcrumbItems} />
        </Header>

        <Content className="app-shell-content" style={{ minHeight: 'calc(100vh - 56px)' }}>
          <Outlet />
        </Content>
      </Layout>
      <Drawer
        title="导航"
        placement="left"
        width={220}
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        styles={{ body: { padding: 0 } }}
      >
        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          onClick={(e) => { setMobileMenuOpen(false); navigate(e.key); }}
          style={{ borderRight: 'none' }}
          items={menuItems}
        />
      </Drawer>
    </Layout>
  );
};
