import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routeConfig } from '../router';
import { api } from '../api/client';
import { toast } from '../utils/toast';

vi.mock('../api/client', () => ({
  api: {
    getFlags: vi.fn(),
    getFlag: vi.fn(),
    createFlag: vi.fn(),
    updateFlag: vi.fn(),
    toggleFlag: vi.fn(),
    evaluate: vi.fn(),
    getAuditLogs: vi.fn(),
    getGlobalAuditLogs: vi.fn(),
    syncRules: vi.fn(),
  },
}));

describe('AppShell 1:1 Design & Interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getFlags).mockResolvedValue({ items: [], total: 0, stats: { all: 0, enabled: 0, disabled: 0 } });
    vi.mocked(api.getGlobalAuditLogs).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
    const toastRoot = document.getElementById('toastRoot');
    if (toastRoot) toastRoot.innerHTML = '';
  });

  const renderRoute = (initialEntries: string[] = ['/flags']) => {
    const router = createMemoryRouter(routeConfig, { initialEntries });
    return render(<RouterProvider router={router} />);
  };

  it('renders confirmed product branding without unsupported vendor/version copy', () => {
    renderRoute(['/flags']);

    const productLogo = screen.getByRole('img', { name: 'FeatureFlag Logo' });
    expect(productLogo).toHaveAttribute('src', expect.stringContaining('feature-flag-logo-light.png'));
    expect(screen.getByText('Feature Flag')).toBeInTheDocument();
    expect(screen.getByText('灰度规则平台')).toBeInTheDocument();
    expect(screen.queryByText('滴滴研发工具')).not.toBeInTheDocument();
    expect(screen.queryByText('v1.0')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /admin/i })).not.toBeInTheDocument();
    expect(screen.queryByText('个人设置')).not.toBeInTheDocument();
    expect(screen.queryByText('退出登录')).not.toBeInTheDocument();
  });

  it('removes the global breadcrumb and desktop top bar, keeping a mobile nav control', () => {
    const { container } = renderRoute(['/flags']);

    expect(screen.queryByTestId('app-breadcrumb')).not.toBeInTheDocument();
    expect(screen.queryByText('研发平台')).not.toBeInTheDocument();
    expect(container.querySelector('.app-shell-header')).toBeNull();
    expect(container.querySelector('.ant-layout-header')).toBeNull();

    // The hamburger only exists for the narrow layout; CSS hides it on desktop.
    expect(screen.getByRole('button', { name: '打开导航菜单' })).toBeInTheDocument();
    expect(container.querySelector('.app-shell-mobile-bar')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '功能开关列表' })).toBeInTheDocument();
  });

  it('triggers toast notifications and limits stack size to 3', () => {
    renderRoute(['/flags']);

    toast('提示 1', 'info');
    toast('提示 2', 'success');
    toast('提示 3', 'error');
    toast('提示 4', 'info');

    const toastRoot = document.getElementById('toastRoot');
    expect(toastRoot).not.toBeNull();
    expect(toastRoot?.children.length).toBeLessThanOrEqual(3);
    expect(toastRoot).toHaveTextContent('提示 4');
    expect(toastRoot).not.toHaveTextContent('提示 1');
  });

  it('supports desktop sidebar collapse and expansion', () => {
    const { container } = renderRoute(['/flags']);

    const collapseBtn = screen.getByRole('button', { name: /折叠侧边栏/i });
    fireEvent.click(collapseBtn);

    const sidebar = container.querySelector('.app-shell-sidebar');
    const logoControl = container.querySelector('.collapsed-brand-control');
    expect(sidebar).toHaveClass('collapsed');
    expect(logoControl).toContainElement(screen.getByRole('img', { name: 'FeatureFlag Logo' }));

    // The expand button shares the logo's 36px hover/focus target.
    const expandBtn = screen.getByRole('button', { name: /展开侧边栏/i });
    expect(logoControl).toContainElement(expandBtn);

    fireEvent.click(expandBtn);
    expect(screen.getByRole('button', { name: /折叠侧边栏/i })).toBeInTheDocument();
    expect(container.querySelector('.collapsed-brand-control')).not.toBeInTheDocument();
  });

  it('dismisses the toggle tooltip once the button it points at is swapped out', () => {
    renderRoute(['/flags']);
    const tooltip = document.getElementById('tooltip') as HTMLElement;
    expect(tooltip).not.toBeNull();
    tooltip.classList.remove('show');

    const collapseBtn = screen.getByRole('button', { name: /折叠侧边栏/i });
    fireEvent.mouseOver(collapseBtn);
    expect(tooltip).toHaveClass('show');
    expect(tooltip).toHaveTextContent('折叠侧边栏');

    // Collapsing unmounts the hovered button, which fires no mouseout; the tip
    // used to linger with the old action's label.
    fireEvent.click(collapseBtn);
    expect(tooltip).not.toHaveClass('show');

    const expandBtn = screen.getByRole('button', { name: /展开侧边栏/i });
    fireEvent.mouseOver(expandBtn);
    expect(tooltip).toHaveTextContent('展开侧边栏');
    expect(tooltip).toHaveClass('show');

    fireEvent.click(expandBtn);
    expect(tooltip).not.toHaveClass('show');
  });
});
