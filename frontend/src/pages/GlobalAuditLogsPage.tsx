import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Input, Select, Space, Spin, Table, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../api/client';
import { AuditActionType, AuditLog, Environment } from '../types';
import { parseAuditDiff } from '../utils/diffParser';
import { AuditActionBadge, AuditDiffView, auditActionMeta, formatAuditTime } from '../components/AuditDiffView';
import { ENV_SELECT_OPTIONS, EnvironmentBadge } from '../components/EnvironmentBadge';

const { Text } = Typography;

const ACTION_TYPES: AuditActionType[] = ['FLAG_CREATED', 'FLAG_UPDATED', 'FLAG_TOGGLED', 'RULES_SYNCED'];

// 筛选下拉与表格动作标签共用 auditActionMeta，避免同一套文案两处维护。
const ACTION_OPTIONS: { value: AuditActionType; label: string }[] = ACTION_TYPES
  .map(value => ({ value, label: auditActionMeta(value).label }));

export const GlobalAuditLogsPage: React.FC = () => {
  const location = useLocation();
  const [environment, setEnvironment] = useState<Environment>();
  const [actionType, setActionType] = useState<AuditActionType>();
  const [flagKeyInput, setFlagKeyInput] = useState('');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const flagKey = flagKeyInput.trim();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.getGlobalAuditLogs({
      page,
      page_size: pageSize,
      environment,
      flag_key: flagKey || undefined,
      action_type: actionType,
    })
      .then(result => {
        if (!active) return;
        setLogs(Array.isArray(result.items) ? result.items : []);
        setTotal(Number(result.total) || 0);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLogs([]);
        setTotal(0);
        setError(err instanceof Error ? err.message : '请稍后重试');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [page, pageSize, environment, actionType, flagKey, reloadToken]);

  const columns: ColumnsType<AuditLog> = [
    {
      title: 'Flag Key',
      dataIndex: 'flag_key',
      key: 'flag_key',
      width: 220,
      render: (value: string, record) => (
        <Link
          to={`/flags/${record.flag_id}?tab=audit`}
          className="audit-key"
          state={{
            from: `${location.pathname}${location.search}`,
            fromLabel: '全局操作历史',
          }}
        >
          <code className="inline-code">{value}</code>
        </Link>
      ),
    },
    {
      title: '环境',
      dataIndex: 'environment',
      key: 'environment',
      width: 140,
      render: (value: string) => <EnvironmentBadge environment={value} />,
    },
    {
      title: '动作',
      dataIndex: 'action_type',
      key: 'action_type',
      width: 150,
      render: (value: string) => <AuditActionBadge actionType={value} />,
    },
    {
      title: '操作人',
      dataIndex: 'operator',
      key: 'operator',
      width: 160,
      render: (value: string) => value || '未知操作人',
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 190,
      render: (value: string) => <span className="audit-muted">{formatAuditTime(value)}</span>,
    },
  ];

  return (
    <div data-testid="global-audit-logs-page" style={{ maxWidth: 1400, margin: '0 auto' }}>
      <Card
        variant="borderless"
        style={{
          borderRadius: 9,
          border: '1px solid var(--line, #ebe8e4)',
          boxShadow: 'var(--shadow, 0 1px 2px rgba(24, 20, 17, .03))',
        }}
      >
        <Space wrap size={[12, 12]} style={{ marginBottom: 16 }}>
          <Select<Environment>
            aria-label="环境筛选"
            allowClear
            placeholder="全部环境"
            style={{ width: 160 }}
            value={environment}
            options={ENV_SELECT_OPTIONS}
            onChange={(value) => { setEnvironment(value); setPage(1); }}
          />
          <Select<AuditActionType>
            aria-label="操作类型筛选"
            allowClear
            placeholder="全部操作类型"
            style={{ width: 180 }}
            value={actionType}
            options={ACTION_OPTIONS}
            onChange={(value) => { setActionType(value); setPage(1); }}
          />
          <Input
            aria-label="Flag Key 搜索"
            placeholder="按 Flag Key 搜索..."
            allowClear
            prefix={<SearchOutlined />}
            style={{ width: 260 }}
            value={flagKeyInput}
            onChange={(event) => { setFlagKeyInput(event.target.value); setPage(1); }}
          />
        </Space>

        <div>
          {error ? (
            <Alert
              type="error"
              showIcon
              message="全局审计日志加载失败"
              description={error}
              action={
                <Button size="small" onClick={() => setReloadToken(token => token + 1)}>
                  重新加载
                </Button>
              }
            />
          ) : loading && logs.length === 0 ? (
            <Space data-testid="audit-loading">
              <Spin />
              <Text type="secondary">正在加载全局审计日志…</Text>
            </Space>
          ) : (
            <Table<AuditLog>
              rowKey="id"
              className="audit-log-table"
              columns={columns}
              tableLayout="fixed"
              scroll={{ x: 900 }}
              dataSource={logs}
              loading={loading}
              expandable={{
                expandIcon: ({ expanded, onExpand, record }) => (
                  <button
                    type="button"
                    className={`expand-btn ${expanded ? 'open' : ''}`}
                    aria-label={expanded ? 'Collapse row' : 'Expand row'}
                    onClick={(e) => onExpand(record, e)}
                  >
                    {expanded ? '−' : '+'}
                  </button>
                ),
                expandedRowClassName: () => 'audit-detail-row',
                expandedRowRender: (record) => (
                  <div data-testid={`audit-diff-${record.id}`} className="audit-detail">
                    <AuditDiffView diff={parseAuditDiff(record.diff_summary, record.action_type)} />
                  </div>
                ),
              }}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      environment || actionType || flagKey
                        ? '没有匹配当前筛选条件的审计记录'
                        : '暂无审计记录'
                    }
                  />
                ),
              }}
              pagination={{
                current: page,
                pageSize,
                total,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50'],
                showTotal: (totalCount) => `共 ${totalCount} 条记录`,
                onChange: (nextPage, nextPageSize) => {
                  setPage(nextPageSize === pageSize ? nextPage : 1);
                  setPageSize(nextPageSize);
                },
              }}
            />
          )}
        </div>
      </Card>
    </div>
  );
};
