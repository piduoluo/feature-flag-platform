import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
  flag_id: 1,
  default_value: false,
  rule_count: 0,
  rule_trace: [],
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

  it('从 Flag 详情进入时，横幅返回原详情历史记录并保留其来源', async () => {
    const router = createMemoryRouter(
      [
        { path: '/flags/:id', element: <FlagDetailStub /> },
        { path: '/evaluations', element: <EvaluationConsolePage /> },
      ],
      {
        initialEntries: [
          {
            pathname: '/flags/1',
            state: { from: '/flags?page=2', fromLabel: '功能开关' },
          },
          {
            pathname: '/evaluations',
            search: '?flag_key=checkout_v2&environment=production',
            state: { fromFlagDetail: { path: '/flags/1' } },
          },
        ],
        initialIndex: 1,
      }
    );
    render(<RouterProvider router={router} />);

    const backLink = screen.getByRole('link', { name: /返回 Flag 详情/ });
    expect(backLink).toHaveAttribute('href', '/flags/1');

    fireEvent.click(backLink);

    await screen.findByTestId('flag-detail-stub');
    expect(router.state.historyAction).toBe('POP');
    expect(router.state.location.state).toEqual({ from: '/flags?page=2', fromLabel: '功能开关' });
  });

  it('在评估页切换 Flag 后，横幅指向新 Flag 并重新记录来源', async () => {
    const otherFlag: Flag = { ...checkoutFlag, id: 2, key: 'other_flag', name: '另一个开关' };
    vi.mocked(api.getFlags).mockResolvedValue({
      items: [checkoutFlag, otherFlag],
      total: 2,
      stats: { all: 2, enabled: 2, disabled: 0 },
    });
    const router = createMemoryRouter(
      [
        { path: '/flags/:id', element: <FlagDetailStub /> },
        { path: '/evaluations', element: <EvaluationConsolePage /> },
      ],
      {
        initialEntries: [
          { pathname: '/flags/1', state: { from: '/flags?page=2', fromLabel: '功能开关' } },
          {
            pathname: '/evaluations',
            search: '?flag_key=checkout_v2&environment=production',
            state: { fromFlagDetail: { path: '/flags/1' } },
          },
        ],
        initialIndex: 1,
      }
    );
    render(<RouterProvider router={router} />);

    fireEvent.change(screen.getByLabelText(/Flag Key/), { target: { value: 'other_flag' } });

    const backLink = await screen.findByRole('link', { name: /返回 Flag 详情/ });
    expect(backLink).toHaveAttribute('href', '/flags/2');

    fireEvent.click(backLink);

    await waitFor(() => expect(router.state.location.pathname).toBe('/flags/2'));
    expect(router.state.historyAction).toBe('PUSH');
    expect(router.state.location.state).toEqual({
      from: '/evaluations?flag_key=checkout_v2&environment=production',
      fromLabel: '规则评估',
    });
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

    expect(screen.queryByRole('heading', { name: '确定性规则在线评估控制台' })).not.toBeInTheDocument();
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
    expect(textarea.closest('.ctx-editor')).toHaveClass('is-invalid');
    const errorAlert = screen.getByTestId('context-json-error');
    expect(errorAlert).toHaveTextContent('JSON 语法错误（第 3 行）');
    expect(errorAlert).toHaveTextContent("Comma ',' expected after value");
    expect(evaluateButton).toBeDisabled();

    fireEvent.change(textarea, { target: { value: '{\n  "a": 1,\n  "b": 2\n}' } });

    expect(textarea).toHaveAttribute('aria-invalid', 'false');
    expect(textarea.closest('.ctx-editor')).not.toHaveClass('is-invalid');
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

  it('规则命中时只保留单行来源与绿色结果，并展示规则明细', async () => {
    vi.mocked(api.evaluate).mockResolvedValue(
      evaluation({
        result: true,
        reason: 'RULE_MATCH',
        rule_count: 2,
        rule_trace: [{ id: 10, priority: 1, attribute_name: 'country', operator: 'equals', expected_value: 'CN', return_value: true, attribute_present: true, actual_value: 'CN', matched: true, reason: 'MATCHED' }],
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
    const value = screen.getByLabelText('最终返回值');
    expect(value).toHaveTextContent('true');
    expect(value).toHaveClass('is-true');
    expect(card).toHaveTextContent('来源：命中规则');
    expect(card).not.toHaveTextContent('RULE_MATCH');
    expect(card).not.toHaveTextContent('命中优先级');
    expect(card).not.toHaveTextContent('剩余 1 条未执行');
    expect(card).toHaveTextContent('#1');
    expect(card).toHaveTextContent('country');
    expect(card).toHaveTextContent('equals');
    expect(card).toHaveTextContent('"CN"');
  });

  it('未命中规则时用单行来源展示红色回退值', async () => {
    vi.mocked(api.evaluate).mockResolvedValue(evaluation());
    renderConsole('/evaluations?flag_key=checkout_v2&environment=production');

    fireEvent.click(screen.getByRole('button', { name: /发起在线评估/ }));

    const card = await screen.findByTestId('result-card-default-fallback');
    const value = screen.getByLabelText('最终返回值');
    expect(value).toHaveTextContent('false');
    expect(value).toHaveClass('is-false');
    expect(card).toHaveTextContent('来源：Flag 默认值配置');
    expect(card).not.toHaveTextContent('DEFAULT_FALLBACK');
    expect(card).not.toHaveTextContent('未命中任何规则，返回 Flag 配置的默认值');
    expect(card).toHaveTextContent('回退默认值');
    expect(card).toHaveTextContent('默认值：false');
  });

  it('开关停用时 false 标红并只展示停用来源', async () => {
    vi.mocked(api.evaluate).mockResolvedValue(evaluation({ enabled: false, reason: 'FLAG_DISABLED' }));
    renderConsole('/evaluations?flag_key=checkout_v2&environment=production');

    fireEvent.click(screen.getByRole('button', { name: /发起在线评估/ }));

    const card = await screen.findByTestId('result-card-disabled');
    const value = screen.getByLabelText('最终返回值');
    expect(value).toHaveTextContent('false');
    expect(value).toHaveClass('is-false');
    expect(card).toHaveTextContent('来源：停用状态');
    expect(card).not.toHaveTextContent('FLAG_DISABLED');
    expect(card).not.toHaveTextContent('Flag 已停用，强制返回 false');
    expect(card).not.toHaveTextContent('已跳过规则评估');
    expect(card).toHaveTextContent('已停用');
  });

  it('规则命中却缺少明细时不误判为回退默认', async () => {
    vi.mocked(api.evaluate).mockResolvedValue(evaluation({ result: true, reason: 'RULE_MATCH' }));
    renderConsole('/evaluations?flag_key=checkout_v2&environment=production');

    fireEvent.click(screen.getByRole('button', { name: /发起在线评估/ }));

    const card = await screen.findByTestId('result-card-unknown');
    const value = screen.getByLabelText('最终返回值');
    expect(value).toHaveTextContent('true');
    expect(value).toHaveClass('is-true');
    expect(card).toHaveTextContent('来源：未知');
    expect(card).not.toHaveTextContent('RULE_MATCH');
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

  it('评估调用失败时在结果框内展示后端错误码与原因，关闭后回到空状态', async () => {
    vi.mocked(api.evaluate).mockRejectedValue(
      new ApiError('FLAG_NOT_FOUND', "Flag 'unknown_flag' not found", 404)
    );
    renderConsole('/evaluations?flag_key=unknown_flag&environment=production');

    fireEvent.click(screen.getByRole('button', { name: /发起在线评估/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveClass('evalc-result-error');
    expect(alert).toHaveTextContent('评估调用失败');
    expect(alert).toHaveTextContent('[FLAG_NOT_FOUND]');
    expect(document.querySelector('.evalc-result-stage')).toContainElement(alert);
    expect(
      screen.queryByText('选择环境和 Flag，填写用户属性后开始评估')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '关闭评估错误提示' }));
    expect(
      screen.getByText('选择环境和 Flag，填写用户属性后开始评估')
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

it('匹配数量使用接口总数而非当前页数量', async () => {
  vi.mocked(api.getFlags).mockResolvedValue({ items: [checkoutFlag], total: 42, stats: { all: 42, enabled: 42, disabled: 0 } });
  renderConsole('/evaluations');
  expect(await screen.findByText('当前匹配 42 个 Flag')).toBeInTheDocument();
});

it('逐条呈现后端原因，区分属性缺失、null 和严格类型，不在前端推测', async () => {
  const reasons = ['ATTRIBUTE_MISSING', 'NULL_VALUE', 'TYPE_MISMATCH', 'VALUE_MISMATCH', 'NOT_IN_SET', 'INVALID_RULE'] as const;
  vi.mocked(api.evaluate).mockResolvedValue(evaluation({
    rule_count: 6,
    rule_trace: reasons.map((reason, i) => ({ id: i + 1, priority: i + 1, attribute_name: `attr_${i}`, operator: 'equals', expected_value: 'CN', return_value: true, attribute_present: i !== 0, actual_value: i === 1 ? null : 'US', matched: false, reason })),
  }));
  renderConsole('/evaluations?flag_key=checkout_v2');
  fireEvent.click(screen.getByRole('button', { name: /发起在线评估/ }));
  expect(await screen.findByText('未提供 attr_0')).toBeInTheDocument();
  for (const label of ['属性值为 null', '类型不匹配', '值不相等', '值不在范围', '规则无效，已跳过']) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
  expect(screen.getByText('已评估 6 条')).toBeInTheDocument();
});

it('旧响应只显示摘要与明细不可用，不伪造执行链路或跳转 ID', async () => {
  vi.mocked(api.evaluate).mockResolvedValue(evaluation({ rule_trace: undefined, rule_count: undefined, flag_id: undefined }));
  renderConsole('/evaluations?flag_key=checkout_v2&flag_id=99');
  fireEvent.click(screen.getByRole('button', { name: /发起在线评估/ }));
  expect(await screen.findByText('本次评估明细不可用，仅展示返回结果。')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: '决策链路' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '查看该 Flag 的规则' })).toBeDisabled();
});

it('命中返回 false 仍显示命中规则且不使用错误状态', async () => {
  const rule = { id: 2, priority: 2, attribute_name: 'country', operator: 'equals' as const, expected_value: 'CN', return_value: false };
  vi.mocked(api.evaluate).mockResolvedValue(evaluation({ reason: 'RULE_MATCH', matched_rule: rule, rule_count: 3, rule_trace: [{ ...rule, matched: true, reason: 'MATCHED', attribute_present: true, actual_value: 'CN' }] }));
  renderConsole('/evaluations?flag_key=checkout_v2');
  fireEvent.click(screen.getByRole('button', { name: /发起在线评估/ }));
  const card = await screen.findByTestId('result-card-rule-match');
  const value = screen.getByLabelText('最终返回值');
  expect(value).toHaveTextContent('false');
  expect(value).toHaveClass('is-false');
  expect(card).toHaveTextContent('来源：命中规则');
  expect(screen.queryByTestId('result-card-default-fallback')).not.toBeInTheDocument();
});

it.each(['rules', 'settings'])('后续操作通过响应的 Flag ID 打开 %s Tab 并保留来源', async (tab) => {
  vi.mocked(api.evaluate).mockResolvedValue(evaluation({ flag_id: 42 }));
  const router = renderConsole('/evaluations?flag_key=checkout_v2&flag_id=99');
  fireEvent.click(screen.getByRole('button', { name: /发起在线评估/ }));
  const link = await screen.findByRole('link', { name: tab === 'rules' ? /查看该 Flag 的规则/ : /查看默认值配置/ });
  expect(link).toHaveAttribute('href', `/flags/42?tab=${tab}`);
  fireEvent.click(link);
  expect(router.state.location.state).toEqual({ from: '/evaluations?flag_key=checkout_v2&flag_id=99', fromLabel: '规则评估' });
});

it('复制本次提交的无损 JSON，复制失败时允许重试', async () => {
  const writeText = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  vi.mocked(api.evaluate).mockResolvedValue(evaluation());
  renderConsole('/evaluations?flag_key=checkout_v2');
  fireEvent.change(screen.getByLabelText(/Context JSON/), { target: { value: '{"user_id":9007199254740993}' } });
  fireEvent.click(screen.getByRole('button', { name: /发起在线评估/ }));
  const copy = await screen.findByRole('button', { name: '复制本次请求' });
  fireEvent.click(copy);
  expect(await screen.findByText('复制失败，请检查浏览器剪贴板权限后重试')).toBeInTheDocument();
  fireEvent.click(copy);
  expect(await screen.findByText('已复制本次请求')).toBeInTheDocument();
  expect(writeText.mock.calls[1][0]).toContain('9007199254740993');
  expect(writeText.mock.calls[1][0]).toContain('"environment": "development"');
  fireEvent.click(screen.getByRole('button', { name: /清\s*空/ }));
  expect(screen.queryByRole('button', { name: '复制本次请求' })).not.toBeInTheDocument();
});

it.each(['success', 'error'])('输入改变后忽略过期请求的 %s，保留新请求结果', async (outcome) => {
  let resolve!: (value: EvaluationResult) => void;
  let reject!: (error: Error) => void;
  vi.mocked(api.evaluate).mockReturnValueOnce(new Promise((res, rej) => { resolve = res; reject = rej; }));
  renderConsole('/evaluations?flag_key=checkout_v2');
  fireEvent.click(screen.getByRole('button', { name: /发起在线评估/ }));
  fireEvent.change(screen.getByLabelText(/Context JSON/), { target: { value: '{"country":"CN"}' } });
  vi.mocked(api.evaluate).mockResolvedValueOnce(evaluation({ result: true }));
  fireEvent.click(screen.getByRole('button', { name: /发起在线评估/ }));
  await screen.findByTestId('result-card-default-fallback');
  await act(async () => { if (outcome === 'success') resolve(evaluation()); else reject(new Error('stale')); });
  expect(screen.getByLabelText('最终返回值')).toHaveTextContent('true');
  expect(screen.queryByText('评估调用失败')).not.toBeInTheDocument();
});

it.each(['示例', '格式化', '清空', 'Flag', '环境'])('%s 输入变化立即使旧结果失效', async (kind) => {
  vi.mocked(api.evaluate).mockResolvedValue(evaluation());
  renderConsole('/evaluations?flag_key=checkout_v2');
  fireEvent.click(screen.getByRole('button', { name: /发起在线评估/ }));
  await screen.findByTestId('result-card-default-fallback');
  if (kind === 'Flag') fireEvent.change(screen.getByLabelText(/Flag Key/), { target: { value: 'different' } });
  else if (kind === '环境') {
    fireEvent.mouseDown(screen.getByLabelText(/Environment/));
    fireEvent.click(await screen.findByText('Production (生产环境)'));
  } else fireEvent.click(screen.getByRole('button', { name: new RegExp(kind.split('').join('\\s*')) }));
  expect(screen.queryByTestId('result-card-default-fallback')).not.toBeInTheDocument();
});
