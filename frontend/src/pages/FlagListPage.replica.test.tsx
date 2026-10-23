import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routeConfig } from '../router';
import { api } from '../api/client';
import { Flag } from '../types';

vi.mock('../api/client', () => ({
  api: {
    getFlags: vi.fn(),
    createFlag: vi.fn(),
    toggleFlag: vi.fn(),
    getFlag: vi.fn(),
    updateFlag: vi.fn(),
    getAuditLogs: vi.fn(),
    syncRules: vi.fn(),
    evaluate: vi.fn(),
  },
}));

describe('FlagListPage 1:1 Prototype Replica', () => {
  const sampleFlags: Flag[] = [
    {
      id: 1,
      key: 'ai_ride_assistant_enabled',
      name: 'AI 行程助手',
      description: '仅对演示测试用户开放 AI 行程助手',
      environment: 'production',
      enabled: true,
      default_value: false,
      created_at: '2026-10-22T10:00:00Z',
      updated_at: '2026-10-22T10:00:00Z',
    },
    {
      id: 2,
      key: 'safety_ai_upgrade_enabled',
      name: '安全 AI 功能升级',
      description: '演示安全功能的开关与紧急关闭',
      environment: 'production',
      enabled: false,
      default_value: false,
      created_at: '2026-10-22T10:00:00Z',
      updated_at: '2026-10-22T10:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getFlags).mockResolvedValue({
      items: sampleFlags,
      total: 2,
      stats: { all: 2, enabled: 1, disabled: 1 },
    });
    vi.mocked(api.getFlag).mockResolvedValue(sampleFlags[0]);
  });

  const renderWithRouter = (initialEntries: string[] = ['/flags']) => {
    const router = createMemoryRouter(routeConfig, { initialEntries });
    return { router, ...render(<RouterProvider router={router} />) };
  };

  it('switches between list and grid views', async () => {
    renderWithRouter(['/flags']);

    await screen.findByText('ai_ride_assistant_enabled');

    // Initially in table (list) view
    expect(screen.getByRole('table')).toBeInTheDocument();

    // Click grid view button
    const gridBtn = screen.getByRole('button', { name: /宫格视图/i });
    fireEvent.click(gridBtn);

    // In grid view, flag-grid cards are rendered
    expect(screen.getByLabelText('Flag 宫格视图')).toBeInTheDocument();
    expect(screen.getAllByRole('article').length).toBe(2);

    // Switch back to list view
    const listBtn = screen.getByRole('button', { name: /列表视图/i });
    fireEvent.click(listBtn);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows live status stats instead of a separate status filter button', async () => {
    renderWithRouter(['/flags']);

    await screen.findByText('ai_ride_assistant_enabled');
    expect(screen.getByText('safety_ai_upgrade_enabled')).toBeInTheDocument();

    const stats = screen.getByRole('group', { name: 'Flag 状态统计' });
    expect(stats).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /已启用/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /已停用/ })).toHaveTextContent('1');

    // Status filtering is carried by the three stat buttons, never by a
    // standalone filter control.
    expect(screen.queryByRole('button', { name: /筛选启停状态/i })).not.toBeInTheDocument();
  });

  it('filters by status through the stat buttons while keeping the summary stable', async () => {
    const { router } = renderWithRouter(['/flags']);

    await screen.findByText('ai_ride_assistant_enabled');

    fireEvent.click(screen.getByRole('button', { name: /已启用/ }));

    await waitFor(() => {
      expect(router.state.location.search).toContain('enabled=true');
    });
    await waitFor(() => {
      expect(api.getFlags).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true, page: 1 })
      );
    });
    // The server summary ignores the status filter, so the stat stays at 2.
    expect(screen.getByRole('button', { name: /全部 Flag/ })).toHaveTextContent('2');

    fireEvent.click(screen.getByRole('button', { name: /全部 Flag/ }));
    await waitFor(() => {
      expect(router.state.location.search).not.toContain('enabled=');
    });
  });

  it('copies Flag Key to clipboard and shows toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderWithRouter(['/flags']);

    await screen.findByText('ai_ride_assistant_enabled');

    const copyBtn = screen.getAllByRole('button', { name: /复制 Key/i })[0];
    fireEvent.click(copyBtn);

    const toastRoot = document.getElementById('toastRoot');
    await waitFor(() => expect(toastRoot).toHaveTextContent(/已复制/));
    expect(writeText).toHaveBeenCalledWith('ai_ride_assistant_enabled');
  });
});
