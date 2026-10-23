import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Layout, Menu, Breadcrumb, Drawer } from 'antd';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { toast } from '../utils/toast';
import { initTooltip } from '../utils/tooltip';
import './AppShell.css';

const { Header, Sider, Content } = Layout;

export const AppShell: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const pathname = location.pathname;

  useEffect(() => {
    const cleanup = initTooltip();
    return cleanup;
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedKeys = useMemo(() => {
    if (pathname.startsWith('/flags')) return ['/flags'];
    if (pathname.startsWith('/evaluations')) return ['/evaluations'];
    if (pathname.startsWith('/audit-logs')) return ['/audit-logs'];
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
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1v12Z" />
              <path d="M4 22v-7" />
            </svg>
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
          ) : (
            <button
              type="button"
              className="icon-btn sm expand-toggle"
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

        <Menu
          className="nav custom-nav"
          mode="inline"
          selectedKeys={selectedKeys}
          onClick={(e) => navigate(e.key)}
          items={menuItems}
        />

        <div className="sidebar-foot">
          {!collapsed ? (
            <>
              <span>滴滴研发工具</span>
              <span>v1.0</span>
            </>
          ) : (
            <span>v1.0</span>
          )}
        </div>
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
        <Header className="topbar app-shell-header">
          <div className="topbar-left">
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
            <div className="breadcrumbs" data-testid="app-breadcrumb">
              <span className="crumb-link">研发平台 / Feature Flag</span>
              <span className="crumb-sep">/</span>
              <Breadcrumb items={breadcrumbItems} />
            </div>
          </div>

          <div className="topbar-right" ref={userMenuRef}>
            <div className="user-wrap">
              <button
                type="button"
                className="user-btn"
                aria-label="admin"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen(!userMenuOpen)}
              >
                <div className="avatar">AD</div>
                <span>admin</span>
                <svg className="i sm" viewBox="0 0 24 24" style={{ color: '#9c9690' }}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {userMenuOpen && (
                <div className="user-menu open">
                  <div className="user-menu-head">
                    <div className="avatar">AD</div>
                    <div>
                      <strong>admin</strong>
                      <span>超级管理员</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      setUserMenuOpen(false);
                      toast('个人设置已打开', 'info');
                    }}
                  >
                    个人设置
                  </button>
                  <button
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      setUserMenuOpen(false);
                      toast('已退出登录', 'info');
                    }}
                  >
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </Header>

        <Content className="app-shell-content" style={{ minHeight: 'calc(100vh - 64px)' }}>
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
            <div className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1v12Z" />
                <path d="M4 22v-7" />
              </svg>
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
          <div className="sidebar-foot" style={{ marginTop: 'auto', padding: '14px 18px' }}>
            <span>滴滴研发工具</span>
            <span>v1.0</span>
          </div>
        </Drawer>
      )}

      {/* Global Toast Stack & Tooltip container */}
      <div id="toastRoot" className="toast-stack" role="status" aria-live="polite" />
      <div id="tooltip" className="tooltip" role="tooltip" />
    </Layout>
  );
};
