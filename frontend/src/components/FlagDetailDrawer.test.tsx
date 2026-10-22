import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FlagDetailDrawer } from './FlagDetailDrawer';
import { api } from '../api/client';
import { Flag, AuditLog } from '../types';

vi.mock('../api/client', () => ({
  api: {
    getFlag: vi.fn(),
    updateFlag: vi.fn(),
    toggleFlag: vi.fn(),
    getAuditLogs: vi.fn(),
    syncRules: vi.fn(),
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

describe('FlagDetailDrawer', () => {
  const mockFlag: Flag = {
    id: 1,
    key: 'detail_test_flag',
    name: 'Detail Test Flag',
    description: 'Initial description',
    environment: 'staging',
    enabled: false,
    default_value: false,
    created_at: '2026-10-22T10:00:00Z',
    updated_at: '2026-10-22T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getFlag).mockResolvedValue(mockFlag);
  });

  it('renders flag overview and form values correctly', () => {
    render(
      <FlagDetailDrawer
        flag={mockFlag}
        open={true}
        onClose={vi.fn()}
        onFlagUpdated={vi.fn()}
      />
    );

    expect(screen.getByText('detail_test_flag')).toBeInTheDocument();
    expect(screen.getAllByText('staging').length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('Detail Test Flag')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Initial description')).toBeInTheDocument();
  });

  it('updates basic info and calls api.updateFlag', async () => {
    const updatedFlag: Flag = {
      ...mockFlag,
      name: 'New Modified Name',
      description: 'New Modified Desc',
    };
    vi.mocked(api.updateFlag).mockResolvedValueOnce(updatedFlag);

    const onFlagUpdated = vi.fn();
    render(
      <FlagDetailDrawer
        flag={mockFlag}
        open={true}
        onClose={vi.fn()}
        onFlagUpdated={onFlagUpdated}
      />
    );

    await waitFor(() => {
      expect(api.getFlag).toHaveBeenCalledWith(1);
    });

    const settingsTab = screen.getByRole('tab', { name: /基本信息修改/i });
    fireEvent.click(settingsTab);

    const nameInput = screen.getByDisplayValue('Detail Test Flag');
    fireEvent.change(nameInput, { target: { value: 'New Modified Name' } });

    const saveBtn = screen.getByRole('button', { name: /保存基本信息修改/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.updateFlag).toHaveBeenCalledWith(1, {
        name: 'New Modified Name',
        description: 'Initial description',
        default_value: false,
      });
      expect(onFlagUpdated).toHaveBeenCalledWith(updatedFlag);
    });
  });

  it('toggles flag switch and calls api.toggleFlag', async () => {
    const toggledFlag: Flag = {
      ...mockFlag,
      enabled: true,
    };
    vi.mocked(api.toggleFlag).mockResolvedValueOnce(toggledFlag);

    const onFlagUpdated = vi.fn();
    render(
      <FlagDetailDrawer
        flag={mockFlag}
        open={true}
        onClose={vi.fn()}
        onFlagUpdated={onFlagUpdated}
      />
    );

    const switchBtn = screen.getByRole('switch', { name: /已停用/i });
    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(api.toggleFlag).toHaveBeenCalledWith(1, true);
      expect(onFlagUpdated).toHaveBeenCalledWith(toggledFlag);
    });
  });

  it('loads and displays audit logs in timeline', async () => {
    const mockLogs: AuditLog[] = [
      {
        id: 10,
        flag_id: 1,
        flag_key: 'detail_test_flag',
        environment: 'staging',
        action_type: 'FLAG_TOGGLED',
        operator: 'admin',
        diff_summary: { old_enabled: false, new_enabled: true },
        created_at: '2026-10-22T10:05:00Z',
      },
      {
        id: 9,
        flag_id: 1,
        flag_key: 'detail_test_flag',
        environment: 'staging',
        action_type: 'FLAG_CREATED',
        operator: 'admin',
        diff_summary: { action: 'created' },
        created_at: '2026-10-22T10:00:00Z',
      },
    ];
    vi.mocked(api.getAuditLogs).mockResolvedValue(mockLogs);

    render(
      <FlagDetailDrawer
        flag={mockFlag}
        open={true}
        onClose={vi.fn()}
        onFlagUpdated={vi.fn()}
      />
    );

    const auditTab = screen.getByRole('tab', { name: /操作历史/i });
    fireEvent.click(auditTab);

    await waitFor(() => {
      expect(api.getAuditLogs).toHaveBeenCalledWith(1);
      expect(screen.getByText('切换启停状态')).toBeInTheDocument();
      expect(screen.getByText('创建 Flag')).toBeInTheDocument();
      expect(screen.getAllByText(/操作者: admin/i).length).toBe(2);
    });
  });

  it('displays error alert when fetching audit logs fails', async () => {
    vi.mocked(api.getAuditLogs).mockRejectedValueOnce(
      new Error('网络超时，无法获取操作历史')
    );

    render(
      <FlagDetailDrawer
        flag={mockFlag}
        open={true}
        onClose={vi.fn()}
        onFlagUpdated={vi.fn()}
      />
    );

    const auditTab = screen.getByRole('tab', { name: /操作历史/i });
    fireEvent.click(auditTab);

    await waitFor(() => {
      expect(screen.getByText('网络超时，无法获取操作历史')).toBeInTheDocument();
    });
  });

  it('renders rules in table with priority ordering', async () => {
    const flagWithRules: Flag = {
      ...mockFlag,
      rules: [
        {
          id: 101,
          flag_id: 1,
          priority: 1,
          attribute_name: 'country',
          operator: 'equals',
          expected_value: 'CN',
          return_value: true,
        },
        {
          id: 102,
          flag_id: 1,
          priority: 2,
          attribute_name: 'plan',
          operator: 'in',
          expected_value: ['vip', 'pro'],
          return_value: false,
        },
      ],
    };
    vi.mocked(api.getFlag).mockResolvedValueOnce(flagWithRules);

    render(
      <FlagDetailDrawer
        flag={flagWithRules}
        open={true}
        onClose={vi.fn()}
        onFlagUpdated={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('#2')).toBeInTheDocument();
      expect(screen.getByText('country')).toBeInTheDocument();
      expect(screen.getByText('plan')).toBeInTheDocument();
      expect(screen.getByText('"CN"')).toBeInTheDocument();
      expect(screen.getByText('["vip","pro"]')).toBeInTheDocument();
    });
  });

  it('swaps priority between rules and saves via api.syncRules', async () => {
    const flagWithRules: Flag = {
      ...mockFlag,
      rules: [
        {
          id: 101,
          flag_id: 1,
          priority: 1,
          attribute_name: 'country',
          operator: 'equals',
          expected_value: 'CN',
          return_value: true,
        },
        {
          id: 102,
          flag_id: 1,
          priority: 2,
          attribute_name: 'plan',
          operator: 'equals',
          expected_value: 'vip',
          return_value: false,
        },
      ],
    };
    vi.mocked(api.getFlag).mockResolvedValueOnce(flagWithRules);
    vi.mocked(api.syncRules).mockResolvedValueOnce([
      { ...flagWithRules.rules![1], priority: 1 },
      { ...flagWithRules.rules![0], priority: 2 },
    ]);

    render(
      <FlagDetailDrawer
        flag={flagWithRules}
        open={true}
        onClose={vi.fn()}
        onFlagUpdated={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('country')).toBeInTheDocument();
    });

    const downBtns = screen.getAllByLabelText('下移规则');
    fireEvent.click(downBtns[0]);

    const saveBtn = screen.getByRole('button', { name: /批量保存规则/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.syncRules).toHaveBeenCalledWith(1, [
        expect.objectContaining({
          id: 102,
          attribute_name: 'plan',
          priority: 1,
        }),
        expect.objectContaining({
          id: 101,
          attribute_name: 'country',
          priority: 2,
        }),
      ]);
    });
  });

  it('clears all rules with popconfirm confirmation', async () => {
    const flagWithRules: Flag = {
      ...mockFlag,
      rules: [
        {
          id: 101,
          flag_id: 1,
          priority: 1,
          attribute_name: 'country',
          operator: 'equals',
          expected_value: 'CN',
          return_value: true,
        },
      ],
    };
    vi.mocked(api.getFlag).mockResolvedValueOnce(flagWithRules);
    vi.mocked(api.syncRules).mockResolvedValueOnce([]);

    render(
      <FlagDetailDrawer
        flag={flagWithRules}
        open={true}
        onClose={vi.fn()}
        onFlagUpdated={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('country')).toBeInTheDocument();
    });

    const clearBtn = screen.getByRole('button', { name: /清空全部规则/i });
    fireEvent.click(clearBtn);

    const confirmBtn = await screen.findByRole('button', { name: '确定清空' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.syncRules).toHaveBeenCalledWith(1, []);
      expect(screen.getByText(/暂无规则配置/i)).toBeInTheDocument();
    });
  });
});
