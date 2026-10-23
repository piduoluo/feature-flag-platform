import { beforeAll, afterAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routeConfig } from '../router';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { AuditLog, Flag } from '../types';
let flag: Flag;
let requests: { url: string; method: string; body: any }[];
let fail = '';
const server = setupServer();
let networkFetch: typeof fetch;
beforeAll(() => { server.listen({ onUnhandledRequest: 'error' }); networkFetch = globalThis.fetch; });
afterAll(() => server.close());
beforeEach(() => {
  flag = { id: 42, key: 'checkout', name: 'Checkout', description: '', environment: 'production', enabled: false, default_value: false, created_at: '2026-01-01', updated_at: '2026-01-01', rules: [
    { id: 1, attribute_name: 'country', operator: 'equals', expected_value: 'CN', return_value: true, priority: 10 },
    { id: 2, attribute_name: 'plan', operator: 'equals', expected_value: 'pro', return_value: true, priority: 20 },
  ] };
  requests = []; fail = '';
  const respond = async ({ request }: { request: Request }) => {
    const url = new URL(request.url).pathname;
    const method = request.method;
    const body = method === 'GET' ? null : await request.json() as Record<string, any>;
    requests.push({ url, method, body });
    if (method !== 'GET' && fail && url.endsWith(fail)) return HttpResponse.json({ code: 'INTERNAL_ERROR', message: '保存失败' }, { status: 500 });
    let data: unknown = flag;
    if (url.endsWith('/rules')) { flag = { ...flag, rules: body!.rules }; data = flag.rules; }
    else if (method === 'PUT' || method === 'PATCH') { flag = { ...flag, ...body }; data = flag; }
    else if (url.endsWith('audit-logs')) data = [];
    else if (url === '/api/v1/flags') data = { items: [], total: 0, stats: { all: 0, enabled: 0, disabled: 0 } };
    return HttpResponse.json({ code: 'SUCCESS', data });
  };
  server.use(
    http.get('*/api/v1/flags/42', respond),
    http.put('*/api/v1/flags/42', respond),
    http.patch('*/api/v1/flags/42/toggle', respond),
    http.put('*/api/v1/flags/42/rules', respond),
    http.get('*/api/v1/flags/42/audit-logs', respond),
    http.get('*/api/v1/flags', respond),
  );
  // Node fetch needs an absolute URL; requests still pass through MSW and the real API client.
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => networkFetch(new URL(input, window.location.href), init));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); server.resetHandlers(); });
async function open(path = '/flags/42?tab=settings') {
  const router = createMemoryRouter(routeConfig, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { name: 'Checkout' });
  return router;
}
it('saves settings independently and switches tabs without changing the URL', async () => {
  const router = await open();
  // The legacy ?tab=settings entry is normalized to the canonical detail URL.
  expect(router.state.location.pathname).toBe('/flags/42');
  expect(router.state.location.search).toBe('');

  fireEvent.change(screen.getByLabelText('Flag 名称'), { target: { value: 'New Checkout' } });
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
  await screen.findByRole('heading', { name: 'New Checkout' });
  expect(requests.filter(r => r.method === 'PUT')).toEqual([{ url: '/api/v1/flags/42', method: 'PUT', body: { name: 'New Checkout', description: '', default_value: false } }]);

  fireEvent.click(screen.getByRole('tab', { name: '规则配置' }));
  expect(router.state.location.pathname).toBe('/flags/42');
  expect(router.state.location.search).toBe('');
  expect(screen.getByRole('tab', { name: '规则配置' })).toHaveAttribute('aria-selected', 'true');
});
it('defaults to rules on the canonical URL and normalizes the legacy path route', async () => {
  const canonical = await open('/flags/42');
  expect(canonical.state.location.pathname).toBe('/flags/42');
  expect(canonical.state.location.search).toBe('');
  expect(screen.getByRole('tab', { name: '规则配置' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByTestId('detail-back-nav')).toHaveTextContent('功能开关');

  cleanup();
  const legacy = createMemoryRouter(routeConfig, { initialEntries: ['/flags/42/audit'] });
  render(<RouterProvider router={legacy} />);
  await screen.findByRole('heading', { name: 'Checkout' });
  expect(legacy.state.location.pathname).toBe('/flags/42');
  expect(legacy.state.location.search).toBe('');
  expect(screen.getByRole('tab', { name: '变更历史' })).toHaveAttribute('aria-selected', 'true');
});

it('browser back from any tab returns to the source page in one step', async () => {
  const router = createMemoryRouter(routeConfig, { initialEntries: ['/flags', '/flags/42'], initialIndex: 1 });
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { name: 'Checkout' });

  fireEvent.click(screen.getByRole('tab', { name: '变更历史' }));
  fireEvent.click(screen.getByRole('tab', { name: '基本设置' }));
  expect(router.state.location.pathname).toBe('/flags/42');
  expect(router.state.location.search).toBe('');

  await act(async () => { await router.navigate(-1); });
  await waitFor(() => expect(router.state.location.pathname).toBe('/flags'));
});

it('returns from the evaluation console in place and keeps the detail source', async () => {
  server.use(http.get('*/api/v1/flags', () => HttpResponse.json({
    code: 'SUCCESS',
    data: { items: [flag], total: 1, stats: { all: 1, enabled: 0, disabled: 1 } },
  })));
  const router = createMemoryRouter(routeConfig, {
    initialEntries: [
      { pathname: '/flags', search: '?page=2' },
      { pathname: '/flags/42', state: { from: '/flags?page=2', fromLabel: '功能开关' } },
    ],
    initialIndex: 1,
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { name: 'Checkout' });
  expect(screen.getByTestId('detail-back-nav')).toHaveTextContent('功能开关');

  fireEvent.click(screen.getByRole('button', { name: '前往在线评估' }));
  await waitFor(() => expect(router.state.location.pathname).toBe('/evaluations'));

  fireEvent.click(await screen.findByRole('link', { name: /返回 Flag 详情/ }));

  await waitFor(() => expect(router.state.location.pathname).toBe('/flags/42'));
  expect(router.state.historyAction).toBe('POP');
  expect(router.state.location.state).toEqual({ from: '/flags?page=2', fromLabel: '功能开关' });
  expect(screen.getByTestId('detail-back-nav')).toHaveTextContent('功能开关');

  fireEvent.click(screen.getByTestId('detail-back-nav'));
  await waitFor(() => expect(router.state.location.pathname).toBe('/flags'));
  expect(router.state.location.search).toBe('?page=2');
});

it('keeps reordering local, clears reverted edits, and swaps persisted priorities only on save', async () => {
  await open('/flags/42');
  fireEvent.click(screen.getByRole('button', { name: '下移规则 1' }));
  expect(screen.getByRole('button', { name: '保存规则配置' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '上移规则 2' }));
  expect(screen.queryByRole('button', { name: '保存规则配置' })).not.toBeInTheDocument();
  expect(requests.filter(r => r.method === 'PUT')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: '下移规则 1' }));
  fireEvent.click(screen.getByRole('button', { name: '保存规则配置' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: '保存规则配置' })).not.toBeInTheDocument());
  expect(requests.find(r => r.method === 'PUT')?.body.rules.map((r: any) => [r.id, r.priority])).toEqual([[2, 10], [1, 20]]);
});
it('clearing is a confirmed draft until explicitly saved', async () => {
  await open('/flags/42');
  fireEvent.click(screen.getByRole('button', { name: '清空全部规则' }));
  fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
  expect(requests.filter(r => r.method === 'PUT')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: '保存规则配置' }));
  await waitFor(() => expect(requests.find(r => r.method === 'PUT')?.body).toEqual({ rules: [] }));
});
it('retains both drafts across tabs and saves basic settings before rules when evaluating', async () => {
  const router = await open();
  fireEvent.change(screen.getByLabelText('Flag 名称'), { target: { value: 'Changed' } });
  fireEvent.click(screen.getByLabelText('默认返回值'));
  fireEvent.click(screen.getByRole('tab', { name: '规则配置' }));
  expect(screen.getByText('基本设置中有未保存的默认值草稿，保存后才会影响评估结果')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '下移规则 1' }));
  fireEvent.click(screen.getByRole('button', { name: '前往在线评估' }));
  fireEvent.click(screen.getByRole('button', { name: '保存并前往' }));
  await waitFor(() => expect(router.state.location.pathname).toBe('/evaluations'));
  expect(requests.filter(r => r.method === 'PUT').map(r => r.url)).toEqual(['/api/v1/flags/42', '/api/v1/flags/42/rules']);
  expect(router.state.location.search).toBe('?flag_key=checkout&environment=production');
});
it.each(['/42', '/rules'])('preserves failed drafts and focuses the failed domain: %s', async suffix => {
  const router = await open(); fail = suffix;
  fireEvent.change(screen.getByLabelText('Flag 名称'), { target: { value: 'Changed' } });
  fireEvent.click(screen.getByRole('tab', { name: '规则配置' }));
  fireEvent.click(screen.getByRole('button', { name: '下移规则 1' }));
  fireEvent.click(screen.getByRole('button', { name: '前往在线评估' }));
  fireEvent.click(screen.getByRole('button', { name: '保存并前往' }));
  await screen.findByText(suffix === '/42' ? '保存失败' : '基本设置已保存，但规则配置保存失败，规则草稿已保留：保存失败');
  expect(router.state.location.pathname).toBe('/flags/42');
  expect(router.state.location.search).toBe('');
  expect(screen.getByRole('tab', { name: suffix === '/42' ? /基本设置/ : /规则配置/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: '规则配置 *' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: suffix === '/42' ? '基本设置 *' : '基本设置' })).toBeInTheDocument();
  expect(requests.filter(r => r.method === 'PUT')).toHaveLength(suffix === '/42' ? 1 : 2);
});
it('preserves drafts across tab switches without blocking, then guards leaving the flag', async () => {
  const router = createMemoryRouter(routeConfig, { initialEntries: ['/flags', '/flags/42?tab=settings'], initialIndex: 1 });
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { name: 'Checkout' });

  fireEvent.change(screen.getByLabelText('Flag 名称'), { target: { value: 'Changed' } });
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);

  // Switching tabs is not navigation: no prompt, no URL/history entry.
  fireEvent.click(screen.getByRole('tab', { name: '规则配置' }));
  expect(router.state.location.pathname).toBe('/flags/42');
  expect(router.state.location.search).toBe('');
  expect(screen.queryByText('离开当前 Flag？')).not.toBeInTheDocument();

  // The basic draft survives the round trip.
  fireEvent.click(screen.getByRole('tab', { name: /基本设置/ }));
  expect(screen.getByLabelText('Flag 名称')).toHaveValue('Changed');

  // Only actually leaving the detail page is guarded.
  await act(async () => { await router.navigate(-1); });
  await waitFor(() => expect(screen.getByText('离开当前 Flag？')).toBeVisible());
  fireEvent.click(screen.getByRole('button', { name: '继续编辑' }));
  expect(router.state.location.pathname).toBe('/flags/42');

  await act(async () => { await router.navigate(-1); });
  fireEvent.click(await screen.findByRole('button', { name: '放弃修改并离开' }));
  await waitFor(() => expect(router.state.location.pathname).toBe('/flags'));
});
it('uses the toggle response, prevents repeated requests and preserves local basic draft', async () => {
  await open();
  fireEvent.change(screen.getByLabelText('Flag 名称'), { target: { value: 'Draft' } });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  server.use(http.patch('*/api/v1/flags/42/toggle', async () => { await gate; return HttpResponse.json({ code: 'SUCCESS', data: { ...flag, enabled: true } }); }, { once: true }));
  const control = screen.getByRole('switch', { name: '启停控制' });
  fireEvent.click(control); fireEvent.click(control);
  expect(control).toBeDisabled();
  await act(async () => release());
  await waitFor(() => expect(control).toHaveAttribute('aria-checked', 'true'));
  const meta = screen.getByTestId('detail-meta');
  expect(meta).toHaveTextContent('规则总数：2');
  expect(meta).toHaveTextContent('配置默认值');
  expect(within(meta).getByText('false')).toBeInTheDocument();
  expect(screen.getByLabelText('Flag 名称')).toHaveValue('Draft');
  fail = '/toggle'; fireEvent.click(control);
  await screen.findByText('保存失败');
  expect(control).toHaveAttribute('aria-checked', 'true');
});
it('validates rule JSON before accepting a new draft, then permits discarding it', async () => {
  await open('/flags/42');
  fireEvent.click(screen.getByRole('button', { name: '添加规则' }));
  fireEvent.change(screen.getByLabelText('属性名'), { target: { value: 'age' } });
  fireEvent.change(screen.getByLabelText('期望值（JSON）'), { target: { value: 'null' } });
  fireEvent.click(screen.getByRole('button', { name: /确\s*认/ }));
  await screen.findByText('equals 仅允许字符串、数字或布尔值');
  fireEvent.change(screen.getByLabelText('期望值（JSON）'), { target: { value: '18' } });
  fireEvent.click(screen.getByRole('button', { name: /确\s*认/ }));
  await screen.findByText(/规则 03/);
  expect(requests.filter(r => r.method === 'PUT')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: '放弃修改' }));
  expect(screen.queryByText(/规则 03/)).not.toBeInTheDocument();
});

