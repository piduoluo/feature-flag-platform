import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Dropdown,
  Input,
  Segmented,
  Empty,
  Tooltip,
  Alert,
  Switch,
  Pagination,
  Skeleton,
  message,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  AppstoreOutlined,
  BarsOutlined,
  CopyOutlined,
  EllipsisOutlined,
} from '@ant-design/icons';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { Environment, Flag, FlagStats } from '../types';
import { api, ApiError } from '../api/client';
import { CreateFlagDrawer } from '../components/CreateFlagDrawer';
import { BooleanValueTag, ENV_FILTER_OPTIONS, EnvironmentBadge, StatusBadge } from '../components/EnvironmentBadge';
import { toast } from '../utils/toast';

const STATUS_FILTERS = [
  { key: 'all', label: '全部 Flag' },
  { key: 'enabled', label: '已启用' },
  { key: 'disabled', label: '已停用' },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]['key'];

interface FlagListPageProps {
  onNavigateToEval?: (flagKey: string, env: Environment) => void;
}

export const FlagListPage: React.FC<FlagListPageProps> = ({ onNavigateToEval }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const envParam = searchParams.get('environment');
  const selectedEnv =
    envParam === 'development' || envParam === 'staging' || envParam === 'production'
      ? envParam
      : 'all';
  const searchText = searchParams.get('search') || '';
  const enabledParam = searchParams.get('enabled');
  const statusFilter: StatusFilter =
    enabledParam === 'true' ? 'enabled' : enabledParam === 'false' ? 'disabled' : 'all';
  const pageParam = Number(searchParams.get('page'));
  const currentPage = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const sizeParam = Number(searchParams.get('page_size'));
  const pageSize = [12, 24, 48].includes(sizeParam) ? sizeParam : 12;

  const [searchInput, setSearchInput] = useState(searchText);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<FlagStats>({ all: 0, enabled: 0, disabled: 0 });
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // View preference is local presentation state; list contents remain server-owned.
  const [viewMode, setViewModeState] = useState<'list' | 'grid'>(() => {
    try {
      const saved = localStorage.getItem('flag_list_view_mode');
      if (saved === 'grid' || saved === 'list') return saved;
    } catch {
      // ignore
    }
    return 'list';
  });

  const setViewMode = (mode: 'list' | 'grid') => {
    setViewModeState(mode);
    try {
      localStorage.setItem('flag_list_view_mode', mode);
    } catch {
      // ignore
    }
  };
  useEffect(() => {
    setSearchInput(searchText);
  }, [searchText]);

  const handleEnvChange = (newEnv: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (newEnv && newEnv !== 'all') {
      nextParams.set('environment', newEnv);
    } else {
      nextParams.delete('environment');
    }
    nextParams.delete('page');
    setSearchParams(nextParams, { replace: true });
  };

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    const nextParams = new URLSearchParams(searchParams);
    const trimmed = value.trim();
    if (trimmed) {
      nextParams.set('search', trimmed);
    } else {
      nextParams.delete('search');
    }
    nextParams.delete('page');
    setSearchParams(nextParams, { replace: true });
  };

  const handleStatusChange = (next: StatusFilter) => {
    if (next === statusFilter) return;
    const nextParams = new URLSearchParams(searchParams);
    if (next === 'all') {
      nextParams.delete('enabled');
    } else {
      nextParams.set('enabled', String(next === 'enabled'));
    }
    nextParams.delete('page');
    setSearchParams(nextParams, { replace: true });
  };

  const handlePageChange = (page: number, size: number) => {
    const nextParams = new URLSearchParams(searchParams);
    const nextSize = [12, 24, 48].includes(size) ? size : pageSize;
    if (nextSize !== 12) {
      nextParams.set('page_size', String(nextSize));
    } else {
      nextParams.delete('page_size');
    }
    const nextPage = nextSize !== pageSize ? 1 : page;
    if (nextPage > 1) {
      nextParams.set('page', String(nextPage));
    } else {
      nextParams.delete('page');
    }
    setSearchParams(nextParams, { replace: true });
  };

  const openFlagDetail = (flagId: number, tab?: 'settings' | 'audit') => {
    navigate(`/flags/${flagId}${tab ? `?tab=${tab}` : ''}`, {
      state: {
        from: `${location.pathname}${location.search}`,
        fromLabel: '功能开关',
      },
    });
  };

  const openEvaluation = (record: Flag) => {
    if (onNavigateToEval) {
      onNavigateToEval(record.key, record.environment);
    } else {
      navigate(
        `/evaluations?flag_key=${encodeURIComponent(record.key)}&environment=${record.environment}&flag_id=${record.id}`
      );
    }
  };

  const handleInlineToggle = async (record: Flag, checked: boolean) => {
    setTogglingId(record.id);
    try {
      const updated = await api.toggleFlag(record.id, checked);
      message.success(`Flag [${record.key}] 已${checked ? '启用' : '停用'}`);

      if (updated.enabled !== record.enabled) {
        const delta = updated.enabled ? 1 : -1;
        setStats((prev) => ({
          ...prev,
          enabled: prev.enabled + delta,
          disabled: prev.disabled - delta,
        }));
      }

      if (statusFilter !== 'all' && updated.enabled !== (statusFilter === 'enabled')) {
        // The row no longer matches the active status filter.
        setFlags((prev) => prev.filter((f) => f.id !== updated.id));
        setTotal((prev) => Math.max(0, prev - 1));
      } else {
        setFlags((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '切换启停状态失败';
      message.error(msg);
    } finally {
      setTogglingId(null);
    }
  };

  const fetchFlags = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const result = await api.getFlags({
        environment: selectedEnv === 'all' ? undefined : (selectedEnv as Environment),
        search: searchText.trim() || undefined,
        enabled: statusFilter === 'all' ? undefined : statusFilter === 'enabled',
        page: currentPage,
        page_size: pageSize,
      });
      setFlags(result.items || []);
      setTotal(result.total || 0);
      setStats(result.stats);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '获取 Feature Flag 列表失败';
      setFetchError(msg);
      console.error('Failed to load flags:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedEnv, searchText, statusFilter, currentPage, pageSize]);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const copyKey = async (key: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(key);
      toast(`已复制 Flag Key: ${key}`, 'success');
    } catch {
      toast('复制失败，请手动复制 Flag Key', 'error');
    }
  };

  const formatDateTime = (timeStr: string) => {
    try {
      const d = new Date(timeStr);
      const datePart = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
      const timePart = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return { datePart, timePart };
    } catch {
      return { datePart: timeStr, timePart: '' };
    }
  };

  const columns: ColumnsType<Flag> = [
    {
      title: 'Flag 信息',
      key: 'flag_info',
      width: '34%',
      render: (_, record) => (
        <div className="flag-info">
          <div className="flag-info-name" title={record.name}>{record.name}</div>
          <div className="flag-info-key">
            <span className="key-text" title={record.key}>{record.key}</span>
            <button
              type="button"
              className="copy-mini"
              aria-label="复制 Key"
              data-tip="复制 Flag Key"
              onClick={(e) => copyKey(record.key, e)}
            >
              <CopyOutlined />
            </button>
          </div>
        </div>
      ),
    },
    {
      title: '运行环境',
      dataIndex: 'environment',
      key: 'environment',
      width: '13%',
      render: (env: Environment) => <EnvironmentBadge environment={env} />,
    },
    {
      title: '启停状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: '12%',
      render: (enabled: boolean) => <StatusBadge enabled={enabled} />,
    },
    {
      title: '默认返回值',
      dataIndex: 'default_value',
      key: 'default_value',
      width: '12%',
      render: (val: boolean) => <BooleanValueTag value={val} />,
    },
    {
      title: '最近更新',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: '17%',
      render: (timeStr: string) => {
        const { datePart, timePart } = formatDateTime(timeStr);
        return <span className="flag-updated-at">{datePart} {timePart}</span>;
      },
    },
    {
      title: <span className="sr-only">启停控制</span>,
      key: 'toggle',
      className: 'flag-toggle-cell',
      align: 'center',
      width: '7%',
      render: (_, record) => (
        <Tooltip title={record.enabled ? '点击停用' : '点击启用'}>
          <Switch
            checked={record.enabled}
            loading={togglingId === record.id}
            disabled={togglingId === record.id}
            onChange={(checked) => handleInlineToggle(record, checked)}
          />
        </Tooltip>
      ),
    },
    {
      title: <span className="sr-only">更多操作</span>,
      key: 'more',
      className: 'flag-more-cell',
      align: 'right',
      width: '5%',
      render: (_, record) => (
        <Dropdown
          trigger={['click']}
          placement="bottomRight"
          overlayClassName="flag-more-menu"
          menu={{
            items: [
              { key: 'detail', label: '查看详情' },
              { key: 'edit', label: '编辑Flag' },
              { key: 'evaluate', label: '在线评估' },
              { key: 'audit', label: '查看操作历史' },
            ],
            onClick: ({ key, domEvent }) => {
              domEvent.stopPropagation();
              if (key === 'detail') openFlagDetail(record.id);
              if (key === 'edit') openFlagDetail(record.id, 'settings');
              if (key === 'evaluate') openEvaluation(record);
              if (key === 'audit') openFlagDetail(record.id, 'audit');
            },
          }}
        >
          <Button
            type="text"
            className="flag-more-button"
            icon={<EllipsisOutlined />}
            aria-label={`更多操作：${record.name}`}
            onClick={(event) => event.stopPropagation()}
          />
        </Dropdown>
      ),
    },
  ];

  return (
    <div className="flag-console">
      <section className="flag-console-panel" aria-label="功能开关列表">
        {fetchError && (
          <Alert
            type="error"
            showIcon
            message={fetchError}
            style={{ marginBottom: 16 }}
            closable
            onClose={() => setFetchError(null)}
          />
        )}

        {/* Environment first, followed by the full-width search and actions. */}
        <div className="toolbar flag-toolbar">
          <div className="toolbar-left flag-toolbar-env">
            <Segmented
              value={selectedEnv}
              onChange={(val) => handleEnvChange(val as string)}
              options={ENV_FILTER_OPTIONS}
            />
          </div>

          <div className="toolbar-right flag-toolbar-actions">
            <Input
              className="flag-search"
              placeholder="搜索 Flag Key 或名称..."
              allowClear
              prefix={<SearchOutlined />}
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
            />

            <div className="view-toggle-group" role="group" aria-label="切换视图">
              <button
                type="button"
                className="icon-btn"
                aria-label="宫格视图"
                aria-pressed={viewMode === 'grid'}
                onClick={() => setViewMode('grid')}
              >
                <AppstoreOutlined />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="列表视图"
                aria-pressed={viewMode === 'list'}
                onClick={() => setViewMode('list')}
              >
                <BarsOutlined />
              </button>
            </div>

            <Tooltip title="刷新列表">
              <Button
                icon={<ReloadOutlined />}
                aria-label="刷新列表"
                onClick={() => fetchFlags()}
                loading={loading}
              />
            </Tooltip>

            <Button
              type="primary"
              icon={<PlusOutlined />}
              className="flag-create-btn"
              onClick={() => setCreateDrawerOpen(true)}
            >
              新建 Flag
            </Button>
          </div>
        </div>

        <div className="flag-results-bar">
          <div className="flag-stats" role="group" aria-label="Flag 状态统计">
            {STATUS_FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`flag-stat${statusFilter === item.key ? ' active' : ''}`}
                aria-pressed={statusFilter === item.key}
                onClick={() => handleStatusChange(item.key)}
              >
                <span className="flag-stat-label">{item.label}</span>
                <span className="flag-stat-value">{stats[item.key]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Content: List (Table) vs Grid */}
        {viewMode === 'grid' ? (
          <div>
            {loading && flags.length === 0 ? (
              <div className="flag-grid" aria-label="Flag 宫格视图" aria-busy="true">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div className="flag-card flag-card--skeleton" key={index} aria-hidden="true">
                    <Skeleton active title={{ width: '46%' }} paragraph={{ rows: 1, width: ['64%'] }} />
                  </div>
                ))}
              </div>
            ) : flags.length > 0 ? (
              <>
                <div
                  className={`flag-grid${loading ? ' is-loading' : ''}`}
                  aria-label="Flag 宫格视图"
                  aria-busy={loading}
                >
                  {flags.map((flag) => (
                    <article
                      key={flag.id}
                      className="flag-card"
                      role="article"
                      tabIndex={0}
                      aria-label={`${flag.name} ${flag.key}`}
                      onClick={() => openFlagDetail(flag.id)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openFlagDetail(flag.id);
                        }
                      }}
                    >
                      <div className="flag-card-head">
                        <div className="flag-card-name" title={flag.name}>
                          {flag.name}
                        </div>
                        <div
                          className="flag-card-switch"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <Tooltip title={flag.enabled ? '点击停用' : '点击启用'}>
                            <Switch
                              checked={flag.enabled}
                              loading={togglingId === flag.id}
                              disabled={togglingId === flag.id}
                              onChange={(checked) => handleInlineToggle(flag, checked)}
                            />
                          </Tooltip>
                        </div>
                      </div>

                      <div className="flag-card-keyline">
                        <span className="flag-card-key" title={flag.key}>
                          {flag.key}
                        </span>
                        <button
                          type="button"
                          className="flag-card-copy"
                          aria-label="复制 Key"
                          title="复制 Key"
                          onClick={(event) => copyKey(flag.key, event)}
                        >
                          <CopyOutlined />
                        </button>
                      </div>

                      <div className="flag-card-rule" aria-hidden="true" />

                      <div className="flag-card-meta">
                        <EnvironmentBadge environment={flag.environment} />
                        <StatusBadge enabled={flag.enabled} />
                        <span className="flag-card-default">
                          默认返回值： <code>{flag.default_value ? 'true' : 'false'}</code>
                        </span>
                        <span className="flag-card-updated">
                          更新于 {formatDateTime(flag.updated_at).datePart}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
            </>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  searchText || selectedEnv !== 'all' || statusFilter !== 'all'
                    ? '没有匹配当前筛选条件的 Feature Flag'
                    : '当前环境暂无 Feature Flag，点击右上角“新建 Flag”开启配置'
                }
              />
            )}
          </div>
        ) : (
          <Table<Flag>
            className="flag-list-table"
            rowKey="id"
            columns={columns}
            tableLayout="fixed"
            scroll={{ x: 1040 }}
            dataSource={flags}
            loading={loading}
            onRow={(record) => ({
              onClick: (event) => {
                const target = event.target as HTMLElement;
                if (
                  target.closest('button') ||
                  target.closest('.ant-switch') ||
                  target.closest('a') ||
                  target.closest('.ant-typography-copy') ||
                  target.closest('.copy-mini')
                ) {
                  return;
                }
                openFlagDetail(record.id);
              },
              style: { cursor: 'pointer' },
            })}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    searchText || selectedEnv !== 'all' || statusFilter !== 'all'
                      ? '没有匹配当前筛选条件的 Feature Flag'
                      : '当前环境暂无 Feature Flag，点击右上角“新建 Flag”开启配置'
                  }
                />
              ),
            }}
            pagination={false}
          />
        )}

        {total > 0 && (
          <Pagination
            className="flag-pagination"
            current={currentPage}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            pageSizeOptions={['12', '24', '48']}
            onChange={handlePageChange}
          />
        )}
      </section>

      <CreateFlagDrawer
        open={createDrawerOpen}
        onClose={() => setCreateDrawerOpen(false)}
        initialEnvironment={selectedEnv === 'all' ? 'development' : (selectedEnv as Environment)}
        onSuccess={() => {
          fetchFlags();
        }}
      />
    </div>
  );
};
