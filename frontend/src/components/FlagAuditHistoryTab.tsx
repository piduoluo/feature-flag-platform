import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Descriptions, Empty, Space, Spin, Tag, Timeline, Typography } from 'antd';
import { api } from '../api/client';
import { AuditLog } from '../types';
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
  parseAuditDiff,
} from '../utils/diffParser';

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

function actionMeta(actionType: string): ActionMeta {
  return ACTION_META[actionType] ?? { label: actionType || '未知变更', color: 'gray' };
}

function formatTime(value: string): string {
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
  <div data-testid={testId}>
    <Space wrap size={[8, 4]}>
      <Tag>{label}</Tag>
      <Typography.Text delete type="danger">{format(before)}</Typography.Text>
      <Typography.Text type="secondary">→</Typography.Text>
      <Typography.Text strong type="success">{format(after)}</Typography.Text>
    </Space>
  </div>
);

const RuleDiffView: React.FC<{ diff: RuleDiff }> = ({ diff }) => {
  if (!diff.added.length && !diff.updated.length && !diff.deleted.length) {
    return <Typography.Text type="secondary">本次同步无规则增删改。</Typography.Text>;
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      {diff.added.length > 0 && (
        <section>
          <Typography.Text strong>新增规则（{diff.added.length}）</Typography.Text>
          <Space direction="vertical" size="small" style={{ width: '100%', marginTop: 8 }}>
            {diff.added.map((rule, index) => (
              <Card key={rule.id ?? `added-${index}`} size="small" type="inner">
                <RuleSnapshotView rule={rule} />
              </Card>
            ))}
          </Space>
        </section>
      )}

      {diff.updated.length > 0 && (
        <section>
          <Typography.Text strong>修改规则（{diff.updated.length}）</Typography.Text>
          <Space direction="vertical" size="small" style={{ width: '100%', marginTop: 8 }}>
            {diff.updated.map(rule => (
              <Card key={rule.id} size="small" type="inner" title={`规则 #${rule.id}`}>
                {rule.changes.length === 0 ? (
                  <Typography.Text type="secondary">字段内容未发生变化。</Typography.Text>
                ) : (
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
                )}
              </Card>
            ))}
          </Space>
        </section>
      )}

      {diff.deleted.length > 0 && (
        <section>
          <Typography.Text strong>删除规则（{diff.deleted.length}）</Typography.Text>
          <Space direction="vertical" size="small" style={{ width: '100%', marginTop: 8 }}>
            {diff.deleted.map((rule, index) => (
              <Card key={rule.id ?? `deleted-${index}`} size="small" type="inner">
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
    return <Typography.Text type="secondary">未检测到字段变化。</Typography.Text>;
  }
  return (
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
  );
};

const FlagToggleView: React.FC<{ diff: FlagToggleDiff }> = ({ diff }) => (
  <Typography.Text strong data-testid="flag-toggle-diff">
    {`${diff.old_enabled ? '已启用' : '已停用'} → ${diff.new_enabled ? '已启用' : '已停用'}`}
  </Typography.Text>
);

const FlagCreatedView: React.FC<{ diff: FlagCreatedDiff }> = ({ diff }) => {
  const items = [
    diff.key === undefined ? null : { key: 'key', label: 'Flag Key', children: <Typography.Text code>{diff.key}</Typography.Text> },
    diff.name === undefined ? null : { key: 'name', label: '名称', children: diff.name },
    diff.description === undefined ? null : { key: 'description', label: '描述', children: formatFlagValue(diff.description) },
    diff.environment === undefined ? null : { key: 'environment', label: '环境', children: diff.environment },
    diff.default_value === undefined ? null : { key: 'default_value', label: '默认返回值', children: String(diff.default_value) },
    diff.enabled === undefined ? null : { key: 'enabled', label: '启停状态', children: diff.enabled ? '已启用' : '已停用' },
    diff.rule_count === undefined ? null : { key: 'rule_count', label: '初始规则数', children: String(diff.rule_count) },
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  return <Descriptions size="small" column={1} items={items} />;
};

// 无结构化明细时的可读摘要（如种子同步、未知动作）。
const SummaryView: React.FC<{ diff: ParsedAuditDiff }> = ({ diff }) => (
  <Space direction="vertical" size={4} style={{ width: '100%' }}>
    <Typography.Text type="secondary">{diff.summary}</Typography.Text>
    {diff.fallbackText && <Alert type="warning" showIcon message={diff.fallbackText} />}
  </Space>
);

const DiffBody: React.FC<{ diff: ParsedAuditDiff }> = ({ diff }) => {
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

export const FlagAuditHistoryTab: React.FC<{ flagId: number }> = ({ flagId }) => {
  const [logs, setLogs] = useState<AuditLog[]>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.getAuditLogs(flagId)
      .then(data => {
        if (active) setLogs(Array.isArray(data) ? data : []);
      })
      .catch((err: unknown) => {
        if (active) {
          setLogs(undefined);
          setError(err instanceof Error ? err.message : '请稍后重试');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [flagId, reloadToken]);

  return (
    <div data-testid="flag-audit-history-tab">
      {loading ? (
        <Space>
          <Spin />
          <Typography.Text type="secondary">正在加载变更历史</Typography.Text>
        </Space>
      ) : error ? (
        <Alert
          type="error"
          showIcon
          message="变更历史加载失败"
          description={error}
          action={<Button size="small" onClick={() => setReloadToken(token => token + 1)}>重新加载</Button>}
        />
      ) : !logs || logs.length === 0 ? (
        <Empty description="暂无变更记录" />
      ) : (
        <div data-testid="audit-timeline">
          <Timeline
            items={logs.map(log => {
              const meta = actionMeta(log.action_type);
              return {
                color: meta.color,
                children: (
                  <Card size="small" data-testid={`audit-log-${log.id}`}>
                    <Space wrap size={[12, 4]}>
                      <Tag color={meta.color}>{meta.label}</Tag>
                      <Typography.Text>操作人：{log.operator || '未知操作人'}</Typography.Text>
                      <Typography.Text type="secondary">{formatTime(log.created_at)}</Typography.Text>
                    </Space>
                    <div style={{ marginTop: 8 }}>
                      <DiffBody diff={parseAuditDiff(log.diff_summary, log.action_type)} />
                    </div>
                  </Card>
                ),
              };
            })}
          />
        </div>
      )}
    </div>
  );
};