it('edits an explicit positive priority and rejects a duplicate', async () => {
  await open('/flags/42');
  fireEvent.click(screen.getAllByRole('button', { name: '编辑规则' })[0]);
  const priority = screen.getByLabelText('优先级');
  expect(priority).toHaveValue('10');
  fireEvent.change(priority, { target: { value: '20' } });
  fireEvent.click(screen.getByRole('button', { name: /确\s*认/ }));
  await screen.findByText('同一 Flag 下优先级不能重复');
  fireEvent.change(priority, { target: { value: '15' } });
  fireEvent.click(screen.getByRole('button', { name: /确\s*认/ }));
  await screen.findByText(/优先级 15/);
});

it('explains disabled evaluation semantics and leaves description length to the API contract', async () => {
  await open('/flags/42');
  const meta = screen.getByTestId('detail-meta');
  expect(meta).toHaveTextContent('配置默认值');
  expect(within(meta).getByText('false')).toBeInTheDocument();
  expect(meta).toHaveTextContent('停用期间评估始终返回 false');
  expect(screen.queryByText(/配置的默认返回值（停用期间不参与评估）/)).not.toBeInTheDocument();
  expect(screen.queryByText(/默认返回值（Flag 停用期间不参与评估）/)).not.toBeInTheDocument();
  // The settings form keeps only the field label; the old long explanatory
  // helper under 默认返回值 was removed.
  expect(screen.queryByText(/持久化配置值/)).not.toBeInTheDocument();
  expect(document.querySelector('.default-card')).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: '基本设置' }));
  expect(screen.getByLabelText('描述')).not.toHaveAttribute('maxlength');
});

