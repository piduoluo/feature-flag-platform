/**
 * 审计日志 `diff_summary` 的共享解析契约。
 *
 * 后端 `AuditLog.diff_summary` 是 JSONB 对象，不同 `action_type` 的结构不同。
 * 本模块把任意未知输入归一化为稳定的 `ParsedAuditDiff`，供：
 * - Ticket 08A：Flag 详情「变更历史」时间轴；
 * - Ticket 08B：全局操作历史表格的展开行。
 *
 * 契约保证：
 * 1. 输入为 `unknown`（对象、JSON 字符串、null 或畸形数据均可）；
 * 2. 永不抛异常，无法识别时返回 `action: 'unknown'` 与可读的 `fallbackText`；
 * 3. 已知动作但部分字段畸形时，尽力保留可识别内容，并通过 `isMalformed` 提示降级。
 */

/** 规范化后的审计动作，与后端 `action_type` 一一对应。 */
export type AuditAction = 'created' | 'updated' | 'toggled' | 'rules_synced' | 'unknown';

/** 规则快照中参与前后对比的字段。 */
export type RuleField = 'attribute_name' | 'operator' | 'expected_value' | 'return_value' | 'priority';

/** 规则字段的中文标签，供 08A/08B 复用，避免各自维护一份文案。 */
export const RULE_FIELD_LABELS: Record<RuleField, string> = {
  attribute_name: '属性名',
  operator: '操作符',
  expected_value: '期望值',
  return_value: '命中返回值',
  priority: '优先级',
};

/** 单条规则的结构化快照，字段与后端 Rule 实体一致。 */
export interface RuleSnapshot {
  id?: number;
  priority: number;
  attribute_name: string;
  operator: string;
  expected_value: unknown;
  return_value: boolean;
}

/** 规则单个字段的前后变化。 */
export interface RuleFieldChange {
  field: RuleField;
  before: unknown;
  after: unknown;
}

/** RULES_SYNCED 中一条被修改的规则。 */
export interface UpdatedRuleDiff {
  id: number;
  before: RuleSnapshot;
  after: RuleSnapshot;
  changes: RuleFieldChange[];
}

/** RULES_SYNCED 的三向差异。 */
export interface RuleDiff {
  added: RuleSnapshot[];
  updated: UpdatedRuleDiff[];
  deleted: RuleSnapshot[];
}

/** 种子数据只记录同步数量（action: rules_seed_synced），没有规则明细。 */
export interface RuleSeedDiff {
  rule_count: number;
}

/** Flag 基本设置中参与前后对比的字段。 */
export type FlagField = 'name' | 'description' | 'default_value';

/** Flag 基本设置字段的中文标签。 */
export const FLAG_FIELD_LABELS: Record<FlagField, string> = {
  name: '名称',
  description: '描述',
  default_value: '默认返回值',
};

/** Flag 基本设置快照。 */
export interface FlagFields {
  name?: string;
  description?: string;
  default_value?: boolean;
}

/** Flag 基本设置单个字段的前后变化。 */
export interface FlagFieldChange {
  field: FlagField;
  before: unknown;
  after: unknown;
}

/** FLAG_UPDATED 的前后对比。 */
export interface FlagUpdateDiff {
  before: FlagFields;
  after: FlagFields;
  changes: FlagFieldChange[];
}

/** FLAG_TOGGLED 的启停流转。 */
export interface FlagToggleDiff {
  old_enabled: boolean;
  new_enabled: boolean;
}

/** FLAG_CREATED 的创建快照（后端两种写入路径字段略有差异，均可选）。 */
export interface FlagCreatedDiff {
  key?: string;
  name?: string;
  description?: string;
  environment?: string;
  default_value?: boolean;
  enabled?: boolean;
  rule_count?: number;
}

/**
 * `parseAuditDiff` 的返回值。08B 可直接消费这些字段渲染展开行。
 *
 * 只有与 `action` 对应的展开字段会被赋值，其余为 `undefined`。
 */
