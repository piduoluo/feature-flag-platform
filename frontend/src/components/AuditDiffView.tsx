import React from 'react';
import { Alert, Card, Space, Tag, Typography } from 'antd';
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

/**
 * 审计日志的展示层共享模块。
 *
 * Ticket 08A（Flag 详情变更历史时间轴）与 Ticket 08B（全局操作历史展开行）
 * 共用同一套动作元数据与 Diff 渲染，避免两个页面对 `parseAuditDiff` 的
 * 返回值各自解释出不同结果。
 */

interface ActionMeta {
  label: string;
  color: string;
}

const ACTION_META: Record<string, ActionMeta> = {
  FLAG_CREATED: { label: '创建 Flag', color: 'green' },
  FLAG_UPDATED: { label: '修改基本信息', color: 'blue' },
  FLAG_TOGGLED: { label: '启停切换', color: 'orange' },
  RULES_SYNCED: { label: '规则批量同步', color: 'purple' },
  RULES_SEED_SYNCED: { label: '规则批量同步', color: 'purple' },
};

/** 后端 `action_type` → 表格/时间轴上的中文标签与颜色。 */
export function auditActionMeta(actionType: string): ActionMeta {
  return ACTION_META[actionType] ?? { label: actionType || '未知变更', color: 'gray' };
}

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
  if (value === '') return '（空）';
  return String(value);
}

function formatRuleField(field: RuleField, value: unknown): string {
  return field === 'expected_value' ? formatJson(value) : formatFlagValue(value);
}

const RuleSnapshotView: React.FC<{ rule: RuleSnapshot }> = ({ rule }) => (
  <Space wrap size={[8, 4]}>
    <Tag>优先级 {rule.priority}</Tag>
    <Typography.Text strong>{rule.attribute_name}</Typography.Text>
    <Tag color="blue">{rule.operator}</Tag>
    <Typography.Text code>{formatJson(rule.expected_value)}</Typography.Text>
    <Typography.Text type="secondary">命中返回值</Typography.Text>
    <Tag color={rule.return_value ? 'green' : 'red'}>{String(rule.return_value)}</Tag>
  </Space>
);

interface BeforeAfterRowProps {
  testId: string;
  label: string;
  before: unknown;
  after: unknown;
  format: (value: unknown) => string;
}

const BeforeAfterRow: React.FC<BeforeAfterRowProps> = ({ testId, label, before, after, format }) => (
  <div data-testid={testId} className="diff-change">
    <Space wrap size={[8, 4]}>
      <Tag>{label}</Tag>
      <Typography.Text delete type="danger" className="before">{format(before)}</Typography.Text>
      <Typography.Text type="secondary" className="arrow">→</Typography.Text>
      <Typography.Text strong type="success" className="after">{format(after)}</Typography.Text>
    </Space>
  </div>
);

const RuleDiffView: React.FC<{ diff: RuleDiff }> = ({ diff }) => {
  if (!diff.added.length && !diff.updated.length && !diff.deleted.length) {
    return <Typography.Text type="secondary" className="diff-summary">本次同步无规则增删改。</Typography.Text>;
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {diff.added.length > 0 && (
        <section className="diff-section">
          <Typography.Text strong className="diff-title">新增规则（{diff.added.length}）</Typography.Text>
          <Space direction="vertical" size="small" className="diff-rules" style={{ width: '100%', marginTop: 8 }}>
            {diff.added.map((rule, index) => (
              <Card key={rule.id ?? `added-${index}`} size="small" type="inner" className="diff-rule">
                <RuleSnapshotView rule={rule} />
              </Card>
            ))}
          </Space>
        </section>
      )}

      {diff.updated.length > 0 && (
        <section className="diff-section">
          <Typography.Text strong className="diff-title">修改规则（{diff.updated.length}）</Typography.Text>
          <Space direction="vertical" size="small" className="diff-rules" style={{ width: '100%', marginTop: 8 }}>
            {diff.updated.map(rule => (
              <Card key={rule.id} size="small" type="inner" title={`规则 #${rule.id}`} className="diff-rule">
                {rule.changes.length === 0 ? (
                  <Typography.Text type="secondary">字段内容未发生变化。</Typography.Text>
                ) : (
                  <div className="diff-changes">
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      {rule.changes.map(change => (
                        <BeforeAfterRow
                          key={change.field}
                          testId={`rule-change-${change.field}`}
                          label={RULE_FIELD_LABELS[change.field]}
                          before={change.before}
                          after={change.after}
                          format={value => formatRuleField(change.field, value)}
                        />
                      ))}
                    </Space>
                  </div>
                )}
              </Card>
            ))}
          </Space>
        </section>
      )}

      {diff.deleted.length > 0 && (
        <section className="diff-section">
          <Typography.Text strong className="diff-title">删除规则（{diff.deleted.length}）</Typography.Text>
          <Space direction="vertical" size="small" className="diff-rules" style={{ width: '100%', marginTop: 8 }}>
            {diff.deleted.map((rule, index) => (
              <Card key={rule.id ?? `deleted-${index}`} size="small" type="inner" className="diff-rule">
                <Space wrap size={[8, 4]}>
                  <Tag color="red">已删除</Tag>
                  <RuleSnapshotView rule={rule} />
                </Space>
              </Card>
            ))}
          </Space>
        </section>
      )}
    </Space>
  );
};

