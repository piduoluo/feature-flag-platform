import React, { useState, useEffect, useCallback } from 'react';
import {
  Table,
  Button,
  Input,
  Radio,
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
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { Environment, Flag } from '../types';
import { api, ApiError } from '../api/client';
import { CreateFlagDrawer } from '../components/CreateFlagDrawer';
import { FlagDetailDrawer } from '../components/FlagDetailDrawer';

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

export const FlagListPage: React.FC = () => {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedEnv, setSelectedEnv] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState<Flag | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const handleInlineToggle = async (record: Flag, checked: boolean) => {
    setTogglingId(record.id);
    try {
      const updated = await api.toggleFlag(record.id, checked);
      message.success(`Flag [${record.key}] 已${checked ? '启用' : '停用'}`);
      setFlags((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      if (selectedFlag?.id === updated.id) {
        setSelectedFlag(updated);
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
        environment: selectedEnv === 'all' ? undefined : selectedEnv,
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
      width: 180,
      render: (_, record) => (
        <Space size="middle">
          <Button
            type="link"
            size="small"
            icon={<SettingOutlined />}
            onClick={() => setSelectedFlag(record)}
          >
            详情与配置
          </Button>
          <Tooltip title={record.enabled ? '点击停用' : '点击启用'}>
            <Switch
              size="small"
              checked={record.enabled}
              loading={togglingId === record.id}
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
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
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
          <Radio.Group
            value={selectedEnv}
            onChange={(e) => {
              setSelectedEnv(e.target.value);
              setCurrentPage(1);
            }}
            buttonStyle="solid"
          >
            <Radio.Button value="all">全部环境</Radio.Button>
            <Radio.Button value="development">Development</Radio.Button>
            <Radio.Button value="staging">Staging</Radio.Button>
            <Radio.Button value="production">Production</Radio.Button>
          </Radio.Group>

          <Space>
            <Input.Search
              placeholder="按 Key 或名称搜索..."
              allowClear
              enterButton={<SearchOutlined />}
              style={{ width: 260 }}
              onSearch={(value) => {
                setSearchText(value);
                setCurrentPage(1);
              }}
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
        existingKeys={flags
          .filter((f) => selectedEnv === 'all' || f.environment === selectedEnv)
          .map((f) => f.key)}
        onSuccess={() => {
          fetchFlags();
        }}
      />

      <FlagDetailDrawer
        flag={selectedFlag}
        open={!!selectedFlag}
        onClose={() => setSelectedFlag(null)}
        onFlagUpdated={(updated) => {
          setFlags((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
          setSelectedFlag(updated);
        }}
      />
    </div>
  );
};