export interface ParsedAuditDiff {
  action: AuditAction;
  /** FLAG_CREATED 的创建快照。 */
  flagCreated?: FlagCreatedDiff;
  /** FLAG_UPDATED 的名称/描述/默认返回值前后对比。 */
  flagUpdate?: FlagUpdateDiff;
  /** FLAG_TOGGLED 的启停流转。 */
  flagToggle?: FlagToggleDiff;
  /** RULES_SYNCED 的增删改三向差异；种子同步记录没有明细时为 undefined。 */
  ruleDiff?: RuleDiff;
  /** 种子同步记录（action: rules_seed_synced）的规则数量。 */
  ruleSeed?: RuleSeedDiff;
  /** 面向 UI 的单行摘要，任何输入下都存在且可读。 */
  summary: string;
  /** 输入无法被完整结构化理解时为 true；此时 `fallbackText` 给出可读说明。 */
  isMalformed: boolean;
  /** 降级时的可读说明，仅在 `isMalformed` 为 true 时提供。 */
  fallbackText?: string;
}

const RULE_FIELDS: RuleField[] = ['attribute_name', 'operator', 'expected_value', 'return_value', 'priority'];
const FLAG_FIELDS: FlagField[] = ['name', 'description', 'default_value'];

const ACTION_ALIASES: Record<string, AuditAction> = {
  flag_created: 'created',
  created: 'created',
  flag_updated: 'updated',
  updated: 'updated',
  flag_toggled: 'toggled',
  toggled: 'toggled',
  rules_synced: 'rules_synced',
};

/** 将后端对象或 JSON 字符串统一为普通对象；无法识别时返回 undefined。 */
function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    try {
      return toRecord(JSON.parse(value));
    } catch {
      return undefined;
    }
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function normalizeAction(value: unknown): AuditAction | undefined {
  if (typeof value !== 'string') return undefined;
  return ACTION_ALIASES[value.trim().toLowerCase()];
}

/** 从真实 payload 形状推断动作，兼容缺少 action 的历史/种子记录。 */
function inferAction(payload: Record<string, unknown> | undefined): AuditAction | undefined {
  if (!payload) return undefined;
  if ('added' in payload || 'updated' in payload || 'deleted' in payload) return 'rules_synced';
  if ('old_enabled' in payload || 'new_enabled' in payload) return 'toggled';
  if ('before' in payload || 'after' in payload || 'old' in payload || 'new' in payload) return 'updated';
  if ('key' in payload && ('name' in payload || 'environment' in payload || 'rule_count' in payload || 'default_value' in payload)) {
    return 'created';
  }
  return undefined;
}

/** diff 内的 action 优先，缺失时回退到 AuditLog.action_type，最后按真实形状推断。 */
function resolveAction(payload: Record<string, unknown> | undefined, actionType?: string): AuditAction | undefined {
  return normalizeAction(payload?.action) ?? normalizeAction(actionType) ?? inferAction(payload);
}

/** JSON 深比较，用于判断 expected_value（可能是数组/对象）是否变化。 */
function deepEqualJson(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => deepEqualJson(item, b[index]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aRecord = a as Record<string, unknown>;
    const bRecord = b as Record<string, unknown>;
    const aKeys = Object.keys(aRecord);
    const bKeys = Object.keys(bRecord);
    return aKeys.length === bKeys.length && aKeys.every(key => Object.prototype.hasOwnProperty.call(bRecord, key) && deepEqualJson(aRecord[key], bRecord[key]));
  }
  return false;
}

function readRuleSnapshot(input: unknown): RuleSnapshot | undefined {
  const record = toRecord(input);
  if (!record) return undefined;
  const { attribute_name, operator, priority, return_value } = record;
  if (typeof attribute_name !== 'string' || typeof operator !== 'string') return undefined;
  if (typeof priority !== 'number' || !Number.isFinite(priority)) return undefined;
  if (typeof return_value !== 'boolean') return undefined;
  const snapshot: RuleSnapshot = {
    priority,
    attribute_name,
    operator,
    expected_value: record.expected_value,
    return_value,
  };
  if (typeof record.id === 'number') snapshot.id = record.id;
  return snapshot;
}

function ruleChanges(before: RuleSnapshot, after: RuleSnapshot): RuleFieldChange[] {
  const changes: RuleFieldChange[] = [];
  for (const field of RULE_FIELDS) {
    if (!deepEqualJson(before[field], after[field])) {
      changes.push({ field, before: before[field], after: after[field] });
    }
  }
  return changes;
}

interface ReadFlagFieldsResult {
  fields: FlagFields;
  invalidFields: Set<FlagField>;
}