const FlagUpdateView: React.FC<{ diff: FlagUpdateDiff }> = ({ diff }) => {
  if (!diff.changes.length) {
    return <Typography.Text type="secondary" className="diff-summary">未检测到字段变化。</Typography.Text>;
  }
  return (
    <div className="diff-changes">
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        {diff.changes.map(change => (
          <BeforeAfterRow
            key={change.field}
            testId={`flag-change-${change.field}`}
            label={FLAG_FIELD_LABELS[change.field]}
            before={change.before}
            after={change.after}
            format={formatFlagValue}
          />
        ))}
      </Space>
    </div>
  );
};

const FlagToggleView: React.FC<{ diff: FlagToggleDiff }> = ({ diff }) => (
  <div className="diff-toggle">
    <Typography.Text strong data-testid="flag-toggle-diff">
      {`${diff.old_enabled ? '已启用' : '已停用'} → ${diff.new_enabled ? '已启用' : '已停用'}`}
    </Typography.Text>
  </div>
);

const FlagCreatedView: React.FC<{ diff: FlagCreatedDiff }> = ({ diff }) => {
  // A plain description list keeps label and value in one grid row. Using
  // <Descriptions column={1}> here made every label/value pair its own table
  // row, so long keys wrapped inside a ~24px cell.
  const rows = [
    diff.key === undefined ? null : { key: 'key', label: 'Flag Key', content: <Typography.Text code>{diff.key}</Typography.Text> },
    diff.name === undefined ? null : { key: 'name', label: '名称', content: diff.name },
    diff.description === undefined ? null : { key: 'description', label: '描述', content: formatFlagValue(diff.description) },
    diff.environment === undefined ? null : { key: 'environment', label: '环境', content: diff.environment },
    diff.default_value === undefined ? null : { key: 'default_value', label: '默认返回值', content: String(diff.default_value) },
    diff.enabled === undefined ? null : { key: 'enabled', label: '启停状态', content: diff.enabled ? '已启用' : '已停用' },
    diff.rule_count === undefined ? null : { key: 'rule_count', label: '初始规则数', content: String(diff.rule_count) },
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <dl className="diff-created">
      {rows.map(row => (
        <React.Fragment key={row.key}>
          <dt>{row.label}</dt>
          <dd>{row.content}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
};

/** 无结构化明细时的可读摘要（如种子同步、未知动作）。 */
const SummaryView: React.FC<{ diff: ParsedAuditDiff }> = ({ diff }) => (
  <Space direction="vertical" size={4} style={{ width: '100%' }} className="diff-summary">
    <Typography.Text type="secondary">{diff.summary}</Typography.Text>
    {diff.fallbackText && <Alert type="warning" showIcon message={diff.fallbackText} />}
  </Space>
);

/**
 * 渲染一条 `ParsedAuditDiff`。
 *
 * 只有对应动作的结构化字段存在时才展示明细；否则回退到 `summary`
 * （种子同步记录只有 `summary`/`ruleSeed`，必须走这条回退路径）。
 */
export const AuditDiffView: React.FC<{ diff: ParsedAuditDiff }> = ({ diff }) => {
  const warning = diff.isMalformed && diff.fallbackText
    ? <Alert type="warning" showIcon message={diff.fallbackText} style={{ marginBottom: 8 }} />
    : null;

  if (diff.action === 'rules_synced' && diff.ruleDiff) {
    return <>{warning}<RuleDiffView diff={diff.ruleDiff} /></>;
  }
  if (diff.action === 'updated' && diff.flagUpdate) {
    return <>{warning}<FlagUpdateView diff={diff.flagUpdate} /></>;
  }
  if (diff.action === 'toggled' && diff.flagToggle) {
    return <>{warning}<FlagToggleView diff={diff.flagToggle} /></>;
  }
  if (diff.action === 'created' && diff.flagCreated) {
    return <>{warning}<FlagCreatedView diff={diff.flagCreated} /></>;
  }
  return <SummaryView diff={diff} />;
};
