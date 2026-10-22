import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Input,
  Segmented,
  Tag,
  Space,
  Card,
  Typography,
  Empty,
  Badge,
  Tooltip,
  Alert,
  Switch,
  message,
} from 'antd';
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { ColumnsType } from 'antd/es/table';
import { Environment, Flag } from '../types';
import { api, ApiError } from '../api/client';
import { CreateFlagDrawer } from '../components/CreateFlagDrawer';

const { Text, Paragraph } = Typography;

const ENV_TAG_COLORS: Record<Environment, string> = {
  development: 'blue',
  staging: 'orange',
  production: 'magenta',
};

const ENV_LABELS: Record<string, string> = {
  all: '全部环境',
  development: 'Development',
  staging: 'Staging',
  production: 'Production',
};

const ENV_OPTIONS = [
  { label: '全部环境', value: 'all' },
  { label: 'Development', value: 'development' },
  { label: 'Staging', value: 'staging' },
  { label: 'Production', value: 'production' },
];

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

  const columns: ColumnsType<Flag> = [
    {
      title: 'Flag Key',
      dataIndex: 'key',
      key: 'key',
      width: 220,
      render: (key: string) => (
        <Space size="small">
          <Text code strong copyable>
            {key}
          </Text>
        </Space>
      ),
    },
    {
      title: '名称与描述',
      key: 'name_desc',
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{record.name}</div>
          {record.description ? (
            <Paragraph
              type="secondary"
              ellipsis={{ rows: 1 }}
              style={{ margin: 0, fontSize: 12 }}
            >
              {record.description}
            </Paragraph>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              暂无描述
            </Text>
          )}
        </div>
      ),
    },
    {
      title: '运行环境',
      dataIndex: 'environment',
      key: 'environment',
      width: 140,
      render: (env: Environment) => (
        <Tag color={ENV_TAG_COLORS[env]} style={{ fontWeight: 500 }}>
          {ENV_LABELS[env] || env}
        </Tag>
      ),
    },
    {
      title: '启停状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 120,
      render: (enabled: boolean) => (
        <Badge
          status={enabled ? 'success' : 'default'}
          text={
            <span style={{ fontWeight: 500 }}>
              {enabled ? '已启用' : '已停用'}
            </span>
          }
        />
      ),
    },
    {
      title: '默认返回值',
      dataIndex: 'default_value',
      key: 'default_value',
      width: 120,
      render: (val: boolean) => (
        <Tag color={val ? 'cyan' : 'default'}>
          {val ? 'true' : 'false'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      render: (timeStr: string) => {
        try {
          return new Date(timeStr).toLocaleString('zh-CN', {
            hour12: false,
          });
        } catch {
          return timeStr;
        }
      },
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 170,
      render: (timeStr: string) => {
        try {
          return new Date(timeStr).toLocaleString('zh-CN', {
            hour12: false,
          });
        } catch {
          return timeStr;
        }
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      render: (_, record) => (
        <Space size="middle">
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
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      <Card
        variant="borderless"
        style={{
          boxShadow:
            '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
          borderRadius: 8,
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
            <Typography.Title level={4} style={{ margin: 0 }}>
              Feature Flag 特性开关管理
            </Typography.Title>
            <Typography.Text type="secondary">
              在特定运行环境下定义并管控功能发布开关，同一环境下保持 Key 唯一。
            </Typography.Text>
          </div>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateDrawerOpen(true)}
            size="large"
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

        {/* Toolbar: Environment filter & Search */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <Segmented
            value={selectedEnv}
            onChange={(val) => handleEnvChange(val as string)}
            options={ENV_OPTIONS}
          />

          <Space>
            <Input.Search
              placeholder="按 Key 或名称搜索..."
              allowClear
              enterButton={<SearchOutlined />}
              style={{ width: 260 }}
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              onSearch={(value) => handleSearchChange(value)}
            />
            <Tooltip title="刷新列表">
              <Button
                icon={<ReloadOutlined />}
                onClick={() => fetchFlags()}
                loading={loading}
              />
            </Tooltip>
          </Space>
        </div>

        {/* Table */}
        <Table<Flag>
          rowKey="id"
          columns={columns}
          dataSource={flags}
          loading={loading}
          onRow={(record) => ({
            onClick: (event) => {
              const target = event.target as HTMLElement;
              if (
                target.closest('button') ||
                target.closest('.ant-switch') ||
                target.closest('a') ||
                target.closest('.ant-typography-copy')
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
                  searchText || selectedEnv !== 'all'
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