function readFlagFields(input: unknown): ReadFlagFieldsResult | undefined {
  const record = toRecord(input);
  if (!record) return undefined;
  const fields: FlagFields = {};
  const invalidFields = new Set<FlagField>();

  const readString = (field: 'name' | 'description') => {
    if (!(field in record)) return;
    if (typeof record[field] === 'string') fields[field] = record[field] as string;
    else invalidFields.add(field);
  };
  readString('name');
  readString('description');

  if ('default_value' in record) {
    if (typeof record.default_value === 'boolean') fields.default_value = record.default_value;
    else invalidFields.add('default_value');
  }

  return { fields, invalidFields };
}

function parseFlagCreated(payload: Record<string, unknown>): ParsedAuditDiff {
  const created: FlagCreatedDiff = {};
  for (const field of ['key', 'name', 'description', 'environment'] as const) {
    if (typeof payload[field] === 'string') created[field] = payload[field] as string;
  }
  for (const field of ['default_value', 'enabled'] as const) {
    if (typeof payload[field] === 'boolean') created[field] = payload[field] as boolean;
  }
  if (typeof payload.rule_count === 'number' && Number.isFinite(payload.rule_count)) {
    created.rule_count = payload.rule_count;
  }

  if (Object.keys(created).length === 0) {
    return {
      action: 'created',
      summary: '创建 Flag',
      isMalformed: true,
      fallbackText: '创建记录摘要为空，无法展示创建时的配置。',
    };
  }

  return {
    action: 'created',
    flagCreated: created,
    summary: created.name ? `创建 Flag：${created.name}` : created.key ? `创建 Flag：${created.key}` : '创建 Flag',
    isMalformed: false,
  };
}

function parseFlagToggled(payload: Record<string, unknown>): ParsedAuditDiff {
  const { old_enabled, new_enabled } = payload;
  if (typeof old_enabled !== 'boolean' || typeof new_enabled !== 'boolean') {
    return {
      action: 'toggled',
      summary: '启停状态变更',
      isMalformed: true,
      fallbackText: '启停变更摘要缺少合法的前后状态，无法展示流转。',
    };
  }
  return {
    action: 'toggled',
    flagToggle: { old_enabled, new_enabled },
    summary: new_enabled ? '启用 Flag' : '停用 Flag',
    isMalformed: false,
  };
}

function buildFlagUpdate(before: ReadFlagFieldsResult, after: ReadFlagFieldsResult): ParsedAuditDiff {
  const changes: FlagFieldChange[] = [];
  for (const field of FLAG_FIELDS) {
    if (before.invalidFields.has(field) || after.invalidFields.has(field)) continue;
    if (!deepEqualJson(before.fields[field], after.fields[field])) {
      changes.push({ field, before: before.fields[field], after: after.fields[field] });
    }
  }

  const malformed = before.invalidFields.size > 0 || after.invalidFields.size > 0;
  return {
    action: 'updated',
    flagUpdate: { before: before.fields, after: after.fields, changes },
    summary: changes.length ? `修改：${changes.map(change => FLAG_FIELD_LABELS[change.field]).join('、')}` : '修改基本信息',
    isMalformed: malformed,
    ...(malformed ? { fallbackText: '基本信息变更摘要包含无法识别的字段，已忽略后展示可识别内容。' } : {}),
  };
}

function parseFlagUpdated(payload: Record<string, unknown>): ParsedAuditDiff {
  const hasBefore = 'before' in payload || 'old' in payload;
  const hasAfter = 'after' in payload || 'new' in payload;
  const beforeRaw = 'before' in payload ? payload.before : payload.old;
  const afterRaw = 'after' in payload ? payload.after : payload.new;
  const before = hasBefore ? readFlagFields(beforeRaw) : undefined;
  const after = hasAfter ? readFlagFields(afterRaw) : undefined;

  if (hasBefore !== hasAfter || (hasBefore && (!before || !after))) {
    return {
      action: 'updated',
      summary: '修改基本信息',
      isMalformed: true,
      fallbackText: '基本信息变更摘要缺少前后取值，无法对比。',
    };
  }

  if (before && after) return buildFlagUpdate(before, after);

  // 平铺形状（无 before/after、无 old/new）：把顶层字段视为修改后的取值。
  const flat = readFlagFields(payload);
  if (!flat || (Object.keys(flat.fields).length === 0 && flat.invalidFields.size === 0)) {
    return {
      action: 'updated',
      summary: '修改基本信息',
      isMalformed: true,
      fallbackText: '基本信息变更摘要缺少前后取值，无法对比。',
    };
  }

  const changes: FlagFieldChange[] = [];
  for (const field of FLAG_FIELDS) {
    if (flat.invalidFields.has(field) || flat.fields[field] === undefined) continue;
    changes.push({ field, before: undefined, after: flat.fields[field] });
  }
  const malformed = flat.invalidFields.size > 0;
  return {
    action: 'updated',
    flagUpdate: { before: {}, after: flat.fields, changes },
    summary: changes.length ? `修改：${changes.map(change => FLAG_FIELD_LABELS[change.field]).join('、')}` : '修改基本信息',
    isMalformed: malformed,
    ...(malformed ? { fallbackText: '基本信息变更摘要包含无法识别的字段，已忽略后展示可识别内容。' } : {}),
  };
}

