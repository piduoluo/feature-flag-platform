import React from 'react';
import { Alert } from 'antd';
import {
  FLAG_FIELD_LABELS,
  FlagCreatedDiff,
  FlagToggleDiff,
  FlagUpdateDiff,
  ParsedAuditDiff,
  RULE_FIELD_LABELS,
  RuleDiff,
  RuleField,
  RuleSnapshot,
} from '../utils/diffParser';
import { BooleanValueTag, EnvironmentBadge, StatusBadge } from './EnvironmentBadge';

/**
 * 审计日志的展示层共享模块。
 *
 * Ticket 08A（Flag 详情变更历史时间轴）与 Ticket 08B（全局操作历史展开行）
 * 共用同一套动作元数据与 Diff 渲染，保证统一视觉骨架与字段口径。
 */

export interface ActionMeta {
  label: string;
  color: string;
}

const ACTION_META: Record<string, ActionMeta> = {
  FLAG_CREATED: { label: '新建开关', color: 'gray' },
  FLAG_UPDATED: { label: '修改信息', color: 'gray' },
  FLAG_TOGGLED: { label: '启停', color: 'gray' },
  RULES_SYNCED: { label: '规则变更', color: 'gray' },
  RULES_SEED_SYNCED: { label: '规则变更', color: 'gray' },
};

/** 后端 `action_type` → 表格/时间轴上的中文标签与克制中性色。 */
export function auditActionMeta(actionType: string): ActionMeta {
  return ACTION_META[actionType] ?? { label: actionType || '未知变更', color: 'gray' };
}

/** 统一的操作类型标签组件：中性色文字 + 轻量低对比度浅灰背景与细边框。 */
export const AuditActionBadge: React.FC<{ actionType: string; className?: string }> = ({
  actionType,
  className,
}) => {
  const meta = auditActionMeta(actionType);
  return (
    <span className={`action-badge${className ? ` ${className}` : ''}`} data-action={actionType}>
      {meta.label}
    </span>
  );
};

/** 审计时间戳的展示格式；无法解析时原样返回。 */
export function formatAuditTime(value: string): string {
  if (!value) return '时间未知';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}

function formatJson(value: unknown): string {
  if (value === undefined) return '—';
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
}

function formatFlagValue(value: unknown): string {
  if (value === undefined) return '—';
  if (value === '') return '未设置';
  return String(value);
}

function renderFlagFieldValue(field: string, value: unknown): React.ReactNode {
  if (value === undefined) {
    return <span className="diff-empty-val">—</span>;
  }
  if (field === 'default_value' && typeof value === 'boolean') {
    return <BooleanValueTag value={value} />;
  }
  if (value === '') {
    return <span className="diff-empty-val">未设置</span>;
  }
  return String(value);
}

function renderRuleFieldValue(field: RuleField, value: unknown): React.ReactNode {
  if (value === undefined) {
    return <span className="diff-empty-val">—</span>;
  }
  if (field === 'return_value' && typeof value === 'boolean') {
    return <BooleanValueTag value={value} />;
  }
  if (field === 'operator') {
    return <span className="rule-op">{String(value)}</span>;
  }
  if (field === 'expected_value') {
    return <code className="rule-val">{formatJson(value)}</code>;
  }
  return formatFlagValue(value);
}

const RuleSnapshotView: React.FC<{ rule: RuleSnapshot }> = ({ rule }) => (
  <div className="diff-rule-inline">
    <span className="rule-priority-chip">优先级 {rule.priority}</span>
    <strong className="rule-attr">{rule.attribute_name}</strong>
    <span className="rule-op">{rule.operator}</span>
    <code className="rule-val">{formatJson(rule.expected_value)}</code>
    <span className="rule-return">
      命中返回值 <BooleanValueTag value={rule.return_value} />
    </span>
  </div>
);

interface DiffTableRowData {
  key: string;
  testId: string;
  label: string;
  before: React.ReactNode;
  after: React.ReactNode;
  srSummary?: string;
}

