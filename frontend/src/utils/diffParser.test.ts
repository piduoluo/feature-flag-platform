import { describe, expect, it } from 'vitest';
import { parseAuditDiff } from './diffParser';

// Real RULES_SYNCED payload shape written by backend/internal/service/rule_service.go.
const rulesSyncedDiff = {
  action: 'rules_synced',
  added: [
    { priority: 3, attribute_name: 'beta_user', operator: 'equals', expected_value: true, return_value: true },
  ],
  updated: [
    {
      id: 11,
      before: { priority: 1, attribute_name: 'country', operator: 'equals', expected_value: 'CN', return_value: true },
      after: { priority: 1, attribute_name: 'country', operator: 'in', expected_value: ['CN', 'HK'], return_value: true },
    },
  ],
  deleted: [
    { id: 12, priority: 2, attribute_name: 'plan', operator: 'equals', expected_value: 'pro', return_value: false },
  ],
};

describe('parseAuditDiff for RULES_SYNCED', () => {
  it('exposes added rules, field-level before/after changes and deleted snapshots', () => {
    const parsed = parseAuditDiff(rulesSyncedDiff);

    expect(parsed.action).toBe('rules_synced');
    expect(parsed.isMalformed).toBe(false);
    expect(parsed.ruleDiff?.added).toEqual([
      { priority: 3, attribute_name: 'beta_user', operator: 'equals', expected_value: true, return_value: true },
    ]);
    expect(parsed.ruleDiff?.deleted).toEqual([
      { id: 12, priority: 2, attribute_name: 'plan', operator: 'equals', expected_value: 'pro', return_value: false },
    ]);
    expect(parsed.ruleDiff?.updated).toHaveLength(1);
    expect(parsed.ruleDiff?.updated[0].id).toBe(11);
    expect(parsed.ruleDiff?.updated[0].changes).toEqual([
      { field: 'operator', before: 'equals', after: 'in' },
      { field: 'expected_value', before: 'CN', after: ['CN', 'HK'] },
    ]);
    expect(parsed.summary).toBe('新增 1 条、修改 1 条、删除 1 条规则');
  });
});

describe('parseAuditDiff for FLAG_UPDATED', () => {
  it('compares name, description and default value before/after', () => {
    const parsed = parseAuditDiff({
      action: 'updated',
      before: { name: '旧名称', description: '', default_value: false },
      after: { name: '新名称', description: '新版描述', default_value: true },
    });

    expect(parsed.action).toBe('updated');
    expect(parsed.isMalformed).toBe(false);
    expect(parsed.flagUpdate).toEqual({
      before: { name: '旧名称', description: '', default_value: false },
      after: { name: '新名称', description: '新版描述', default_value: true },
      changes: [
        { field: 'name', before: '旧名称', after: '新名称' },
        { field: 'description', before: '', after: '新版描述' },
        { field: 'default_value', before: false, after: true },
      ],
    });
    expect(parsed.summary).toBe('修改：名称、描述、默认返回值');
  });
});

describe('parseAuditDiff for FLAG_TOGGLED', () => {
  it('exposes the old and new enabled states', () => {
    const parsed = parseAuditDiff({ action: 'toggled', old_enabled: false, new_enabled: true });

    expect(parsed.action).toBe('toggled');
    expect(parsed.isMalformed).toBe(false);
    expect(parsed.flagToggle).toEqual({ old_enabled: false, new_enabled: true });
    expect(parsed.summary).toBe('启用 Flag');
  });
});

describe('parseAuditDiff safe degradation', () => {
  const unrecoverable: { name: string; input: unknown }[] = [
    { name: 'null', input: null },
    { name: 'undefined', input: undefined },
    { name: 'number', input: 42 },
    { name: 'array', input: [{ action: 'updated' }] },
    { name: 'non-JSON string', input: 'not-json' },
    { name: 'unknown action', input: { action: 'mystery' } },
  ];

  it.each(unrecoverable)('returns a readable fallback instead of throwing for $name', ({ input }) => {
    const parsed = parseAuditDiff(input);

    expect(parsed.action).toBe('unknown');
    expect(parsed.isMalformed).toBe(true);
    expect(parsed.summary).not.toBe('');
    expect(parsed.fallbackText).toBeTruthy();
  });

  it('keeps partial rule data but flags a structurally broken RULES_SYNCED payload', () => {
    const parsed = parseAuditDiff({
      action: 'rules_synced',
      added: [{ priority: 1, attribute_name: 'country', operator: 'equals', expected_value: 'CN', return_value: true }],
      updated: 'broken',
      deleted: null,
    });

    expect(parsed.action).toBe('rules_synced');
    expect(parsed.isMalformed).toBe(true);
    expect(parsed.fallbackText).toBeTruthy();
    expect(parsed.ruleDiff?.added).toHaveLength(1);
    expect(parsed.ruleDiff?.updated).toEqual([]);
    expect(parsed.ruleDiff?.deleted).toEqual([]);
  });

  it('ignores wrong-typed flag fields and flags the degraded comparison', () => {
    const parsed = parseAuditDiff({
      action: 'updated',
      before: { name: 42, description: 'same', default_value: false },
      after: { name: 'New', description: 'same', default_value: true },
    });

    expect(parsed.action).toBe('updated');
    expect(parsed.isMalformed).toBe(true);
    expect(parsed.fallbackText).toBeTruthy();
    expect(parsed.flagUpdate?.changes).toEqual([{ field: 'default_value', before: false, after: true }]);
  });
});

