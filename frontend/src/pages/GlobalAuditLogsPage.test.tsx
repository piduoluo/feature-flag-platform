import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { routeConfig } from '../router';
import { AuditLog, Flag } from '../types';

const server = setupServer();
let networkFetch: typeof fetch;
const AUDIT_URL = '*/api/v1/audit-logs';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  networkFetch = globalThis.fetch;
});
afterAll(() => server.close());
beforeEach(() => {
  // Node fetch needs an absolute URL; requests still pass through MSW.
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => networkFetch(new URL(input, window.location.href), init));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  server.resetHandlers();
});

/** Query strings the page actually sent over HTTP, oldest first. */
let sentQueries: URLSearchParams[] = [];

function lastQuery(): URLSearchParams {
  const query = sentQueries[sentQueries.length - 1];
  if (!query) throw new Error('页面没有发起 GET /api/v1/audit-logs 请求');
  return query;
}

/**
 * 测试替身只实现 SPEC 第 9 条的对外契约：服务端过滤 + 分页。
 * 页面必须自己发对参数、渲染返回结果，而不是在客户端二次过滤。
 */
function serveAuditLogs(logs: AuditLog[]) {
  server.use(
    http.get(AUDIT_URL, ({ request }) => {
      const url = new URL(request.url);
      sentQueries.push(url.searchParams);
      let matched = logs;
      const environment = url.searchParams.get('environment');
      if (environment) matched = matched.filter(log => log.environment === environment);
      const flagKey = url.searchParams.get('flag_key');
      if (flagKey) matched = matched.filter(log => log.flag_key.toLowerCase().includes(flagKey.toLowerCase()));
      const actionType = url.searchParams.get('action_type');
      if (actionType) matched = matched.filter(log => log.action_type === actionType);
      const page = Number(url.searchParams.get('page') ?? '1');
      const pageSize = Number(url.searchParams.get('page_size') ?? '20');
      return HttpResponse.json({
        code: 'SUCCESS',
        data: {
          items: matched.slice((page - 1) * pageSize, page * pageSize),
          total: matched.length,
          page,
          page_size: pageSize,
        },
      });
    }),
  );
}

function renderGlobalAuditLogsPage() {
  const router = createMemoryRouter(routeConfig, { initialEntries: ['/audit-logs'] });
  render(<RouterProvider router={router} />);
  return router;
}

const createdAt = '2026-01-05T10:00:00Z';

const createdLog: AuditLog = {
  id: 11,
  flag_id: 42,
  flag_key: 'checkout_v2',
  environment: 'production',
  action_type: 'FLAG_CREATED',
  operator: 'alice',
  default_value: true,
  created_at: createdAt,
  diff_summary: {
    action: 'flag_created',
    key: 'checkout_v2',
    name: '新版结算页',
    environment: 'production',
    default_value: false,
  },
};

beforeEach(() => {
  sentQueries = [];
});

describe('GlobalAuditLogsPage 首屏', () => {
  it('通过 GET /api/v1/audit-logs 加载第一页并渲染 Flag Key、环境、默认返回值、操作、操作人与操作时间', async () => {
    serveAuditLogs([createdLog]);
    renderGlobalAuditLogsPage();

    expect(screen.queryByRole('heading', { name: '全局操作历史' })).not.toBeInTheDocument();

    const link = await screen.findByRole('link', { name: 'checkout_v2' });
    expect(link).toHaveAttribute('href', '/flags/42?tab=audit');

    expect(screen.getByRole('columnheader', { name: 'Flag Key' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '环境' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '默认返回值' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '操作' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '操作人' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '操作时间' })).toBeInTheDocument();

    const row = link.closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('Production')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('true')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('新建开关')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText('alice')).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText(new Date(createdAt).toLocaleString('zh-CN'))).toBeInTheDocument();
    expect(screen.getByText('共 1 条记录')).toBeInTheDocument();

    expect(sentQueries).toHaveLength(1);
    expect(lastQuery().get('page')).toBe('1');
    expect(lastQuery().get('page_size')).toBe('20');
    expect(lastQuery().get('environment')).toBeNull();
    expect(lastQuery().get('flag_key')).toBeNull();
    expect(lastQuery().get('action_type')).toBeNull();
  });
});

