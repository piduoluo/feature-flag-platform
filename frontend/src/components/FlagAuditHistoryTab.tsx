import React, { useEffect, useState } from 'react';
import { Alert, Button, Empty, Space, Spin, Timeline, Typography } from 'antd';
import { api } from '../api/client';
import { AuditLog } from '../types';
import { parseAuditDiff } from '../utils/diffParser';
import { AuditActionBadge, AuditDiffView, formatAuditTime } from './AuditDiffView';

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
        <div data-testid="audit-timeline" className="audit-timeline-wrap">
          <Timeline
            items={logs.map(log => ({
              color: 'gray',
              children: (
                <div className="tl-card" data-testid={`audit-log-${log.id}`}>
                  <div className="tl-meta">
                    <AuditActionBadge actionType={log.action_type} />
                    <span className="operator">操作人：{log.operator || '未知操作人'}</span>
                    <span className="time">{formatAuditTime(log.created_at)}</span>
                  </div>
                  <div className="tl-body">
                    <AuditDiffView diff={parseAuditDiff(log.diff_summary, log.action_type)} />
                  </div>
                </div>
              ),
            }))}
          />
        </div>
      )}
    </div>
  );
};