it('keeps the persisted configured default visible when the flag is disabled', async () => {
  flag = { ...flag, enabled: false, default_value: true };
  await open('/flags/42');
  const meta = screen.getByTestId('detail-meta');
  expect(meta).toHaveTextContent('配置默认值');
  expect(within(meta).getByText('true')).toBeInTheDocument();
  expect(meta).toHaveTextContent('停用期间评估始终返回 false');
});

it('keeps identity and actions in the first row and metadata in its own second row', async () => {
  flag = { ...flag, enabled: true };
  await open('/flags/42');

  const titleRow = screen.getByTestId('detail-title-row');
  expect(within(titleRow).getByRole('heading', { name: 'Checkout' })).toBeInTheDocument();
  expect(within(titleRow).getByText('已启用')).toBeInTheDocument();

  const actions = screen.getByTestId('detail-actions');
  expect(within(actions).getByRole('switch', { name: '启停控制' })).toBeInTheDocument();
  expect(within(actions).getByRole('button', { name: '前往在线评估' })).toBeInTheDocument();

  const headRow = screen.getByTestId('detail-head-row');
  const meta = screen.getByTestId('detail-meta');
  expect(headRow).not.toContainElement(meta);
  expect(headRow.nextElementSibling).toBe(meta);
});

it.each([
  { enabled: true, defaultValue: true },
  { enabled: true, defaultValue: false },
  { enabled: false, defaultValue: true },
  { enabled: false, defaultValue: false },
])(
  'renders the rules empty state for enabled=$enabled and default_value=$defaultValue',
  async ({ enabled, defaultValue }) => {
    flag = { ...flag, enabled, default_value: defaultValue, rules: [] };
    await open('/flags/42');
    const empty = screen.getByTestId('rules-empty-state');
    if (enabled) {
      expect(empty).toHaveTextContent('暂无灰度规则');
      expect(empty).toHaveTextContent('当前没有配置灰度规则，评估时将返回 Flag 的配置默认值。');
    } else {
      expect(empty).toHaveTextContent('当前 Flag 已停用');
      expect(empty).toHaveTextContent(
        'Flag 停用期间，评估将始终返回 false。重新启用后，将按照灰度规则进行评估；未命中任何规则时，返回配置默认值。',
      );
    }
  },
);