const devToggledLog: AuditLog = {
  id: 21,
  flag_id: 7,
  flag_key: 'checkout_dev',
  environment: 'development',
  action_type: 'FLAG_TOGGLED',
  operator: 'bob',
  default_value: false,
  created_at: '2026-01-04T10:00:00Z',
  diff_summary: { action: 'flag_toggled', old_enabled: true, new_enabled: false },
};

const rulesSyncedLog: AuditLog = {
  id: 22,
  flag_id: 42,
  flag_key: 'checkout_v2',
  environment: 'production',
  action_type: 'RULES_SYNCED',
  operator: 'carol',
  default_value: true,
  created_at: '2026-01-03T10:00:00Z',
  diff_summary: {
    action: 'rules_synced',
    added: [{ priority: 3, attribute_name: 'beta_user', operator: 'equals', expected_value: true, return_value: true }],
    updated: [
      {
        id: 11,
        before: { priority: 1, attribute_name: 'country', operator: 'equals', expected_value: 'CN', return_value: true },
        after: { priority: 1, attribute_name: 'country', operator: 'in', expected_value: ['CN', 'HK'], return_value: true },
      },
    ],
    deleted: [{ id: 12, priority: 2, attribute_name: 'plan', operator: 'equals', expected_value: 'pro', return_value: false }],
  },
};

describe('GlobalAuditLogsPage 筛选', () => {
  it('选择运行环境后向后端重新查询并只展示该环境的记录', async () => {
    serveAuditLogs([createdLog, devToggledLog]);
    renderGlobalAuditLogsPage();

    await screen.findByRole('link', { name: 'checkout_v2' });

    fireEvent.mouseDown(screen.getByRole('combobox', { name: '环境筛选' }));
    fireEvent.click(await screen.findByTitle('Development'));

    await waitFor(() => expect(lastQuery().get('environment')).toBe('development'));
    await waitFor(() => expect(screen.getByRole('link', { name: 'checkout_dev' })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'checkout_v2' })).not.toBeInTheDocument();
    expect(lastQuery().get('page')).toBe('1');
    expect(lastQuery().get('page_size')).toBe('20');
  });

  it('操作类型下拉按 action_type 过滤，支持 FLAG_CREATED 与 RULES_SYNCED', async () => {
    serveAuditLogs([createdLog, rulesSyncedLog]);
    renderGlobalAuditLogsPage();

    await screen.findByText('共 2 条记录');

    fireEvent.mouseDown(screen.getByRole('combobox', { name: '操作类型筛选' }));
    fireEvent.click(await screen.findByTitle('规则变更'));

    await waitFor(() => expect(lastQuery().get('action_type')).toBe('RULES_SYNCED'));
    await waitFor(() => expect(within(screen.getByRole('table')).queryByText('新建开关')).not.toBeInTheDocument());
    expect(within(screen.getByRole('table')).getByText('规则变更')).toBeInTheDocument();
    expect(screen.getByText('共 1 条记录')).toBeInTheDocument();
  });

  it('Flag Key 搜索框把关键字作为 flag_key 交给后端，清空后移除该条件', async () => {
    serveAuditLogs([createdLog, devToggledLog]);
    renderGlobalAuditLogsPage();

    await screen.findByRole('link', { name: 'checkout_v2' });

    const searchInput = screen.getByPlaceholderText('按 Flag Key 搜索...');
    fireEvent.change(searchInput, { target: { value: 'dev' } });

    await waitFor(() => expect(lastQuery().get('flag_key')).toBe('dev'));
    await waitFor(() => expect(screen.getByRole('link', { name: 'checkout_dev' })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'checkout_v2' })).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: '' } });

    await waitFor(() => expect(lastQuery().get('flag_key')).toBeNull());
    await waitFor(() => expect(screen.getByRole('link', { name: 'checkout_v2' })).toBeInTheDocument());
  });

  it('用后端 total 驱动分页，翻页请求 page=2，且改筛选条件会重置回第 1 页', async () => {
    const manyLogs: AuditLog[] = Array.from({ length: 23 }, (_, index) => ({
      ...createdLog,
      id: 100 + index,
      flag_id: 100 + index,
      flag_key: `flag_${String(index).padStart(2, '0')}`,
    }));
    serveAuditLogs(manyLogs);
    renderGlobalAuditLogsPage();

    await screen.findByRole('link', { name: 'flag_00' });
    expect(screen.getByText('共 23 条记录')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('2'));

    await waitFor(() => expect(lastQuery().get('page')).toBe('2'));
    await screen.findByRole('link', { name: 'flag_20' });
    expect(screen.queryByRole('link', { name: 'flag_00' })).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: '环境筛选' }));
    fireEvent.click(await screen.findByTitle('Production'));

    await waitFor(() => expect(lastQuery().get('environment')).toBe('production'));
    expect(lastQuery().get('page')).toBe('1');
    await screen.findByRole('link', { name: 'flag_00' });
  });
});