function parseRulesSeedSynced(payload: Record<string, unknown>): ParsedAuditDiff {
  const count = payload.rule_count;
  if (typeof count === 'number' && Number.isFinite(count)) {
    return {
      action: 'rules_synced',
      ruleSeed: { rule_count: count },
      summary: `种子同步 ${count} 条规则`,
      isMalformed: false,
    };
  }
  return {
    action: 'rules_synced',
    summary: '种子同步规则（明细缺失）',
    isMalformed: true,
    fallbackText: '种子同步记录缺少规则数量，无法展示同步明细。',
  };
}

function parseRulesSynced(payload: Record<string, unknown>): ParsedAuditDiff {
  let malformed = false;
  const readList = <T,>(value: unknown, reader: (input: unknown) => T | undefined): T[] => {
    if (!Array.isArray(value)) {
      malformed = true;
      return [];
    }
    const result: T[] = [];
    for (const item of value) {
      const parsed = reader(item);
      if (parsed === undefined) malformed = true;
      else result.push(parsed);
    }
    return result;
  };

  if (!('added' in payload) || !('updated' in payload) || !('deleted' in payload)) malformed = true;

  const added = readList(payload.added, readRuleSnapshot);
  const deleted = readList(payload.deleted, readRuleSnapshot);
  const updated = readList(payload.updated, (item) => {
    const record = toRecord(item);
    if (!record || typeof record.id !== 'number') return undefined;
    const before = readRuleSnapshot(record.before);
    const after = readRuleSnapshot(record.after);
    if (!before || !after) return undefined;
    return { id: record.id, before, after, changes: ruleChanges(before, after) };
  });

  const summary = `新增 ${added.length} 条、修改 ${updated.length} 条、删除 ${deleted.length} 条规则`;
  return {
    action: 'rules_synced',
    ruleDiff: { added, updated, deleted },
    summary,
    isMalformed: malformed,
    ...(malformed ? { fallbackText: '规则变更摘要格式不完整，已尽力展示可识别的内容。' } : {}),
  };
}

/**
 * 解析一条 AuditLog 的 `diff_summary`。
 *
 * @param rawDiff 后端 `diff_summary` 原值（对象、JSON 字符串或任意畸形输入）。
 * @param actionType 可选的后端 `action_type`；当 diff 内部缺少 `action` 时用于兜底判断。
 */
export function parseAuditDiff(rawDiff: unknown, actionType?: string): ParsedAuditDiff {
  const payload = toRecord(rawDiff);

  if (!payload) {
    return {
      action: 'unknown',
      summary: '无法识别的变更摘要',
      isMalformed: true,
      fallbackText: '变更摘要格式无法识别，无法展示详情。',
    };
  }

  const rawAction = (typeof payload.action === 'string' ? payload.action : actionType ?? '').trim().toLowerCase();
  if (rawAction === 'rules_seed_synced' || rawAction === 'seed_synced') return parseRulesSeedSynced(payload);

  const action = resolveAction(payload, actionType) ?? 'unknown';
  if (action === 'updated') return parseFlagUpdated(payload);
  if (action === 'toggled') return parseFlagToggled(payload);
  if (action === 'created') return parseFlagCreated(payload);
  if (action === 'rules_synced') return parseRulesSynced(payload);

  return {
    action: 'unknown',
    summary: '未识别的变更类型',
    isMalformed: true,
    fallbackText: '该变更类型暂不支持结构化展示。',
  };
}
