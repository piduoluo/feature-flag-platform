import { beforeAll, afterAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { routeConfig } from '../router';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { AuditLog, Flag } from '../types';
// Full AppShell + Ant Design modal flows can exceed Vitest's 5s default.
vi.setConfig({ testTimeout: 20000 });
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
    else if (url === '/api/v1/flags') data = { items: [], total: 0 };
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
it('saves settings independently through the HTTP contract and synchronizes the tab URL', async () => {
  const router = await open();
  fireEvent.change(screen.getByLabelText('Flag 名称'), { target: { value: 'New Checkout' } });
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }));
  await screen.findByRole('heading', { name: 'New Checkout' });
  expect(requests.filter(r => r.method === 'PUT')).toEqual([{ url: '/api/v1/flags/42', method: 'PUT', body: { name: 'New Checkout', description: '', default_value: false } }]);
  fireEvent.click(screen.getByRole('tab', { name: '规则配置' }));
  expect(router.state.location.search).toBe('?tab=rules');
});
it('keeps reordering local, clears reverted edits, and serializes continuous priorities only on save', async () => {
  await open('/flags/42');
  fireEvent.click(screen.getByRole('button', { name: '下移规则 1' }));
  expect(screen.getByRole('button', { name: '保存规则配置' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '上移规则 2' }));
  expect(screen.queryByRole('button', { name: '保存规则配置' })).not.toBeInTheDocument();
  expect(requests.filter(r => r.method === 'PUT')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: '下移规则 1' }));
  fireEvent.click(screen.getByRole('button', { name: '保存规则配置' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: '保存规则配置' })).not.toBeInTheDocument());
  expect(requests.find(r => r.method === 'PUT')?.body.rules.map((r: any) => [r.id, r.priority])).toEqual([[2, 1], [1, 2]]);
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
  expect(screen.getByText('基本设置中有未生效草稿')).toBeVisible();
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
  expect(router.state.location.search).toBe(suffix === '/42' ? '?tab=settings' : '?tab=rules');
  expect(screen.getByRole('tab', { name: '规则配置 *' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: suffix === '/42' ? '基本设置 *' : '基本设置' })).toBeInTheDocument();
  expect(requests.filter(r => r.method === 'PUT')).toHaveLength(suffix === '/42' ? 1 : 2);
});
it('blocks leaving dirty detail but lets tab history preserve drafts and warns before unload', async () => {
  const router = await open();
  fireEvent.change(screen.getByLabelText('Flag 名称'), { target: { value: 'Changed' } });
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole('tab', { name: '规则配置' }));
  await act(async () => { await router.navigate(-1); });
  expect(router.state.location.search).toBe('?tab=settings');
  expect(screen.getByLabelText('Flag 名称')).toHaveValue('Changed');
  fireEvent.click(screen.getByRole('link', { name: '功能开关' }));
  await waitFor(() => expect(screen.getByText('离开当前 Flag？')).toBeVisible());
  fireEvent.click(screen.getByRole('button', { name: '继续编辑' }));
  expect(router.state.location.pathname).toBe('/flags/42');
  fireEvent.click(screen.getByRole('link', { name: '功能开关' }));
  fireEvent.click(screen.getByRole('button', { name: '放弃修改并离开' }));
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
  await screen.findByText('规则 03');
  expect(requests.filter(r => r.method === 'PUT')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: '放弃修改' }));
  expect(screen.queryByText('规则 03')).not.toBeInTheDocument();
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

  expect(router.state.location.search).toBe('?tab=audit');
  expect(screen.getByRole('tab', { name: '变更历史' })).toHaveAttribute('aria-selected', 'true');
  await screen.findByText('规则批量同步');
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