it('refreshes an already mounted audit history after a successful mutation', async () => {
  await open('/flags/42?tab=audit');
  await screen.findByText('暂无变更记录');
  const auditRequests = () => requests.filter(request => request.url.endsWith('/audit-logs')).length;
  const before = auditRequests();

  fireEvent.click(screen.getByRole('tab', { name: '基本设置' }));
  fireEvent.change(screen.getByLabelText('Flag 名称'), { target: { value: 'Changed' } });
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }));

  await waitFor(() => expect(auditRequests()).toBeGreaterThan(before));
});
it('reverting settings removes guards; evaluation cancel and discard send no writes', async () => {
  const router = await open();
  fireEvent.change(screen.getByLabelText('Flag 名称'), { target: { value: 'Draft' } });
  fireEvent.change(screen.getByLabelText('Flag 名称'), { target: { value: 'Checkout' } });
  expect(screen.getByRole('button', { name: '保存设置' })).toBeDisabled();
  const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  fireEvent.change(screen.getByLabelText('Flag 名称'), { target: { value: 'Draft' } });
  fireEvent.click(screen.getByRole('button', { name: '前往在线评估' }));
  fireEvent.click(screen.getByRole('button', { name: '继续留在本页编辑' }));
  expect(screen.getByLabelText('Flag 名称')).toHaveValue('Draft');
  fireEvent.click(screen.getByRole('button', { name: '前往在线评估' }));
  fireEvent.click(screen.getByRole('button', { name: '放弃修改并前往' }));
  await waitFor(() => expect(router.state.location.pathname).toBe('/evaluations'));
  expect(requests.filter(r => r.method !== 'GET')).toHaveLength(0);
});
it('edits existing rules locally and can restore the original content', async () => {
  await open('/flags/42');
  fireEvent.click(screen.getAllByRole('button', { name: '编辑规则' })[0]);
  fireEvent.change(screen.getByLabelText('期望值（JSON）'), { target: { value: '"US"' } });
  fireEvent.click(screen.getByRole('button', { name: /确\s*认/ }));
  await screen.findByText('"US"');
  expect(screen.getByRole('tab', { name: '规则配置 *' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '放弃修改' }));
  expect(screen.getByText('"CN"')).toBeInTheDocument();
  expect(requests.filter(r => r.method !== 'GET')).toHaveLength(0);
});
it('intercepts browser back navigation away from a dirty flag', async () => {
  const router = createMemoryRouter(routeConfig, { initialEntries: ['/flags', '/flags/42?tab=settings'], initialIndex: 1 });
  render(<RouterProvider router={router} />);
  await screen.findByRole('heading', { name: 'Checkout' });
  fireEvent.change(screen.getByLabelText('Flag 名称'), { target: { value: 'Dirty' } });
  await act(async () => { await router.navigate(-1); });
  await screen.findByText('离开当前 Flag？');
  expect(router.state.location.pathname).toBe('/flags/42');
  fireEvent.click(screen.getByRole('button', { name: '继续编辑' }));
  expect(router.state.location.pathname).toBe('/flags/42');
  await act(async () => { await router.navigate(-1); });
  fireEvent.click(await screen.findByRole('button', { name: '放弃修改并离开' }));
  await waitFor(() => expect(router.state.location.pathname).toBe('/flags'));
});

