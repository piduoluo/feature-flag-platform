import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { FlagListPage } from './FlagListPage';
import { api } from '../api/client';

vi.mock('../api/client', () => ({
  api: {
    getFlags: vi.fn(),
    createFlag: vi.fn(),
  },
}));

describe('FlagListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders flag list table with flags and status badges', async () => {
    vi.mocked(api.getFlags).mockResolvedValue({
      items: [
        {
          id: 1,
          key: 'beta_test_flag',
          name: 'Beta Testing Feature',
          description: 'A test description',
          environment: 'production',
          enabled: true,
          default_value: false,
          created_at: '2026-10-22T10:00:00Z',
          updated_at: '2026-10-22T10:00:00Z',
        },
      ],
      total: 1,
    });

    render(<FlagListPage />);

    expect(screen.getByText('Feature Flag 特性开关管理')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /新建 Flag/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(api.getFlags).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText('Beta Testing Feature')).toBeInTheDocument();
    });
  });

  it('renders empty placeholder when no flags found', async () => {
    vi.mocked(api.getFlags).mockResolvedValue({
      items: [],
      total: 0,
    });

    render(<FlagListPage />);

    await waitFor(() => {
      expect(screen.getByText(/当前环境暂无 Feature Flag/i)).toBeInTheDocument();
    });
  });
});