const DiffFieldTable: React.FC<{ rows: DiffTableRowData[]; compact?: boolean }> = ({ rows, compact }) => (
  <div className={`diff-table${compact ? ' diff-table--compact' : ''}`}>
    <div className="diff-table-head">
      <span>变更字段</span>
      <span>变更前</span>
      <span>变更后</span>
    </div>
    <div className="diff-table-body">
      {rows.map(row => (
        <div key={row.key} data-testid={row.testId} className="diff-table-row diff-change">
          <div className="diff-cell-field">{row.label}</div>
          <div className="diff-cell-before">
            <span className="before">{row.before}</span>
          </div>
          <div className="diff-cell-after">
            <span className="arrow" aria-hidden="true">→</span>
            <span className="after">{row.after}</span>
            {row.srSummary && <span className="sr-only">{row.srSummary}</span>}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const RuleDiffView: React.FC<{ diff: RuleDiff }> = ({ diff }) => {
  if (!diff.added.length && !diff.updated.length && !diff.deleted.length) {
    return <div className="diff-summary">本次同步无规则增删改。</div>;
  }

  return (
    <div className="diff-rule-groups">
      {diff.added.length > 0 && (
        <section className="diff-section">
          <div className="diff-group-header">
            <span className="diff-group-dot diff-group-dot--add" aria-hidden="true" />
            <span className="diff-title">新增规则（{diff.added.length}）</span>
          </div>
          <div className="diff-rules">
            {diff.added.map((rule, index) => (
              <div key={rule.id ?? `added-${index}`} className="diff-rule diff-rule--added">
                <RuleSnapshotView rule={rule} />
              </div>
            ))}
          </div>
        </section>
      )}

      {diff.updated.length > 0 && (
        <section className="diff-section">
          <div className="diff-group-header">
            <span className="diff-group-dot diff-group-dot--update" aria-hidden="true" />
            <span className="diff-title">修改规则（{diff.updated.length}）</span>
          </div>
          <div className="diff-rules">
            {diff.updated.map(rule => (
              <div key={rule.id} className="diff-rule diff-rule--updated">
                <div className="diff-rule-head">
                  <span className="diff-rule-id">规则 #{rule.id}</span>
                  <span className="diff-rule-context">
                    {rule.after.attribute_name} · 优先级 {rule.after.priority}
                  </span>
                </div>
                {rule.changes.length === 0 ? (
                  <div className="diff-summary">字段内容未发生变化。</div>
                ) : (
                  <DiffFieldTable
                    compact
                    rows={rule.changes.map(change => ({
                      key: change.field,
                      testId: `rule-change-${change.field}`,
                      label: RULE_FIELD_LABELS[change.field],
                      before: renderRuleFieldValue(change.field, change.before),
                      after: renderRuleFieldValue(change.field, change.after),
                    }))}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {diff.deleted.length > 0 && (
        <section className="diff-section">
          <div className="diff-group-header">
            <span className="diff-group-dot diff-group-dot--delete" aria-hidden="true" />
            <span className="diff-title">删除规则（{diff.deleted.length}）</span>
          </div>
          <div className="diff-rules">
            {diff.deleted.map((rule, index) => (
              <div key={rule.id ?? `deleted-${index}`} className="diff-rule diff-rule--deleted">
                <span className="diff-del-badge">已删除</span>
                <RuleSnapshotView rule={rule} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

const FlagUpdateView: React.FC<{ diff: FlagUpdateDiff }> = ({ diff }) => {
  if (!diff.changes.length) {
    return <div className="diff-summary">未检测到字段变化。</div>;
  }
  return (
    <DiffFieldTable
      rows={diff.changes.map(change => ({
        key: change.field,
        testId: `flag-change-${change.field}`,
        label: FLAG_FIELD_LABELS[change.field],
        before: renderFlagFieldValue(change.field, change.before),
        after: renderFlagFieldValue(change.field, change.after),
      }))}
    />
  );
};

const FlagToggleView: React.FC<{ diff: FlagToggleDiff }> = ({ diff }) => {
  const beforeLabel = diff.old_enabled ? '已启用' : '已停用';
  const afterLabel = diff.new_enabled ? '已启用' : '已停用';
  const flowSummary = `${beforeLabel} → ${afterLabel}`;
  return (
    <div className="diff-toggle">
      <DiffFieldTable
        rows={[
          {
            key: 'enabled',
            testId: 'flag-toggle-diff',
            label: '启停状态',
            before: <StatusBadge enabled={diff.old_enabled} />,
            after: <StatusBadge enabled={diff.new_enabled} />,
            srSummary: flowSummary,
          },
        ]}
      />
    </div>
  );
};

const FlagCreatedView: React.FC<{ diff: FlagCreatedDiff }> = ({ diff }) => {
  const rows: { key: string; label: string; value: React.ReactNode }[] = [
    {
      key: 'key',
      label: 'Flag Key',
      value: diff.key !== undefined && diff.key !== '' ? <code className="inline-code">{diff.key}</code> : <span className="diff-empty-val">—</span>,
    },
    {
      key: 'name',
      label: '名称',
      value: diff.name !== undefined && diff.name !== '' ? diff.name : <span className="diff-empty-val">—</span>,
    },
    {
      key: 'description',
      label: '描述',
      value:
        diff.description === undefined ? (
          <span className="diff-empty-val">—</span>
        ) : diff.description === '' ? (
          <span className="diff-empty-val">未设置</span>
        ) : (
          diff.description
        ),
    },
    {
      key: 'environment',
      label: '环境',
      value: diff.environment !== undefined ? <EnvironmentBadge environment={diff.environment} /> : <span className="diff-empty-val">—</span>,
    },
    {
      key: 'default_value',
      label: '默认返回值',
      value: diff.default_value !== undefined ? <BooleanValueTag value={diff.default_value} /> : <span className="diff-empty-val">—</span>,
    },
    {
      key: 'enabled',
      label: '启停状态',
      value: diff.enabled !== undefined ? <StatusBadge enabled={diff.enabled} /> : <span className="diff-empty-val">—</span>,
    },
    {
      key: 'rule_count',
      label: '初始规则数',
      value: diff.rule_count !== undefined ? String(diff.rule_count) : <span className="diff-empty-val">—</span>,
    },
  ];

  return (
    <dl className="diff-created">
      {rows.map(row => (
        <div key={row.key} className="diff-created-row" data-testid={`flag-created-${row.key}`}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
};

/** 无结构化明细时的可读摘要（如种子同步、未知动作）。 */
const SummaryView: React.FC<{ diff: ParsedAuditDiff }> = ({ diff }) => (
  <div className="diff-summary-block">
    <div className="diff-summary">{diff.summary}</div>
    {diff.fallbackText && <Alert type="warning" showIcon message={diff.fallbackText} style={{ marginTop: 8 }} />}
  </div>
);

/**
 * 渲染一条 `ParsedAuditDiff`。
 *
 * 统一使用浅色柔和骨架容器 `.audit-diff-panel`，内部按动作类型呈现结构化内容。
 */
export const AuditDiffView: React.FC<{ diff: ParsedAuditDiff }> = ({ diff }) => {
  const warning =
    diff.isMalformed && diff.fallbackText ? (
      <Alert type="warning" showIcon message={diff.fallbackText} style={{ marginBottom: 10 }} />
    ) : null;

  let content: React.ReactNode;
  if (diff.action === 'rules_synced' && diff.ruleDiff) {
    content = (
      <>
        {warning}
        <RuleDiffView diff={diff.ruleDiff} />
      </>
    );
  } else if (diff.action === 'updated' && diff.flagUpdate) {
    content = (
      <>
        {warning}
        <FlagUpdateView diff={diff.flagUpdate} />
      </>
    );
  } else if (diff.action === 'toggled' && diff.flagToggle) {
    content = (
      <>
        {warning}
        <FlagToggleView diff={diff.flagToggle} />
      </>
    );
  } else if (diff.action === 'created' && diff.flagCreated) {
    content = (
      <>
        {warning}
        <FlagCreatedView diff={diff.flagCreated} />
      </>
    );
  } else {
    content = <SummaryView diff={diff} />;
  }

  return <div className="audit-diff-panel">{content}</div>;
};
