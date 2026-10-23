import React, { useMemo, useState, useEffect } from 'react';
import { Layout, Menu, Drawer } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { initTooltip } from '../utils/tooltip';
import featureFlagLogo from '../assets/feature-flag-logo-light.png';
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
        <span className="nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1v12Z" />
            <path d="M4 22v-7" />
          </svg>
        </span>
      ),
      label: '功能开关',
    },
    {
      key: '/evaluations',
      icon: (
        <span className="nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M13.5 2.8 5 13h6.2l-.8 8.2L19 10.8h-6.2l.7-8Z" />
          </svg>
        </span>
      ),
      label: '规则评估',
    },
    {
      key: '/audit-logs',
      icon: (
        <span className="nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 3" />
          </svg>
        </span>
      ),
      label: '全局操作历史',
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: 'var(--canvas, #f6f6f4)' }}>
      {/* Desktop Sider */}
      <Sider
        className={`app-shell-sidebar sidebar ${collapsed ? 'collapsed' : ''}`}
        theme="light"
        width={256}
        collapsedWidth={72}
        collapsed={collapsed}
        trigger={null}
      >
        <div className="brand">
          <div className={`brand-logo-frame ${collapsed ? 'collapsed-brand-control' : ''}`}>
            <img className="brand-logo-image" src={featureFlagLogo} alt="FeatureFlag Logo" />
            {collapsed && (
              <button
                type="button"
                className="icon-btn ghost sm expand-toggle"
                aria-label="展开侧边栏"
                data-tip="展开侧边栏"
                onClick={() => setCollapsed(false)}
              >
                <svg className="i" viewBox="0 0 24 24">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            )}
          </div>
          {!collapsed && (
            <div className="brand-text">
              <div className="brand-name">Feature Flag</div>
              <div className="brand-sub">灰度规则平台</div>
            </div>
          )}
          {!collapsed ? (
            <button
              type="button"
              className="icon-btn ghost sm collapse-toggle"
              aria-label="折叠侧边栏"
              data-tip="折叠侧边栏"
              onClick={() => setCollapsed(true)}
            >
              <svg className="i" viewBox="0 0 24 24">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
          ) : null}
        </div>

        <Menu
          className="nav custom-nav"
          mode="inline"
          selectedKeys={selectedKeys}
          onClick={(e) => navigate(e.key)}
          items={menuItems}
        />
      </Sider>

      {/* Main Workspace Layout */}
      <Layout
        className="app-shell-main workspace"
        style={{
          marginLeft: collapsed ? 72 : 256,
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
          placement="left"
          width={264}
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          destroyOnClose
          styles={{ body: { padding: 0 } }}
          className="mobile-nav-drawer"
        >
          <div className="brand" style={{ padding: '0 18px', height: 68 }}>
            <div className="brand-logo-frame">
              <img className="brand-logo-image" src={featureFlagLogo} alt="FeatureFlag Logo" />
            </div>
            <div className="brand-text">
              <div className="brand-name">Feature Flag</div>
              <div className="brand-sub">灰度规则平台</div>
            </div>
          </div>
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
