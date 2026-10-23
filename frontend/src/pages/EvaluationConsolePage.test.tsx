import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useParams } from 'react-router-dom';
import { EvaluationConsolePage } from './EvaluationConsolePage';
import { api, ApiError } from '../api/client';
import { EvaluationResult, Flag } from '../types';
import { stringifyJson } from '../utils/json';

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

const evaluation = (overrides: Partial<EvaluationResult> = {}): EvaluationResult => ({
  flag_key: 'checkout_v2',
  environment: 'production',
  enabled: true,
  result: false,
  reason: 'DEFAULT_FALLBACK',
  matched_rule: null,
  ...overrides,
});

const checkoutFlag: Flag = {
  id: 1,
  key: 'checkout_v2',
  name: '新版结算页',
  description: '灰度测试中',
  environment: 'production',
  enabled: true,
  default_value: false,
  created_at: '2026-10-22T10:00:00Z',
  updated_at: '2026-10-22T10:00:00Z',
};

const FlagDetailStub = () => {
  const { id } = useParams();
  return <div data-testid="flag-detail-stub">Flag 详情 {id}</div>;
};

function renderConsole(initialEntry: string) {
  const router = createMemoryRouter(
    [
      { path: '/evaluations', element: <EvaluationConsolePage /> },
      { path: '/flags/:id', element: <FlagDetailStub /> },
    ],
    { initialEntries: [initialEntry] }
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('EvaluationConsolePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getFlags).mockResolvedValue({ items: [checkoutFlag], total: 1, stats: { all: 1, enabled: 1, disabled: 0 } });
  });

  it('回填深层链接中的环境与 Flag Key，并可从横幅返回 Flag 详情', async () => {
    renderConsole('/evaluations?flag_key=checkout_v2&environment=production');

    expect(screen.getByTestId('context-banner')).toHaveTextContent(
      '正在评估特性开关：checkout_v2 [production]'
    );
    expect(screen.getByLabelText(/Flag Key/)).toHaveValue('checkout_v2');
    expect(screen.getByText('Production (生产环境)')).toBeInTheDocument();

    const backLink = await screen.findByRole('link', { name: /返回 Flag 详情/ });
    expect(backLink).toHaveAttribute('href', '/flags/1');

    fireEvent.click(backLink);
    const detailStub = await screen.findByTestId('flag-detail-stub');
    expect(detailStub).toHaveTextContent('1');
  });

  it('回填的字段保持可编辑且横幅跟随当前输入', async () => {
    renderConsole('/evaluations?flag_key=checkout_v2&environment=production');

    const flagKeyInput = screen.getByLabelText(/Flag Key/);
    fireEvent.change(flagKeyInput, { target: { value: 'other_flag' } });
    expect(flagKeyInput).toHaveValue('other_flag');
    expect(screen.getByRole('link', { name: /返回 Flag 列表/ })).toHaveAttribute('href', '/flags');

    fireEvent.mouseDown(screen.getByLabelText(/Environment/));
    fireEvent.click(await screen.findByText('Staging (预发环境)'));

    await waitFor(() => {
      expect(screen.getByTestId('context-banner')).toHaveTextContent(
        '正在评估特性开关：other_flag [staging]'
      );
    });
  });

  it('无参从侧栏进入时展示空白就绪表单', () => {
    renderConsole('/evaluations');

    expect(screen.queryByTestId('context-banner')).not.toBeInTheDocument();
    expect(screen.getByText('Development (开发环境)')).toBeInTheDocument();
    expect(screen.getByLabelText(/Flag Key/)).toHaveValue('');
    expect(screen.getByLabelText(/Context JSON/)).toHaveValue('');
    expect(screen.queryByText(/JSON 语法错误/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /发起在线评估/ })).toBeDisabled();
  });

  it('Context JSON 语法错误时即时标红、给出行号并禁用提交，修正后恢复', () => {
    renderConsole('/evaluations?flag_key=checkout_v2&environment=production');
    const textarea = screen.getByLabelText(/Context JSON/);
    const evaluateButton = screen.getByRole('button', { name: /发起在线评估/ });

    fireEvent.change(textarea, { target: { value: '{\n  "a": 1\n  "b": 2\n}' } });

    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea.className).toContain('ant-input-status-error');
    const errorAlert = screen.getByTestId('context-json-error');
    expect(errorAlert).toHaveTextContent('JSON 语法错误（第 3 行）');
    expect(errorAlert).toHaveTextContent("Comma ',' expected after value");
    expect(evaluateButton).toBeDisabled();

    fireEvent.change(textarea, { target: { value: '{\n  "a": 1,\n  "b": 2\n}' } });

    expect(textarea).toHaveAttribute('aria-invalid', 'false');
    expect(textarea.className).not.toContain('ant-input-status-error');
    expect(screen.queryByTestId('context-json-error')).not.toBeInTheDocument();
    expect(evaluateButton).toBeEnabled();
  });

  it('非法 token 错误同样给出所在行号', () => {
    renderConsole('/evaluations?flag_key=checkout_v2&environment=production');
    const textarea = screen.getByLabelText(/Context JSON/);

    fireEvent.change(textarea, { target: { value: '{\n  "country": CN\n}' } });

    expect(screen.getByTestId('context-json-error')).toHaveTextContent('JSON 语法错误（第 2 行）');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
  });

  it('自由输入后可发起评估，请求期间展示 loading 且不重复提交', async () => {
    renderConsole('/evaluations');
    fireEvent.change(screen.getByLabelText(/Flag Key/), { target: { value: 'checkout_v2' } });
    fireEvent.change(screen.getByLabelText(/Context JSON/), {
      target: { value: '{"country":"CN"}' },
    });

    let resolveEvaluation!: (value: EvaluationResult) => void;
    vi.mocked(api.evaluate).mockReturnValue(
      new Promise<EvaluationResult>((resolve) => {
        resolveEvaluation = resolve;
      })
    );

    const evaluateButton = screen.getByRole('button', { name: /发起在线评估/ });
    fireEvent.click(evaluateButton);
    fireEvent.click(evaluateButton);

    await waitFor(() => expect(api.evaluate).toHaveBeenCalledTimes(1));
    expect(evaluateButton).toBeDisabled();
    expect(evaluateButton.className).toContain('ant-btn-loading');
    expect(api.evaluate).toHaveBeenCalledWith({
      flag_key: 'checkout_v2',
      environment: 'development',
      context: { country: 'CN' },
    });

    resolveEvaluation(evaluation({ environment: 'development' }));

    expect(await screen.findByTestId('result-card-default-fallback')).toBeInTheDocument();
    expect(evaluateButton).toBeEnabled();
  });

  it('通过现有列表接口按当前输入检索候选 Flag', async () => {
    renderConsole('/evaluations');

    fireEvent.change(screen.getByLabelText(/Flag Key/), { target: { value: 'rare_flag' } });

    await waitFor(() => {
      expect(api.getFlags).toHaveBeenCalledWith({
        environment: 'development',
        search: 'rare_flag',
        page: 1,
        page_size: 20,
      });
    });
  });

  it('无损提交超出 2^53 的评估上下文整数', async () => {
    vi.mocked(api.evaluate).mockResolvedValue(evaluation({ environment: 'development' }));
    renderConsole('/evaluations');
    fireEvent.change(screen.getByLabelText(/Flag Key/), { target: { value: 'checkout_v2' } });
    fireEvent.change(screen.getByLabelText(/Context JSON/), {
      target: { value: '{"user_id":9007199254740993}' },
    });

    fireEvent.click(screen.getByRole('button', { name: /发起在线评估/ }));

    await waitFor(() => expect(api.evaluate).toHaveBeenCalledTimes(1));
    expect(stringifyJson(vi.mocked(api.evaluate).mock.calls[0][0])).toContain(
      '"context":{"user_id":9007199254740993}'
    );
  });

  it('规则命中时展示绿色卡片、命中原因与规则明细', async () => {
    vi.mocked(api.evaluate).mockResolvedValue(
      evaluation({
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
      })
    );
    renderConsole('/evaluations?flag_key=checkout_v2&environment=production');

    fireEvent.click(screen.getByRole('button', { name: /发起在线评估/ }));

    const card = await screen.findByTestId('result-card-rule-match');
    expect(card).toHaveTextContent('命中灰度规则 (RULE_MATCH)');
    expect(card).toHaveTextContent('返回 true');
    expect(card).toHaveTextContent('#1');
    expect(card).toHaveTextContent('country');
    expect(card).toHaveTextContent('equals');
    expect(card).toHaveTextContent('"CN"');
  });

  it('未命中规则时展示中性卡片并说明回退默认值', async () => {
    vi.mocked(api.evaluate).mockResolvedValue(evaluation());
    renderConsole('/evaluations?flag_key=checkout_v2&environment=production');

    fireEvent.click(screen.getByRole('button', { name: /发起在线评估/ }));

    const card = await screen.findByTestId('result-card-default-fallback');
    expect(card).toHaveTextContent('回退至默认返回值 (DEFAULT_FALLBACK)');
    expect(card).toHaveTextContent('未命中任何规则，回退至当前 Flag 的默认返回值');
    expect(card).toHaveTextContent('false');
  });

  it('开关停用时展示橙色警示卡片并说明熔断求值', async () => {
    vi.mocked(api.evaluate).mockResolvedValue(evaluation({ enabled: false, reason: 'FLAG_DISABLED' }));
    renderConsole('/evaluations?flag_key=checkout_v2&environment=production');

    fireEvent.click(screen.getByRole('button', { name: /发起在线评估/ }));

    const card = await screen.findByTestId('result-card-disabled');
    expect(card).toHaveTextContent('特性开关已停用 (FLAG_DISABLED)');
    expect(card).toHaveTextContent('特性开关已停用，评估引擎已熔断并强制返回 false');
    expect(card).toHaveTextContent('已熔断 / 强制关闭');
    expect(card).toHaveTextContent('false');
  });

  it('规则命中却缺少明细时不误判为回退默认', async () => {
    vi.mocked(api.evaluate).mockResolvedValue(evaluation({ result: true, reason: 'RULE_MATCH' }));
    renderConsole('/evaluations?flag_key=checkout_v2&environment=production');

    fireEvent.click(screen.getByRole('button', { name: /发起在线评估/ }));

    const card = await screen.findByTestId('result-card-unknown');
    expect(card).toHaveTextContent('RULE_MATCH');
    expect(screen.queryByTestId('result-card-default-fallback')).not.toBeInTheDocument();
  });

  it('忽略未知 Query 参数并优先使用旗标 id 生成返回链接', () => {
    renderConsole(
      '/evaluations?flag_key=checkout_v2&environment=production&flag_id=42&utm_source=sidebar'
    );

    expect(screen.getByTestId('context-banner')).toHaveTextContent(
      '正在评估特性开关：checkout_v2 [production]'
    );
    expect(screen.getByRole('link', { name: /返回 Flag 详情/ })).toHaveAttribute(
      'href',
      '/flags/42'
    );
  });

  it('评估调用失败时展示后端错误码与原因', async () => {
    vi.mocked(api.evaluate).mockRejectedValue(
      new ApiError('FLAG_NOT_FOUND', "Flag 'unknown_flag' not found", 404)
    );
    renderConsole('/evaluations?flag_key=unknown_flag&environment=production');

    fireEvent.click(screen.getByRole('button', { name: /发起在线评估/ }));

    expect(await screen.findByText('评估调用失败')).toBeInTheDocument();
    expect(screen.getByText(/\[FLAG_NOT_FOUND\]/)).toBeInTheDocument();
  });

  it('提供示例、清空与格式化 JSON 的辅助操作', () => {
    renderConsole('/evaluations');
    const textarea = screen.getByLabelText(/Context JSON/);

    fireEvent.click(screen.getByRole('button', { name: /清\s*空/ }));
    expect(textarea).toHaveValue('{}');

    fireEvent.click(screen.getByRole('button', { name: /示\s*例/ }));
    expect((textarea as HTMLTextAreaElement).value).toContain('country');

    fireEvent.change(textarea, { target: { value: '{"a":1,"b":2}' } });
    fireEvent.click(screen.getByRole('button', { name: /格\s*式\s*化/ }));
    expect(textarea).toHaveValue(JSON.stringify({ a: 1, b: 2 }, null, 2));
  });
});
