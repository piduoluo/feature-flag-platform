import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EvaluationConsolePage } from './EvaluationConsolePage';
import { api, ApiError } from '../api/client';

vi.mock('../api/client', () => ({
  api: {
    getFlags: vi.fn(),
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

describe('EvaluationConsolePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getFlags).mockResolvedValue({
      items: [
        {
          id: 1,
          key: 'checkout_v2',
          name: '新版结算页',
          description: '灰度测试中',
          environment: 'production',
          enabled: true,
          default_value: false,
          created_at: '2026-10-22T10:00:00Z',
          updated_at: '2026-10-22T10:00:00Z',
        },
      ],
      total: 1,
    });
  });

  it('renders evaluation form controls and loads environment flags', async () => {
    render(<EvaluationConsolePage initialFlagKey="checkout_v2" initialEnvironment="production" />);

    expect(screen.getByText('确定性规则在线评估控制台')).toBeInTheDocument();
    expect(screen.getByText(/用户属性上下文 \(Context JSON\)/i)).toBeInTheDocument();
    expect(screen.getByText('JSON 格式有效')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /发起在线评估/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(api.getFlags).toHaveBeenCalledWith({
        environment: 'production',
        page_size: 100,
      });
    });
  });

  it('performs real-time JSON syntax validation and blocks evaluation when syntax is broken', async () => {
    render(<EvaluationConsolePage initialFlagKey="checkout_v2" />);

    const textarea = screen.getByPlaceholderText(/country/i);

    // Enter broken JSON
    fireEvent.change(textarea, { target: { value: '{\n  "country": "CN"' } });

    // Expect invalid format tag and error banner
    expect(screen.getByText('JSON 格式错误')).toBeInTheDocument();
    expect(screen.getByText(/JSON 语法错误/i)).toBeInTheDocument();

    const evaluateBtn = screen.getByRole('button', { name: /发起在线评估/i });
    expect(evaluateBtn).toBeDisabled();

    // Fix JSON
    fireEvent.change(textarea, { target: { value: '{\n  "country": "CN"\n}' } });

    expect(screen.getByText('JSON 格式有效')).toBeInTheDocument();
    expect(screen.queryByText(/JSON 语法错误/i)).not.toBeInTheDocument();
    expect(evaluateBtn).not.toBeDisabled();
  });

  it('handles RULE_MATCH evaluation and displays green card with rule breakdown', async () => {
    vi.mocked(api.evaluate).mockResolvedValue({
      flag_key: 'checkout_v2',
      environment: 'production',
      enabled: true,
      result: true,
      reason: 'RULE_MATCH',
      matched_rule: {
        id: 10,
        priority: 1,
        attribute_name: 'country',
        operator: 'equals',
        expected_value: 'CN',
        return_value: true,
      },
    });

    render(<EvaluationConsolePage initialFlagKey="checkout_v2" initialEnvironment="production" />);

    const evaluateBtn = screen.getByRole('button', { name: /发起在线评估/i });
    fireEvent.click(evaluateBtn);

    await waitFor(() => {
      expect(api.evaluate).toHaveBeenCalledWith({
        flag_key: 'checkout_v2',
        environment: 'production',
        context: expect.any(Object),
      });
    });

    // Check green success card rendering
    await waitFor(() => {
      expect(screen.getByTestId('result-card-rule-match')).toBeInTheDocument();
      expect(screen.getByText('命中灰度规则 (RULE_MATCH)')).toBeInTheDocument();
      expect(screen.getByText('功能放量开放 (true)')).toBeInTheDocument();
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('country')).toBeInTheDocument();
      expect(screen.getByText('equals')).toBeInTheDocument();
      expect(screen.getByText('CN')).toBeInTheDocument();
    });
  });

  it('handles DEFAULT_FALLBACK evaluation and displays neutral blue card', async () => {
    vi.mocked(api.evaluate).mockResolvedValue({
      flag_key: 'checkout_v2',
      environment: 'production',
      enabled: true,
      result: false,
      reason: 'DEFAULT_FALLBACK',
      matched_rule: null,
    });

    render(<EvaluationConsolePage initialFlagKey="checkout_v2" initialEnvironment="production" />);

    const evaluateBtn = screen.getByRole('button', { name: /发起在线评估/i });
    fireEvent.click(evaluateBtn);

    await waitFor(() => {
      expect(screen.getByTestId('result-card-default-fallback')).toBeInTheDocument();
      expect(screen.getByText('回退至默认返回值 (DEFAULT_FALLBACK)')).toBeInTheDocument();
      expect(screen.getByText(/未命中规则 · 回退默认/i)).toBeInTheDocument();
    });
  });

  it('handles FLAG_DISABLED evaluation and displays warning card', async () => {
    vi.mocked(api.evaluate).mockResolvedValue({
      flag_key: 'checkout_v2',
      environment: 'production',
      enabled: false,
      result: false,
      reason: 'FLAG_DISABLED',
      matched_rule: null,
    });

    render(<EvaluationConsolePage initialFlagKey="checkout_v2" initialEnvironment="production" />);

    const evaluateBtn = screen.getByRole('button', { name: /发起在线评估/i });
    fireEvent.click(evaluateBtn);

    await waitFor(() => {
      expect(screen.getByTestId('result-card-disabled')).toBeInTheDocument();
      expect(screen.getByText('特性开关已停用 (FLAG_DISABLED)')).toBeInTheDocument();
      expect(screen.getByText(/已熔断 \/ 强制关闭/i)).toBeInTheDocument();
    });
  });

  it('displays API error alert when flag is not found or API fails', async () => {
    vi.mocked(api.evaluate).mockRejectedValue(
      new ApiError('FLAG_NOT_FOUND', "Flag 'unknown_flag' not found", 404)
    );

    render(<EvaluationConsolePage initialFlagKey="unknown_flag" initialEnvironment="production" />);

    const evaluateBtn = screen.getByRole('button', { name: /发起在线评估/i });
    fireEvent.click(evaluateBtn);

    await waitFor(() => {
      expect(screen.getByText('评估调用失败')).toBeInTheDocument();
      expect(screen.getByText(/\[FLAG_NOT_FOUND\]/i)).toBeInTheDocument();
    });
  });

  it('supports format, sample and clear buttons for context JSON', async () => {
    render(<EvaluationConsolePage initialFlagKey="checkout_v2" />);

    const textarea = screen.getByPlaceholderText(/country/i) as HTMLTextAreaElement;

    // Click clear
    const clearBtn = screen.getByRole('button', { name: /清\s*空/i });
    fireEvent.click(clearBtn);
    expect(textarea.value).toBe('{}');

    // Click sample
    const sampleBtn = screen.getByRole('button', { name: /示\s*例/i });
    fireEvent.click(sampleBtn);
    expect(textarea.value).toContain('country');

    // Enter unformatted JSON and click format
    fireEvent.change(textarea, { target: { value: '{"a":1,"b":2}' } });
    const formatBtn = screen.getByRole('button', { name: /格\s*式\s*化/i });
    fireEvent.click(formatBtn);
    expect(textarea.value).toBe(JSON.stringify({ a: 1, b: 2 }, null, 2));
  });
});