describe('parseAuditDiff for FLAG_CREATED', () => {
  it('infers FLAG_CREATED from the payload shape when action is absent (seeded records)', () => {
    const parsed = parseAuditDiff(
      { key: 'checkout', name: 'Checkout', environment: 'production', default_value: false, rule_count: 2 },
    );

    expect(parsed.action).toBe('created');
    expect(parsed.isMalformed).toBe(false);
    expect(parsed.flagCreated).toEqual({
      key: 'checkout',
      name: 'Checkout',
      environment: 'production',
      default_value: false,
      rule_count: 2,
    });
    expect(parsed.summary).toBe('创建 Flag：Checkout');
  });

  it('falls back to the AuditLog action_type when the payload shape is ambiguous', () => {
    expect(parseAuditDiff({ key: 'checkout' }, 'FLAG_CREATED').action).toBe('created');
  });
});

describe('parseAuditDiff for RULES_SYNCED seed records', () => {
  it('degrades a seed sync record to a readable rule-count summary instead of an empty diff', () => {
    const parsed = parseAuditDiff({ action: 'rules_seed_synced', rule_count: 1 });

    expect(parsed.action).toBe('rules_synced');
    expect(parsed.isMalformed).toBe(false);
    expect(parsed.ruleSeed).toEqual({ rule_count: 1 });
    expect(parsed.ruleDiff).toBeUndefined();
    expect(parsed.summary).toBe('种子同步 1 条规则');
  });
});

describe('parseAuditDiff flag update payload variants', () => {
  it('accepts old/new aliases for before/after', () => {
    const parsed = parseAuditDiff({
      action: 'updated',
      old: { name: '旧名称', description: '', default_value: false },
      new: { name: '新名称', description: '新版描述', default_value: true },
    });

    expect(parsed.action).toBe('updated');
    expect(parsed.flagUpdate?.changes).toEqual([
      { field: 'name', before: '旧名称', after: '新名称' },
      { field: 'description', before: '', after: '新版描述' },
      { field: 'default_value', before: false, after: true },
    ]);
  });

  it('treats a flat updated payload as the new values', () => {
    const parsed = parseAuditDiff({ action: 'updated', name: '新名称', description: '新版描述', default_value: true });

    expect(parsed.action).toBe('updated');
    expect(parsed.isMalformed).toBe(false);
    expect(parsed.flagUpdate?.changes).toEqual([
      { field: 'name', before: undefined, after: '新名称' },
      { field: 'description', before: undefined, after: '新版描述' },
      { field: 'default_value', before: undefined, after: true },
    ]);
    expect(parsed.summary).toBe('修改：名称、描述、默认返回值');
  });
});

describe('parseAuditDiff payload forms', () => {
  it('accepts diff_summary serialized as JSON text at the HTTP boundary', () => {
    const parsed = parseAuditDiff(JSON.stringify({ action: 'toggled', old_enabled: true, new_enabled: false }));

    expect(parsed.action).toBe('toggled');
    expect(parsed.flagToggle).toEqual({ old_enabled: true, new_enabled: false });
    expect(parsed.summary).toBe('停用 Flag');
  });
});

describe('parseAuditDiff field comparison semantics', () => {
  it('does not report an unchanged array expected_value when only the priority changes', () => {
    const before = {
      priority: 1,
      attribute_name: 'plan',
      operator: 'in',
      expected_value: ['pro', 'team'],
      return_value: true,
    };
    const parsed = parseAuditDiff({
      action: 'rules_synced',
      added: [],
      deleted: [],
      updated: [{ id: 9, before, after: { ...before, priority: 2 } }],
    });

    expect(parsed.ruleDiff?.updated[0].changes).toEqual([{ field: 'priority', before: 1, after: 2 }]);
  });

  it('degrades a seed sync record with a missing rule_count', () => {
    const parsed = parseAuditDiff({ action: 'rules_seed_synced' });

    expect(parsed.action).toBe('rules_synced');
    expect(parsed.isMalformed).toBe(true);
    expect(parsed.fallbackText).toBeTruthy();
    expect(parsed.summary).toBe('种子同步规则（明细缺失）');
  });
});
