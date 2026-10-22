import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routeConfig } from '../router';
import { api, ApiError } from '../api/client';
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
  ApiError: class ApiError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.name = 'ApiError';
      this.code = code;
      this.status = status;
    }
  },
}));

describe('FlagListPage (Ticket 02)', () => {
  const demoFlag: Flag = {
    id: 1,
    key: 'checkout_v2',
    name: '新版结算页结账流',
    description: '支持分期付款与新优惠券体系的重构结算链路',
    environment: 'production',
    enabled: true,
    default_value: false,
    created_at: '2026-10-22T10:00:00Z',
    updated_at: '2026-10-22T10:00:00Z',
  };

  const devFlag: Flag = {
    id: 2,
    key: 'checkout_v2',
    name: '开发环境结算流',
    description: '同一 Key 跨环境测试',
    environment: 'development',
    enabled: false,
    default_value: true,
    created_at: '2026-10-22T10:00:00Z',
    updated_at: '2026-10-22T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getFlags).mockResolvedValue({
      items: [],
      total: 0,
    });
    // Detail navigation tests mount FlagDetailPage, which immediately calls getFlag(id).
    vi.mocked(api.getFlag).mockResolvedValue(demoFlag);
  });

  const renderWithRouter = (initialEntries: string[] = ['/flags']) => {
    const router = createMemoryRouter(routeConfig, {
      initialEntries,
    });
    const result = render(<RouterProvider router={router} />);
    return { router, ...result };
  };

  it('SPEC-US 35: renders demo data with initialized Flag checkout_v2 and status badges', async () => {
    vi.mocked(api.getFlags).mockResolvedValue({
      items: [demoFlag],
      total: 1,
    });

    renderWithRouter(['/flags']);

    expect(screen.getByText('Feature Flag 特性开关管理')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /新建 Flag/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(api.getFlags).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: undefined,
          page: 1,
          page_size: 10,
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('checkout_v2')).toBeInTheDocument();
      expect(screen.getByText('新版结算页结账流')).toBeInTheDocument();
      expect(screen.getAllByText('Production').length).toBeGreaterThan(0);
      expect(screen.getByText('已启用')).toBeInTheDocument();
      expect(screen.getAllByText('false').length).toBeGreaterThan(0);
    });
  });

  it('renders empty placeholder when no flags found', async () => {
    vi.mocked(api.getFlags).mockResolvedValue({
      items: [],
      total: 0,
    });

    renderWithRouter(['/flags']);

    await waitFor(() => {
      expect(screen.getByText(/当前环境暂无 Feature Flag/i)).toBeInTheDocument();
    });
  });

  it('SPEC-US 04 & UI-R 03: restores filter condition from URL query (?environment=staging&search=demo)', async () => {
    vi.mocked(api.getFlags).mockResolvedValue({
      items: [
        {
          ...demoFlag,
          environment: 'staging',
          name: 'Staging Demo Flag',
        },
      ],
      total: 1,
    });

    const { router } = renderWithRouter(['/flags?environment=staging&search=demo']);

    await waitFor(() => {
      expect(api.getFlags).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'staging',
          search: 'demo',
          page: 1,
          page_size: 10,
        })
      );
    });

    // Verify search input displays the search text from query
    const searchInput = screen.getByPlaceholderText('按 Key 或名称搜索...') as HTMLInputElement;
    expect(searchInput.value).toBe('demo');

    // Verify URL location keeps query params intact
    expect(router.state.location.search).toContain('environment=staging');
    expect(router.state.location.search).toContain('search=demo');
  });

  it('SPEC-US 04 & UI-R 03: switching environment Segmented updates URL Query and triggers refetch', async () => {
    vi.mocked(api.getFlags).mockResolvedValue({
      items: [],
      total: 0,
    });

    const { router } = renderWithRouter(['/flags']);

    await waitFor(() => {
      expect(api.getFlags).toHaveBeenCalled();
    });

    // Click 'Development'
    const devOption = screen.getByText('Development');
    fireEvent.click(devOption);

    await waitFor(() => {
      expect(router.state.location.search).toContain('environment=development');
    });

    await waitFor(() => {
      expect(api.getFlags).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'development',
        })
      );
    });

    // Click '全部环境'
    const allOption = screen.getByText('全部环境');
    fireEvent.click(allOption);

    await waitFor(() => {
      expect(router.state.location.search).not.toContain('environment=development');
    });

    await waitFor(() => {
      expect(api.getFlags).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: undefined,
        })
      );
    });
  });

  it('SPEC-US 04 & UI-R 03: typing search keyword updates URL Query and triggers refetch', async () => {
    vi.mocked(api.getFlags).mockResolvedValue({
      items: [],
      total: 0,
    });

    const { router } = renderWithRouter(['/flags']);

    await waitFor(() => {
      expect(api.getFlags).toHaveBeenCalled();
    });

    const searchInput = screen.getByPlaceholderText('按 Key 或名称搜索...');
    fireEvent.change(searchInput, { target: { value: 'checkout_v2' } });

    await waitFor(() => {
      expect(router.state.location.search).toContain('search=checkout_v2');
    });

    await waitFor(() => {
      expect(api.getFlags).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'checkout_v2',
        })
      );
    });

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });

    await waitFor(() => {
      expect(router.state.location.search).not.toContain('search=checkout_v2');
    });

    await waitFor(() => {
      expect(api.getFlags).toHaveBeenCalledWith(
        expect.objectContaining({
          search: undefined,
        })
      );
    });
  });

  it('SPEC-US 07 & UI-R 06: inline switch toggle calls PATCH /api/v1/flags/:id/toggle and updates state with server response', async () => {
    vi.mocked(api.getFlags).mockResolvedValue({
      items: [{ ...demoFlag, enabled: false }],
      total: 1,
    });

    const updatedEntity: Flag = {
      ...demoFlag,
      enabled: true,
      updated_at: '2026-10-22T10:05:00Z',
    };
    vi.mocked(api.toggleFlag).mockResolvedValueOnce(updatedEntity);

    renderWithRouter(['/flags']);

    await waitFor(() => {
      expect(screen.getByText('checkout_v2')).toBeInTheDocument();
      expect(screen.getByText('已停用')).toBeInTheDocument();
    });

    const switchBtn = screen.getByRole('switch');
    expect(switchBtn).toHaveAttribute('aria-checked', 'false');

    // Click switch to toggle on
    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(api.toggleFlag).toHaveBeenCalledWith(1, true);
    });

    await waitFor(() => {
      expect(screen.getByText('已启用')).toBeInTheDocument();
      expect(switchBtn).toHaveAttribute('aria-checked', 'true');
    });
  });

  it('SPEC-US 07 & UI-R 06: inline switch rolls back and displays error when PATCH toggle fails', async () => {
    vi.mocked(api.getFlags).mockResolvedValue({
      items: [{ ...demoFlag, enabled: false }],
      total: 1,
    });

    vi.mocked(api.toggleFlag).mockRejectedValueOnce(
      new ApiError('TOGGLE_FAILED', '网络繁忙，切换开关状态失败', 500)
    );

    renderWithRouter(['/flags']);

    await waitFor(() => {
      expect(screen.getByText('checkout_v2')).toBeInTheDocument();
      expect(screen.getByText('已停用')).toBeInTheDocument();
    });

    const switchBtn = screen.getByRole('switch');
    expect(switchBtn).toHaveAttribute('aria-checked', 'false');

    // Click switch
    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(api.toggleFlag).toHaveBeenCalledWith(1, true);
    });

    // Should display error message and remain '已停用'
    await waitFor(() => {
      expect(screen.getByText('网络繁忙，切换开关状态失败')).toBeInTheDocument();
      expect(screen.getByText('已停用')).toBeInTheDocument();
      expect(switchBtn).toHaveAttribute('aria-checked', 'false');
    });
  });

  it('UI-R 04: clicking "详情" button navigates to /flags/:id fullscreen workspace', async () => {
    vi.mocked(api.getFlags).mockResolvedValue({
      items: [demoFlag],
      total: 1,
    });

    const { router } = renderWithRouter(['/flags']);

    await waitFor(() => {
      expect(screen.getByText('checkout_v2')).toBeInTheDocument();
    });

    const detailBtn = screen.getByRole('button', { name: /详情$/i });
    fireEvent.click(detailBtn);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/flags/1');
    });
    expect(screen.getByTestId('flag-detail-page')).toBeInTheDocument();
  });

  it('UI-R 04: clicking table row navigates to /flags/:id fullscreen workspace', async () => {
    vi.mocked(api.getFlags).mockResolvedValue({
      items: [demoFlag],
      total: 1,
    });

    const { router } = renderWithRouter(['/flags']);

    await waitFor(() => {
      expect(screen.getByText('新版结算页结账流')).toBeInTheDocument();
    });

    const nameCell = screen.getByText('新版结算页结账流');
    fireEvent.click(nameCell);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/flags/1');
    });
    expect(screen.getByTestId('flag-detail-page')).toBeInTheDocument();
  });

  it('navigates to /evaluations with flag context when "在线评估" clicked', async () => {
    vi.mocked(api.getFlags).mockResolvedValue({
      items: [demoFlag],
      total: 1,
    });

    const { router } = renderWithRouter(['/flags']);

    await waitFor(() => {
      expect(screen.getByText('checkout_v2')).toBeInTheDocument();
    });

    const evalBtn = screen.getByRole('button', { name: /在线评估/i });
    fireEvent.click(evalBtn);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/evaluations');
      expect(router.state.location.search).toContain('flag_key=checkout_v2');
      expect(router.state.location.search).toContain('environment=production');
      expect(router.state.location.search).toContain('flag_id=1');
    });
  });

  it('SPEC-US 01, 02, 03: creates Flag lifecycle, catches FLAG_KEY_CONFLICT, and supports successful creation', async () => {
    vi.mocked(api.getFlags).mockResolvedValue({
      items: [demoFlag],
      total: 1,
    });

    renderWithRouter(['/flags']);

    await waitFor(() => {
      expect(screen.getByText('checkout_v2')).toBeInTheDocument();
    });

    // 1. Open Create Flag Drawer
    const createBtn = screen.getByRole('button', { name: /新建 Flag/i });
    fireEvent.click(createBtn);

    expect(screen.getByText('新建 Feature Flag')).toBeInTheDocument();

    // 2. Same environment conflict: submit duplicate key
    vi.mocked(api.createFlag).mockRejectedValueOnce(
      new ApiError('FLAG_KEY_CONFLICT', 'Key conflict in development', 409)
    );

    fireEvent.change(screen.getByLabelText(/Flag Key/i), { target: { value: 'checkout_v2' } });
    fireEvent.change(screen.getByLabelText(/Flag 名称/i), { target: { value: '冲突测试' } });

    const submitBtn = screen.getByRole('button', { name: /立即创建/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createFlag).toHaveBeenCalled();
    });

    // Assert friendly conflict alert is shown
    await waitFor(() => {
      expect(screen.getByText(/同一环境下禁止重复/i)).toBeInTheDocument();
    });

    // 3. Multi-env reuse (SPEC-US 02): create flag successfully
    vi.mocked(api.createFlag).mockResolvedValueOnce(devFlag);

    fireEvent.change(screen.getByLabelText(/Flag 名称/i), { target: { value: '开发环境新版' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createFlag).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'checkout_v2',
          name: '开发环境新版',
          environment: 'development',
        })
      );
    });

    // On success: drawer closes, list refetched silently
    await waitFor(() => {
      expect(screen.queryByText('新建 Feature Flag')).not.toBeInTheDocument();
    });

    // Verify api.getFlags was called again to refresh
    expect(api.getFlags).toHaveBeenCalledTimes(2);
  });
});
