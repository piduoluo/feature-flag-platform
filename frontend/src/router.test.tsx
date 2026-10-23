import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routeConfig } from './router';
import { api } from './api/client';

vi.mock('./api/client', () => ({
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

describe('Router & AppShell Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getFlag).mockResolvedValue({ id: 42, key: 'checkout', name: 'Checkout', description: '', environment: 'production', enabled: false, default_value: false, rules: [], created_at: '2026-01-01', updated_at: '2026-01-01' });
    vi.mocked(api.getFlags).mockResolvedValue({
      items: [],
      total: 0,
      stats: { all: 0, enabled: 0, disabled: 0 },
    });
    vi.mocked(api.getGlobalAuditLogs).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
    });
    vi.mocked(api.getAuditLogs).mockResolvedValue([]);
  });

  const renderRoute = (initialEntries: string[] = ['/']) => {
    const router = createMemoryRouter(routeConfig, {
      initialEntries,
    });
    const result = render(<RouterProvider router={router} />);
    return { router, ...result };
  };

  it('redirects root path "/" to "/flags"', async () => {
    const { router } = renderRoute(['/']);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/flags');
    });
    expect(screen.getByRole('heading', { name: '功能开关管理' })).toBeInTheDocument();
  });

  it('renders sidebar navigation with correct active state for "/flags"', async () => {
    renderRoute(['/flags']);

    // Check AppShell branding
    expect(screen.getByText('Feature Flag')).toBeInTheDocument();
    expect(screen.getByText('灰度规则平台')).toBeInTheDocument();

    // Check sidebar navigation menu items
    const flagsMenuItem = screen.getByRole('menuitem', { name: /功能开关/i });
    expect(flagsMenuItem).toBeInTheDocument();
    expect(flagsMenuItem).toHaveClass('ant-menu-item-selected');

    expect(screen.getByRole('menuitem', { name: /规则评估/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /全局操作历史/i })).toBeInTheDocument();

    // The global breadcrumb is gone; the page owns its single title.
    expect(screen.queryByTestId('app-breadcrumb')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '功能开关管理' })).toBeInTheDocument();
  });

  it('renders active sidebar state and page title for "/evaluations"', async () => {
    renderRoute(['/evaluations']);

    const evalMenuItem = screen.getByRole('menuitem', { name: /规则评估/i });
    expect(evalMenuItem).toHaveClass('ant-menu-item-selected');

    expect(screen.queryByTestId('app-breadcrumb')).not.toBeInTheDocument();
    expect(screen.getByText('确定性规则在线评估控制台')).toBeInTheDocument();
  });

  it('renders active sidebar state and page content for "/audit-logs"', async () => {
    renderRoute(['/audit-logs']);

    const auditMenuItem = screen.getByRole('menuitem', { name: /全局操作历史/i });
    expect(auditMenuItem).toHaveClass('ant-menu-item-selected');

    expect(screen.queryByTestId('app-breadcrumb')).not.toBeInTheDocument();
    expect(screen.getByTestId('global-audit-logs-page')).toBeInTheDocument();
  });

  it('renders the Flag detail page without a global breadcrumb for "/flags/:id"', async () => {
    const { router } = renderRoute(['/flags/42']);

    // Sidebar should keep "功能开关" selected
    const flagsMenuItem = screen.getByRole('menuitem', { name: /功能开关/i });
    expect(flagsMenuItem).toHaveClass('ant-menu-item-selected');

    // No global breadcrumb, and no invented back-link in the shell.
    expect(screen.queryByTestId('app-breadcrumb')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '功能开关' })).not.toBeInTheDocument();

    // The deep link loads the requested Flag.
    await screen.findByRole('heading', { name: 'Checkout' });
    expect(api.getFlag).toHaveBeenCalledWith(42);

    // Sidebar navigation remains the way back to the list.
    fireEvent.click(flagsMenuItem);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/flags');
    });
  });

  it('navigates cleanly between routes via sidebar menu clicks', async () => {
    const { router } = renderRoute(['/flags']);

    // Click "规则评估"
    const evalMenuItem = screen.getByRole('menuitem', { name: /规则评估/i });
    fireEvent.click(evalMenuItem);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/evaluations');
    });

    // Click "全局操作历史"
    const auditMenuItem = screen.getByRole('menuitem', { name: /全局操作历史/i });
    fireEvent.click(auditMenuItem);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/audit-logs');
    });
    expect(screen.getByTestId('global-audit-logs-page')).toBeInTheDocument();

    // Click "功能开关"
    const flagsMenuItem = screen.getByRole('menuitem', { name: /功能开关/i });
    fireEvent.click(flagsMenuItem);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/flags');
    });
    expect(screen.getByRole('heading', { name: '功能开关管理' })).toBeInTheDocument();
  });

  it('redirects unknown path to "/flags"', async () => {
    const { router } = renderRoute(['/unknown-sub-route-path']);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/flags');
    });
  });

  it('redirects /evaluation to /evaluations while preserving search params', async () => {
    const { router } = renderRoute(['/evaluation?key=checkout&env=staging']);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/evaluations');
    });
    expect(router.state.location.search).toBe('?key=checkout&env=staging');
  });

  it('redirects /audit to /audit-logs while preserving search params', async () => {
    const { router } = renderRoute(['/audit?flag_key=checkout']);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/audit-logs');
    });
    expect(router.state.location.search).toBe('?flag_key=checkout');
  });

  it('normalizes the legacy /flags/:id/:tab route to one canonical URL', async () => {
    const { router } = renderRoute(['/flags/42/audit']);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/flags/42');
    });
    expect(router.state.location.search).toBe('');
    expect(api.getFlag).toHaveBeenCalledWith(42);
    expect(screen.getByTestId('flag-detail-page')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '变更历史' })).toHaveAttribute('aria-selected', 'true');
  });
});
