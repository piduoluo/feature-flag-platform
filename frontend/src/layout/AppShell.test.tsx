import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    vi.mocked(api.getFlags).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(api.getGlobalAuditLogs).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20 });
    const toastRoot = document.getElementById('toastRoot');
    if (toastRoot) toastRoot.innerHTML = '';
  });

  const renderRoute = (initialEntries: string[] = ['/flags']) => {
    const router = createMemoryRouter(routeConfig, { initialEntries });
    return render(<RouterProvider router={router} />);
  };

  it('renders design system branding and sidebar elements', () => {
    renderRoute(['/flags']);

    expect(screen.getByText('Feature Flag')).toBeInTheDocument();
    expect(screen.getByText('灰度规则平台')).toBeInTheDocument();
    expect(screen.getByText('滴滴研发工具')).toBeInTheDocument();
    expect(screen.getByText('v1.0')).toBeInTheDocument();

    const breadcrumb = screen.getByTestId('app-breadcrumb');
    expect(breadcrumb).toHaveTextContent('研发平台');
    expect(breadcrumb).toHaveTextContent('Feature Flag');
    expect(breadcrumb).toHaveTextContent('功能开关');
  });

  it('toggles user menu dropdown with admin information', async () => {
    renderRoute(['/flags']);

    const userButton = screen.getByRole('button', { name: /admin/i });
    expect(userButton).toBeInTheDocument();

    // Initially menu is closed
    expect(screen.queryByText('超级管理员')).not.toBeInTheDocument();

    // Click to open
    fireEvent.click(userButton);
    expect(screen.getByText('超级管理员')).toBeInTheDocument();
    expect(screen.getByText('个人设置')).toBeInTheDocument();
    expect(screen.getByText('退出登录')).toBeInTheDocument();

    // Clicking personal settings shows toast
    fireEvent.click(screen.getByText('个人设置'));
    expect(document.getElementById('toastRoot')).toHaveTextContent('个人设置已打开');
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
    renderRoute(['/flags']);

    const collapseBtn = screen.getByRole('button', { name: /折叠侧边栏/i });
    fireEvent.click(collapseBtn);

    // After collapsing, expand button appears
    const expandBtn = screen.getByRole('button', { name: /展开侧边栏/i });
    expect(expandBtn).toBeInTheDocument();

    // Click to expand again
    fireEvent.click(expandBtn);
    expect(screen.getByRole('button', { name: /折叠侧边栏/i })).toBeInTheDocument();
  });
});