const seedSyncedLog: AuditLog = {
  id: 31,
  flag_id: 9,
  flag_key: 'search_v1',
  environment: 'development',
  action_type: 'RULES_SYNCED',
  operator: 'seed',
  default_value: true,
  created_at: '2026-01-02T10:00:00Z',
  diff_summary: { action: 'rules_seed_synced', rule_count: 2 },
};

const malformedRulesLog: AuditLog = {
  id: 32,
  flag_id: 9,
  flag_key: 'search_v1',
  environment: 'development',
  action_type: 'RULES_SYNCED',
  operator: 'carol',
  default_value: true,
  created_at: '2026-01-02T09:00:00Z',
  diff_summary: { action: 'rules_synced', added: 'not-an-array' },
};

function expandFirstRow() {
  fireEvent.click(screen.getAllByRole('button', { name: 'Expand row' })[0]);
}

describe('GlobalAuditLogsPage 行展开 Diff', () => {
  it('展开 RULES_SYNCED 行后按共享契约渲染新增、修改与删除规则', async () => {
    serveAuditLogs([rulesSyncedLog]);
    renderGlobalAuditLogsPage();

    await screen.findByRole('link', { name: 'checkout_v2' });
    expect(screen.queryByText('新增规则（1）')).not.toBeInTheDocument();

    expandFirstRow();

    expect(await screen.findByText('新增规则（1）')).toBeInTheDocument();
    expect(screen.getByText('修改规则（1）')).toBeInTheDocument();
    expect(screen.getByText('删除规则（1）')).toBeInTheDocument();
    expect(screen.getByText('beta_user')).toBeInTheDocument();
    expect(screen.getByText('规则 #11')).toBeInTheDocument();
    expect(screen.getByTestId('rule-change-operator')).toHaveTextContent('equals');
    expect(screen.getByTestId('rule-change-operator')).toHaveTextContent('in');
    expect(screen.getByTestId('rule-change-expected_value')).toHaveTextContent('["CN","HK"]');
  });

  it('种子同步记录只有 summary/ruleSeed 时展示规则数量，绝不显示“无规则变更”', async () => {
    serveAuditLogs([seedSyncedLog]);
    renderGlobalAuditLogsPage();

    await screen.findByRole('link', { name: 'search_v1' });
    expandFirstRow();

    expect(await screen.findByText('种子同步 2 条规则')).toBeInTheDocument();
    expect(screen.queryByText('本次同步无规则增删改。')).not.toBeInTheDocument();
    expect(screen.queryByText(/无规则变更/)).not.toBeInTheDocument();
    expect(screen.queryByText('新增规则（0）')).not.toBeInTheDocument();
  });

  it('diff 畸形时展开行给出降级提示与可读的 fallbackText', async () => {
    serveAuditLogs([malformedRulesLog]);
    renderGlobalAuditLogsPage();

    await screen.findByRole('link', { name: 'search_v1' });
    expandFirstRow();

    // 降级提示必须可读，而不是让展开行静默空白或崩掉。
    expect(await screen.findByText('规则变更摘要格式不完整，已尽力展示可识别的内容。')).toBeInTheDocument();
    expect(screen.getByTestId('audit-diff-32')).toBeInTheDocument();
  });
});

