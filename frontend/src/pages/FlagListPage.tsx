import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Table,
  Button,
  Input,
  Segmented,
  Space,
  Card,
  Typography,
  Empty,
  Tooltip,
  Alert,
  Switch,
  Pagination,
  message,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  AppstoreOutlined,
  BarsOutlined,
  FilterOutlined,
  CheckOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { Environment, Flag } from '../types';
import { api, ApiError } from '../api/client';
import { CreateFlagDrawer } from '../components/CreateFlagDrawer';
import { BooleanValueTag, ENV_FILTER_OPTIONS, EnvironmentBadge, StatusBadge } from '../components/EnvironmentBadge';
import { toast } from '../utils/toast';

interface FlagListPageProps {
  onNavigateToEval?: (flagKey: string, env: Environment) => void;
}

export const FlagListPage: React.FC<FlagListPageProps> = ({ onNavigateToEval }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const envParam = searchParams.get('environment');
  const selectedEnv =
    envParam === 'development' || envParam === 'staging' || envParam === 'production'
      ? envParam
      : 'all';
  const searchText = searchParams.get('search') || '';

  const [searchInput, setSearchInput] = useState(searchText);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Prototype additions: View toggle & Status filter
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchInput(searchText);
  }, [searchText]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setStatusMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleEnvChange = (newEnv: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (newEnv && newEnv !== 'all') {
      nextParams.set('environment', newEnv);
    } else {
      nextParams.delete('environment');
    }
    setCurrentPage(1);
    setSearchParams(nextParams);
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
    setCurrentPage(1);
    setSearchParams(nextParams, { replace: true });
  };

  const handleInlineToggle = async (record: Flag, checked: boolean) => {
    setTogglingId(record.id);
    try {
      const updated = await api.toggleFlag(record.id, checked);
      message.success(`Flag [${record.key}] 已${checked ? '启用' : '停用'}`);
      setFlags((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
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
        page: currentPage,
        page_size: pageSize,
      });
      setFlags(result.items || []);
      setTotal(result.total || 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '获取 Feature Flag 列表失败';
      setFetchError(msg);
      console.error('Failed to load flags:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedEnv, searchText, currentPage, pageSize]);

  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  const copyKey = (key: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(key).catch(() => {});
    }
    toast(`已复制 Flag Key: ${key}`, 'success');
  };

  const displayedFlags = useMemo(() => {
    if (statusFilter === 'all') return flags;
    return flags.filter((f) => (statusFilter === 'enabled' ? f.enabled : !f.enabled));
  }, [flags, statusFilter]);

  const formatDateTime = (timeStr: string) => {
    try {
      const d = new Date(timeStr);
      const datePart = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
      const timePart = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      return { datePart, timePart };
    } catch {
      return { datePart: timeStr, timePart: '' };
    }
  };

  const columns: ColumnsType<Flag> = [
    {
      title: 'Flag Key',
      dataIndex: 'key',
      key: 'key',
      width: 190,
      render: (key: string) => (
        <span className="code-chip">
          <span className="key-text">{key}</span>
          <button
            type="button"
            className="copy-mini"
            aria-label="复制 Key"
            data-tip="复制 Flag Key"
            onClick={(e) => copyKey(key, e)}
          >
            <CopyOutlined />
          </button>
        </span>
      ),
    },
    {
      title: '名称与描述',
      key: 'name_desc',
      width: 170,
      render: (_, record) => (
        <div>
          <div className="flag-name" style={{ fontWeight: 600, fontSize: 13.5, color: '#171717' }}>
            {record.name}
          </div>
          {record.description ? (
            <div
              className="flag-desc"
              title={record.description}
              style={{
                fontSize: 12,
                color: '#847e78',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 200,
              }}
            >
              {record.description}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#aaa49f' }}>暂无描述</div>
          )}
        </div>
      ),
    },
    {
      title: '运行环境',
      dataIndex: 'environment',
      key: 'environment',
      width: 120,
      render: (env: Environment) => <EnvironmentBadge environment={env} />,
    },
    {
      title: '启停状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (enabled: boolean) => <StatusBadge enabled={enabled} />,
    },
    {
      title: '默认返回值',
      dataIndex: 'default_value',
      key: 'default_value',
      width: 110,
      render: (val: boolean) => <BooleanValueTag value={val} />,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 125,
      render: (timeStr: string) => {
        const { datePart, timePart } = formatDateTime(timeStr);
        return (
          <div style={{ fontSize: 12, lineHeight: 1.3 }}>
            <div>{datePart}</div>
            <div style={{ color: '#8a8580', fontSize: 11 }}>{timePart}</div>
          </div>
        );
      },
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 125,
      render: (timeStr: string) => {
        const { datePart, timePart } = formatDateTime(timeStr);
        return (
          <div style={{ fontSize: 12, lineHeight: 1.3 }}>
            <div>{datePart}</div>
            <div style={{ color: '#8a8580', fontSize: 11 }}>{timePart}</div>
          </div>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      render: (_, record) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<SettingOutlined />}
            onClick={() => navigate(`/flags/${record.id}`)}
          >
            详情
          </Button>
          <Button
            type="link"
            size="small"
            icon={<ThunderboltOutlined />}
            onClick={() => {
              if (onNavigateToEval) {
                onNavigateToEval(record.key, record.environment);
              } else {
                navigate(
                  `/evaluations?flag_key=${encodeURIComponent(record.key)}&environment=${record.environment}&flag_id=${record.id}`
                );
              }
            }}
          >
            在线评估
          </Button>
          <Tooltip title={record.enabled ? '点击停用' : '点击启用'}>
            <Switch
              size="small"
              checked={record.enabled}
              loading={togglingId === record.id}
              disabled={togglingId === record.id}
              onChange={(checked) => handleInlineToggle(record, checked)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <Card
        variant="borderless"
        style={{
          boxShadow: 'var(--shadow, 0 1px 2px rgba(24, 20, 17, .03))',
          borderRadius: 9,
          border: '1px solid var(--line, #ebe8e4)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div>
            <Typography.Title level={4} style={{ margin: 0, fontWeight: 650 }}>
              Feature Flag 特性开关管理
            </Typography.Title>
          </div>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateDrawerOpen(true)}
            size="large"
            style={{
              background: 'var(--brand, #ff7d41)',
              borderColor: 'var(--brand, #ff7d41)',
              fontWeight: 600,
            }}
          >
            新建 Flag
          </Button>
        </div>

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

        {/* Toolbar: Environment filter, Search, Status filter, View toggle, Refresh */}
        <div
          className="toolbar"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div className="toolbar-left" style={{ maxWidth: '100%', overflowX: 'auto' }}>
            <Segmented
              value={selectedEnv}
              onChange={(val) => handleEnvChange(val as string)}
              options={ENV_FILTER_OPTIONS}
            />
          </div>

          <div className="toolbar-right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Input.Search
              placeholder="按 Key 或名称搜索..."
              allowClear
              enterButton={<SearchOutlined />}
              style={{ width: 260 }}
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              onSearch={(value) => handleSearchChange(value)}
            />

            {/* Status Filter Dropdown */}
            <div className="filter-wrap" ref={statusMenuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className={`icon-btn ${statusFilter !== 'all' ? 'has-filter' : ''}`}
                aria-label="筛选启停状态"
                aria-haspopup="menu"
                aria-expanded={statusMenuOpen}
                data-tip="筛选启停状态"
                onClick={() => setStatusMenuOpen(!statusMenuOpen)}
              >
                <FilterOutlined />
              </button>

              {statusMenuOpen && (
                <div className="menu-pop open" role="menu" style={{ right: 0, top: 'calc(100% + 6px)' }}>
                  <div className="menu-label">启停状态</div>
                  <button
                    type="button"
                    className={`menu-opt ${statusFilter === 'all' ? 'active' : ''}`}
                    role="menuitemradio"
                    aria-checked={statusFilter === 'all'}
                    onClick={() => {
                      setStatusFilter('all');
                      setStatusMenuOpen(false);
                    }}
                  >
                    <span>全部状态</span>
                    <span className="check"><CheckOutlined /></span>
                  </button>
                  <button
                    type="button"
                    className={`menu-opt ${statusFilter === 'enabled' ? 'active' : ''}`}
                    role="menuitemradio"
                    aria-checked={statusFilter === 'enabled'}
                    onClick={() => {
                      setStatusFilter('enabled');
                      setStatusMenuOpen(false);
                    }}
                  >
                    <span>已启用</span>
                    <span className="check"><CheckOutlined /></span>
                  </button>
                  <button
                    type="button"
                    className={`menu-opt ${statusFilter === 'disabled' ? 'active' : ''}`}
                    role="menuitemradio"
                    aria-checked={statusFilter === 'disabled'}
                    onClick={() => {
                      setStatusFilter('disabled');
                      setStatusMenuOpen(false);
                    }}
                  >
                    <span>已停用</span>
                    <span className="check"><CheckOutlined /></span>
                  </button>
                </div>
              )}
            </div>

            {/* View Toggle */}
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
                onClick={() => fetchFlags()}
                loading={loading}
              />
            </Tooltip>
          </div>
        </div>

        {/* Content: List (Table) vs Grid */}
        {viewMode === 'grid' ? (
          <div>
            {displayedFlags.length > 0 ? (
              <>
                <div className="flag-grid" aria-label="Flag 宫格视图">
                {displayedFlags.map((flag) => (
                  <article
                    key={flag.id}
                    className="flag-card"
                    role="article"
                    tabIndex={0}
                    onClick={() => navigate(`/flags/${flag.id}`)}
                  >
                    <div className="flag-card-top">
                      <span className="flag-card-mark" aria-hidden="true">
                        <svg className="i" viewBox="0 0 24 24">
                          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1v12Z" />
                          <path d="M4 22v-7" />
                        </svg>
                      </span>
                      <div className="flag-card-key" onClick={(e) => e.stopPropagation()}>
                        <span className="code-chip">
                          <span className="key-text">{flag.key}</span>
                          <button
                            type="button"
                            className="copy-mini"
                            aria-label="复制 Key"
                            onClick={(e) => copyKey(flag.key, e)}
                          >
                            <CopyOutlined />
                          </button>
                        </span>
                      </div>
                      <button
                        type="button"
                        className="icon-btn ghost sm"
                        aria-label="在线评估"
                        data-tip="在线评估"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(
                            `/evaluations?flag_key=${encodeURIComponent(flag.key)}&environment=${flag.environment}&flag_id=${flag.id}`
                          );
                        }}
                        style={{ marginLeft: 'auto' }}
                      >
                        <ThunderboltOutlined />
                      </button>
                    </div>

                    <div className="flag-card-name" style={{ fontWeight: 600, fontSize: 14, margin: '8px 0 4px' }}>
                      {flag.name}
                    </div>

                    <div
                      className="flag-card-desc"
                      style={{ fontSize: 12, color: '#847e78', minHeight: 36, marginBottom: 10 }}
                    >
                      {flag.description || '暂无描述'}
                    </div>

                    <div className="flag-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                      <EnvironmentBadge environment={flag.environment} />
                      <StatusBadge enabled={flag.enabled} />
                    </div>

                    <div
                      className="flag-card-bottom"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: 10,
                        borderTop: '1px solid #f2f0ed',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div style={{ fontSize: 11, color: '#8a8580', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span>默认值:</span>
                        <BooleanValueTag value={flag.default_value} />
                        <span style={{ marginLeft: 4 }}>· {formatDateTime(flag.updated_at).datePart}</span>
                      </div>
                      <Tooltip title={flag.enabled ? '点击停用' : '点击启用'}>
                        <Switch
                          size="small"
                          checked={flag.enabled}
                          loading={togglingId === flag.id}
                          disabled={togglingId === flag.id}
                          onChange={(checked) => handleInlineToggle(flag, checked)}
                        />
                      </Tooltip>
                    </div>
                  </article>
                ))}
              </div>
              {displayedFlags.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 16,
                    padding: '12px 16px',
                    borderTop: '1px solid #f2f0ed',
                  }}
                >
                  <div style={{ fontSize: 13, color: '#8a8580' }}>
                    共 {statusFilter === 'all' ? total : displayedFlags.length} 条记录
                  </div>
                  <Pagination
                    current={currentPage}
                    pageSize={pageSize}
                    total={statusFilter === 'all' ? total : displayedFlags.length}
                    showSizeChanger
                    pageSizeOptions={['10', '20', '50']}
                    onChange={(p, size) => {
                      setCurrentPage(size === pageSize ? p : 1);
                      setPageSize(size);
                    }}
                    size="small"
                  />
                </div>
              )}
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
            rowKey="id"
            columns={columns}
            tableLayout="fixed"
            scroll={{ x: 1125 }}
            dataSource={displayedFlags}
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
                navigate(`/flags/${record.id}`);
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
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              total: total,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50'],
              showTotal: (totalCount) => `共 ${totalCount} 条记录`,
              onChange: (page, size) => {
                setCurrentPage(page);
                setPageSize(size);
              },
            }}
          />
        )}
      </Card>

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
