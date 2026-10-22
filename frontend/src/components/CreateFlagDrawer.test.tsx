import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateFlagDrawer } from './CreateFlagDrawer';
import { api, ApiError } from '../api/client';

vi.mock('../api/client', () => ({
  api: {
    createFlag: vi.fn(),
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

describe('CreateFlagDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders drawer form with required inputs', () => {
    render(
      <CreateFlagDrawer
        open={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        initialEnvironment="development"
      />
    );

    expect(screen.getByText('新建 Feature Flag')).toBeInTheDocument();
    expect(screen.getByLabelText(/Flag Key/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Flag 名称/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/运行环境/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/默认返回值/i)).toBeInTheDocument();
  });

  it('validates empty inputs and blocks submission', async () => {
    render(
      <CreateFlagDrawer
        open={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /立即创建/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('请输入 Flag Key 唯一标识')).toBeInTheDocument();
      expect(screen.getByText('请输入 Flag 显示名称')).toBeInTheDocument();
    });

    expect(api.createFlag).not.toHaveBeenCalled();
  });

  it('handles FLAG_KEY_CONFLICT error and displays friendly alert', async () => {
    vi.mocked(api.createFlag).mockRejectedValueOnce(
      new ApiError('FLAG_KEY_CONFLICT', 'Key conflict in this env', 409)
    );

    render(
      <CreateFlagDrawer
        open={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );

    const keyInput = screen.getByLabelText(/Flag Key/i);
    const nameInput = screen.getByLabelText(/Flag 名称/i);
    fireEvent.change(keyInput, { target: { value: 'existing_key' } });
    fireEvent.change(nameInput, { target: { value: 'Existing Name' } });

    const submitBtn = screen.getByRole('button', { name: /立即创建/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/冲突提示：环境/i)).toBeInTheDocument();
      expect(screen.getByText(/同一环境下禁止重复/i)).toBeInTheDocument();
    });
  });

  it('successfully creates flag and invokes onSuccess callback', async () => {
    const mockCreated = {
      id: 1,
      key: 'new_feature_key',
      name: 'New Feature',
      description: 'Desc',
      environment: 'development' as const,
      enabled: false,
      default_value: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    vi.mocked(api.createFlag).mockResolvedValueOnce(mockCreated);

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <CreateFlagDrawer
        open={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    fireEvent.change(screen.getByLabelText(/Flag Key/i), { target: { value: 'new_feature_key' } });
    fireEvent.change(screen.getByLabelText(/Flag 名称/i), { target: { value: 'New Feature' } });

    const submitBtn = screen.getByRole('button', { name: /立即创建/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createFlag).toHaveBeenCalledWith({
        key: 'new_feature_key',
        name: 'New Feature',
        description: '',
        environment: 'development',
        default_value: false,
      });
      expect(onSuccess).toHaveBeenCalledWith(mockCreated);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