const detailFlag: Flag = {
  id: 42,
  key: 'checkout_v2',
  name: '新版结算页',
  description: '',
  environment: 'production',
  enabled: true,
  default_value: false,
  rules: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function serveFlagDetail() {
  server.use(
    http.get('*/api/v1/flags/42', () => HttpResponse.json({ code: 'SUCCESS', data: detailFlag })),
    http.get('*/api/v1/flags/42/audit-logs', () => HttpResponse.json({ code: 'SUCCESS', data: [] })),
  );
}

describe('GlobalAuditLogsPage 三态与直达跳转', () => {
  it('首屏加载中展示加载提示，响应到达后替换为表格', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    server.use(
      http.get(AUDIT_URL, async () => {
        await gate;
        return HttpResponse.json({ code: 'SUCCESS', data: { items: [createdLog], total: 1, page: 1, page_size: 20 } });
      }),
    );
    renderGlobalAuditLogsPage();

    expect(await screen.findByTestId('audit-loading')).toBeInTheDocument();
    expect(screen.getByText('正在加载全局审计日志…')).toBeInTheDocument();

    await act(async () => { release(); });

    expect(await screen.findByRole('link', { name: 'checkout_v2' })).toBeInTheDocument();
    expect(screen.queryByTestId('audit-loading')).not.toBeInTheDocument();
  });

  it('没有审计记录时展示空状态而不是空白表格', async () => {
    serveAuditLogs([]);
    renderGlobalAuditLogsPage();

    expect(await screen.findByText('暂无审计记录')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('升级前的记录缺少默认值快照时展示占位符而不是 undefined', async () => {
    serveAuditLogs([{ ...createdLog, id: 77, default_value: null }]);
    renderGlobalAuditLogsPage();

    const link = await screen.findByRole('link', { name: 'checkout_v2' });
    const row = link.closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('—')).toBeInTheDocument();
  });

  it('请求失败时展示可重试的 Alert，点击“重新加载”后恢复列表', async () => {
    let attempts = 0;
    server.use(
      http.get(AUDIT_URL, ({ request }) => {
        sentQueries.push(new URL(request.url).searchParams);
        attempts += 1;
        if (attempts === 1) {
          return HttpResponse.json({ code: 'INTERNAL_ERROR', message: '审计服务不可用' }, { status: 500 });
        }
        return HttpResponse.json({ code: 'SUCCESS', data: { items: [createdLog], total: 1, page: 1, page_size: 20 } });
      }),
    );
    renderGlobalAuditLogsPage();

    expect(await screen.findByText('全局审计日志加载失败')).toBeInTheDocument();
    expect(screen.getByText('审计服务不可用')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));

    expect(await screen.findByRole('link', { name: 'checkout_v2' })).toBeInTheDocument();
    expect(screen.queryByText('全局审计日志加载失败')).not.toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it('点击 Flag Key 链接通过 SPA 路由直达 Flag 变更历史，且只使用一个详情 URL', async () => {
    serveAuditLogs([createdLog]);
    serveFlagDetail();
    const router = renderGlobalAuditLogsPage();

    const link = await screen.findByRole('link', { name: 'checkout_v2' });
    expect(link).toHaveAttribute('href', '/flags/42?tab=audit');

    fireEvent.click(link);

    await waitFor(() => expect(router.state.location.pathname).toBe('/flags/42'));
    expect(router.state.location.search).toBe('');
    expect(await screen.findByTestId('flag-detail-page')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '变更历史' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('detail-back-nav')).toHaveTextContent('全局操作历史');
    // 详情页变更历史 Tab 由同一套共享 Diff 契约渲染。
    expect(await screen.findByText('暂无变更记录')).toBeInTheDocument();
  });
});