const auditRecords: AuditLog[] = [
  {
    id: 2,
    flag_id: 42,
    flag_key: 'checkout',
    environment: 'production',
    action_type: 'RULES_SYNCED',
    operator: 'admin',
    default_value: true,
    created_at: '2026-01-02T03:04:05Z',
    diff_summary: {
      action: 'rules_synced',
      added: [{ priority: 3, attribute_name: 'beta_user', operator: 'equals', expected_value: true, return_value: true }],
      updated: [],
      deleted: [],
    },
  },
  {
    id: 1,
    flag_id: 42,
    flag_key: 'checkout',
    environment: 'production',
    action_type: 'FLAG_TOGGLED',
    operator: 'admin',
    default_value: true,
    created_at: '2026-01-01T09:00:00Z',
    diff_summary: { action: 'toggled', old_enabled: false, new_enabled: true },
  },
];

it('deep links to the audit tab and renders the structured timeline from the server', async () => {
  server.use(http.get('*/api/v1/flags/42/audit-logs', ({ request }) => {
    requests.push({ url: new URL(request.url).pathname, method: request.method, body: null });
    return HttpResponse.json({ code: 'SUCCESS', data: auditRecords });
  }));

  const router = await open('/flags/42?tab=audit');

  expect(router.state.location.pathname).toBe('/flags/42');
  expect(router.state.location.search).toBe('');
  expect(screen.getByRole('tab', { name: '变更历史' })).toHaveAttribute('aria-selected', 'true');
  await screen.findByText('规则变更');
  expect(screen.getAllByText('操作人：admin')).toHaveLength(2);
  expect(screen.getByText(new Date(auditRecords[0].created_at).toLocaleString('zh-CN'))).toBeInTheDocument();
  expect(screen.getByText('beta_user')).toBeInTheDocument();
  expect(screen.getByText('已停用 → 已启用')).toBeInTheDocument();
  expect(requests.some(request => request.method === 'GET' && request.url.endsWith('/audit-logs'))).toBe(true);
});

it('shows an empty placeholder when the audit endpoint has no records', async () => {
  await open('/flags/42?tab=audit');

  expect(await screen.findByText('暂无变更记录')).toBeInTheDocument();
  expect(screen.queryByText('变更历史暂未开放。')).not.toBeInTheDocument();
});

it('shows an error alert when the audit request fails', async () => {
  server.use(http.get('*/api/v1/flags/42/audit-logs', () =>
    HttpResponse.json({ code: 'INTERNAL_ERROR', message: '审计日志服务不可用' }, { status: 500 }),
  ));

  await open('/flags/42?tab=audit');

  expect(await screen.findByText('变更历史加载失败')).toBeInTheDocument();
  expect(screen.getByText('审计日志服务不可用')).toBeInTheDocument();
});
