import React, { useMemo, useState, useEffect } from 'react';
import { Layout, Menu, Drawer } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { initTooltip } from '../utils/tooltip';
import { BrandLogo } from '../components/BrandLogo';
import { NavTabIcon } from '../components/NavTabIcon';
import { SiderToggleIcon } from '../components/SiderToggleIcon';
import './AppShell.css';

const { Sider, Content } = Layout;

export const AppShell: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = location.pathname;

  useEffect(() => {
    const cleanup = initTooltip();
    return cleanup;
  }, []);

  const selectedKeys = useMemo(() => {
    if (pathname.startsWith('/flags')) return ['/flags'];
    if (pathname.startsWith('/evaluations')) return ['/evaluations'];
    if (pathname.startsWith('/audit-logs')) return ['/audit-logs'];
    return ['/flags'];
  }, [pathname]);

  const menuItems = [
    {
      key: '/flags',
      icon: (
        <span>
          <NavTabIcon tab="flags" selected={selectedKeys.includes('/flags')} />
        </span>
      ),
      label: '功能开关',
    },
    {
      key: '/evaluations',
      icon: (
        <span>
          <NavTabIcon tab="evaluations" selected={selectedKeys.includes('/evaluations')} />
        </span>
      ),
      label: '规则评估',
    },
    {
      key: '/audit-logs',
      icon: (
        <span>
          <NavTabIcon tab="audit-logs" selected={selectedKeys.includes('/audit-logs')} />
        </span>
      ),
      label: '操作历史',
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: 'var(--canvas, #f6f6f4)' }}>
      {/* Desktop Sider */}
      <Sider
        className={`app-shell-sidebar sidebar ${collapsed ? 'collapsed' : ''}`}
        theme="light"
        width={156}
        collapsedWidth={64}
        collapsed={collapsed}
        trigger={null}
      >
        <div className="brand">
          {collapsed ? (
            <div className="brand-logo-frame collapsed-brand-control">
              <BrandLogo size={36} />
              <button
                type="button"
                className="icon-btn ghost sm expand-toggle sider-toggle-button"
                aria-label="展开侧边栏"
                data-tip="展开侧边栏"
                onClick={() => setCollapsed(false)}
              >
                <SiderToggleIcon direction="expand" size={32} />
              </button>
            </div>
          ) : (
            <>
              <div className="brand-text">
                <div className="brand-name">Feature Flag</div>
              </div>
              <button
                type="button"
                className="icon-btn ghost sm collapse-toggle sider-toggle-button"
                aria-label="折叠侧边栏"
                data-tip="折叠侧边栏"
                onClick={() => setCollapsed(true)}
              >
                <SiderToggleIcon direction="collapse" size={24} />
              </button>
            </>
          )}
        </div>

        <Menu
          className="nav custom-nav"
          mode="inline"
          inlineCollapsed={collapsed}
          selectedKeys={selectedKeys}
          onClick={(e) => navigate(e.key)}
          items={menuItems}
        />
      </Sider>

      {/* Main Workspace Layout */}
      <Layout
        className="app-shell-main workspace"
        style={{
          marginLeft: collapsed ? 64 : 156,
          minHeight: '100vh',
          background: 'var(--canvas, #f6f6f4)',
          transition: 'margin-left .18s ease',
        }}
      >
        {/* Mobile-only control; desktop keeps no global top bar at all. */}
        <div className="app-shell-mobile-bar">
          <button
            type="button"
            className="app-shell-menu-button icon-btn ghost sm"
            aria-label="打开导航菜单"
            onClick={() => setMobileMenuOpen(true)}
          >
            <svg className="i" viewBox="0 0 24 24">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        <Content className="app-shell-content" style={{ minHeight: '100vh' }}>
          <Outlet />
        </Content>
      </Layout>

      {/* Mobile Drawer (lazy mounted) */}
      {mobileMenuOpen && (
        <Drawer
          title={<span className="mobile-nav-brand">Feature Flag</span>}
          placement="left"
          width={156}
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          destroyOnClose
          styles={{ body: { padding: 0 } }}
          className="mobile-nav-drawer"
        >
          <Menu
            className="nav custom-nav"
            mode="inline"
            selectedKeys={selectedKeys}
            onClick={(e) => {
              setMobileMenuOpen(false);
              navigate(e.key);
            }}
            items={menuItems}
          />
        </Drawer>
      )}

      {/* Global Toast Stack & Tooltip container */}
      <div id="toastRoot" className="toast-stack" role="status" aria-live="polite" />
      <div id="tooltip" className="tooltip" role="tooltip" />
    </Layout>
  );
};
