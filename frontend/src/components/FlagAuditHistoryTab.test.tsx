import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { FlagAuditHistoryTab } from './FlagAuditHistoryTab';
import { AuditLog } from '../types';

const server = setupServer();
let networkFetch: typeof fetch;
const AUDIT_URL = '*/api/v1/flags/42/audit-logs';

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

const base = { flag_id: 42, flag_key: 'checkout', environment: 'production' as const };

const rulesLog: AuditLog = {
  ...base,
  id: 3,
  action_type: 'RULES_SYNCED',
  operator: 'admin',
  created_at: '2026-01-02T03:04:05Z',
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

const flagUpdatedLog: AuditLog = {
  ...base,
  id: 2,
  action_type: 'FLAG_UPDATED',
  operator: 'alice',
  created_at: '2026-01-01T10:00:00Z',
  diff_summary: {
    action: 'updated',
    before: { name: '旧名称', description: '旧描述', default_value: false },
    after: { name: '新名称', description: '新描述', default_value: true },
  },
};

const toggledLog: AuditLog = {
  ...base,
  id: 1,
  action_type: 'FLAG_TOGGLED',
  operator: 'admin',
  created_at: '2026-01-01T09:00:00Z',
  diff_summary: { action: 'toggled', old_enabled: false, new_enabled: true },
};

function respondWith(logs: AuditLog[]) {
  server.use(http.get(AUDIT_URL, () => HttpResponse.json({ code: 'SUCCESS', data: logs })));
}

describe('FlagAuditHistoryTab', () => {
  it('renders newest-first timeline cards with the real operator, action and time', async () => {
    respondWith([rulesLog, flagUpdatedLog, toggledLog]);
    render(<FlagAuditHistoryTab flagId={42} />);

    const timeline = await screen.findByTestId('audit-timeline');
    expect(timeline).toBeInTheDocument();
    expect(screen.getByText('规则变更')).toBeInTheDocument();
    expect(screen.getByText('修改信息')).toBeInTheDocument();
    expect(screen.getByText('启停切换')).toBeInTheDocument();
    expect(screen.getAllByText('操作人：admin')).toHaveLength(2);
    expect(screen.getByText('操作人：alice')).toBeInTheDocument();
    expect(screen.getByText(new Date(rulesLog.created_at).toLocaleString('zh-CN'))).toBeInTheDocument();
    expect(screen.getAllByTestId(/^audit-log-/).map(card => card.getAttribute('data-testid'))).toEqual([
      'audit-log-3',
      'audit-log-2',
      'audit-log-1',
    ]);
  });

  it('expands RULES_SYNCED into added rules, field-level before/after and deleted snapshots', async () => {
    respondWith([rulesLog]);
    render(<FlagAuditHistoryTab flagId={42} />);

    await screen.findByText('新增规则（1）');
    expect(screen.getByText('修改规则（1）')).toBeInTheDocument();
    expect(screen.getByText('删除规则（1）')).toBeInTheDocument();

    expect(screen.getByText('beta_user')).toBeInTheDocument();
    expect(screen.getByText('优先级 3')).toBeInTheDocument();

    expect(screen.getByText('规则 #11')).toBeInTheDocument();
    expect(screen.getByTestId('rule-change-operator')).toHaveTextContent('equals');
    expect(screen.getByTestId('rule-change-operator')).toHaveTextContent('in');
    expect(screen.getByTestId('rule-change-expected_value')).toHaveTextContent('"CN"');
    expect(screen.getByTestId('rule-change-expected_value')).toHaveTextContent('["CN","HK"]');

    expect(screen.getByText('plan')).toBeInTheDocument();
    expect(screen.getByText('优先级 2')).toBeInTheDocument();
  });

  it('compares FLAG_UPDATED fields side by side and shows the FLAG_TOGGLED state flow', async () => {
    respondWith([flagUpdatedLog, toggledLog]);
    render(<FlagAuditHistoryTab flagId={42} />);

    await screen.findByTestId('flag-change-name');
    expect(screen.getByTestId('flag-change-name')).toHaveTextContent('旧名称');
    expect(screen.getByTestId('flag-change-name')).toHaveTextContent('新名称');
    expect(screen.getByTestId('flag-change-description')).toHaveTextContent('旧描述');
    expect(screen.getByTestId('flag-change-description')).toHaveTextContent('新描述');
    expect(screen.getByTestId('flag-change-default_value')).toHaveTextContent('false');
    expect(screen.getByTestId('flag-change-default_value')).toHaveTextContent('true');
    expect(screen.getByTestId('flag-toggle-diff')).toHaveTextContent('已停用 → 已启用');
  });

  it('shows a readable empty state when the flag has no audit records', async () => {
    respondWith([]);
    render(<FlagAuditHistoryTab flagId={42} />);

    expect(await screen.findByText('暂无变更记录')).toBeInTheDocument();
    expect(screen.queryByTestId('audit-timeline')).not.toBeInTheDocument();
  });

  it('shows an error alert on failure and recovers when reloaded', async () => {
    let calls = 0;
    server.use(
      http.get(AUDIT_URL, () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json({ code: 'INTERNAL_ERROR', message: '审计服务不可用' }, { status: 500 });
        return HttpResponse.json({ code: 'SUCCESS', data: [toggledLog] });
      }),
    );
    render(<FlagAuditHistoryTab flagId={42} />);

    expect(await screen.findByText('变更历史加载失败')).toBeInTheDocument();
    expect(screen.getByText('审计服务不可用')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
    expect(await screen.findByText('启停切换')).toBeInTheDocument();
    expect(screen.queryByText('变更历史加载失败')).not.toBeInTheDocument();
  });

  it('renders a readable fallback instead of crashing on an unparseable diff', async () => {
    respondWith([{ ...toggledLog, action_type: 'MYSTERY_ACTION', diff_summary: { action: 'mystery' } }]);
    render(<FlagAuditHistoryTab flagId={42} />);

    expect(await screen.findByText('该变更类型暂不支持结构化展示。')).toBeInTheDocument();
    expect(screen.getByText('未识别的变更类型')).toBeInTheDocument();
  });
});

describe('FlagAuditHistoryTab seed records', () => {
  it('renders a readable rule-count summary for seed sync records without a rule diff', async () => {
    respondWith([{ ...rulesLog, diff_summary: { action: 'rules_seed_synced', rule_count: 1 } }]);
    render(<FlagAuditHistoryTab flagId={42} />);

    expect(await screen.findByText('种子同步 1 条规则')).toBeInTheDocument();
    expect(screen.queryByText('本次同步无规则增删改。')).not.toBeInTheDocument();
  });

  it('renders FLAG_CREATED with fixed 7-field order, EnvironmentBadge, and graceful fallback for missing historical fields', async () => {
    const legacyCreatedLog: AuditLog = {
      ...base,
      id: 10,
      action_type: 'FLAG_CREATED',
      operator: 'admin',
      created_at: '2026-01-01T08:00:00Z',
      diff_summary: {
        action: 'created',
        key: 'checkout',
        name: 'Checkout',
        description: '',
        environment: 'production',
        default_value: false,
      },
    };
    respondWith([legacyCreatedLog]);
    render(<FlagAuditHistoryTab flagId={42} />);

    await screen.findByTestId('flag-created-key');
    const orderedIds = ['key', 'name', 'description', 'environment', 'default_value', 'enabled', 'rule_count'];
    const renderedIds = Array.from(document.querySelectorAll('[data-testid^="flag-created-"]')).map(el =>
      el.getAttribute('data-testid')?.replace('flag-created-', ''),
    );
    expect(renderedIds).toEqual(orderedIds);

    expect(screen.getByTestId('flag-created-key')).toHaveTextContent('Flag Keycheckout');
    expect(screen.getByTestId('flag-created-name')).toHaveTextContent('名称Checkout');
    expect(screen.getByTestId('flag-created-description')).toHaveTextContent('描述未设置');
    expect(screen.getByTestId('flag-created-environment')).toHaveTextContent('环境Production');
    expect(screen.getByTestId('flag-created-default_value')).toHaveTextContent('默认返回值false');
    expect(screen.getByTestId('flag-created-enabled')).toHaveTextContent('启停状态—');
    expect(screen.getByTestId('flag-created-rule_count')).toHaveTextContent('初始规则数—');
  });
});
