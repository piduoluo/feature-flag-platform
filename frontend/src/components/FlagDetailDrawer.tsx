import React, { useState, useEffect, useCallback } from 'react';
import {
  Drawer,
  Tabs,
  Descriptions,
  Tag,
  Switch,
  Form,
  Input,
  Button,
  Space,
  Typography,
  Alert,
  message,
  Timeline,
  Card,
  Spin,
} from 'antd';
import {
  HistoryOutlined,
  EditOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { AuditLog, Environment, Flag, UpdateFlagPayload } from '../types';
import { api, ApiError } from '../api/client';

const { Text } = Typography;

const ACTION_COLORS: Record<string, string> = {
  FLAG_CREATED: 'green',
  FLAG_UPDATED: 'blue',
  FLAG_TOGGLED: 'orange',
  RULES_SYNCED: 'purple',
};

const ACTION_LABELS: Record<string, string> = {
  FLAG_CREATED: '创建 Flag',
  FLAG_UPDATED: '修改基本信息',
  FLAG_TOGGLED: '切换启停状态',
  RULES_SYNCED: '批量同步规则',
};

const ENV_COLORS: Record<Environment, string> = {
  development: 'blue',
  staging: 'orange',
  production: 'magenta',
};

interface FlagDetailDrawerProps {
  flag: Flag | null;
  open: boolean;
  onClose: () => void;
  onFlagUpdated: (updated: Flag) => void;
}

export const FlagDetailDrawer: React.FC<FlagDetailDrawerProps> = ({
  flag,
  open,
  onClose,
  onFlagUpdated,
}) => {
  const [form] = Form.useForm();
  const [currentFlag, setCurrentFlag] = useState<Flag | null>(flag);
  const [fetchingFlag, setFetchingFlag] = useState(false);
  const [activeTab, setActiveTab] = useState('settings');
  const [updating, setUpdating] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const loadFreshFlag = useCallback(async (flagId: number) => {
    setFetchingFlag(true);
    try {
      const fresh = await api.getFlag(flagId);
      setCurrentFlag(fresh);
      form.setFieldsValue({
        name: fresh.name,
        description: fresh.description,
        default_value: fresh.default_value,
      });
    } catch (err) {
      console.error('Failed to fetch latest flag details:', err);
    } finally {
      setFetchingFlag(false);
    }
  }, [form]);

  useEffect(() => {
    if (open && flag) {
      setCurrentFlag(flag);
      form.setFieldsValue({
        name: flag.name,
        description: flag.description,
        default_value: flag.default_value,
      });
      setErrorMessage(null);
      setAuditError(null);
      loadFreshFlag(flag.id);
    }
  }, [open, flag, form, loadFreshFlag]);

  const fetchAuditLogs = useCallback(async () => {
    if (!currentFlag) return;
    setLoadingLogs(true);
    setAuditError(null);
    try {
      const logs = await api.getAuditLogs(currentFlag.id);
      setAuditLogs(logs || []);
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : (err instanceof Error ? err.message : '获取操作历史失败');
      setAuditError(msg);
      message.error(msg);
    } finally {
      setLoadingLogs(false);
    }
  }, [currentFlag]);

  useEffect(() => {
    if (open && currentFlag && activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [open, currentFlag, activeTab, fetchAuditLogs]);

  if (!currentFlag) return null;

  const handleToggle = async (checked: boolean) => {
    setToggling(true);
    try {
      const updated = await api.toggleFlag(currentFlag.id, checked);
      message.success(`Flag 已${checked ? '启用' : '停用'}`);
      setCurrentFlag(updated);
      onFlagUpdated(updated);
      if (activeTab === 'audit') {
        fetchAuditLogs();
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : '切换启停状态失败';
      message.error(msg);
    } finally {
      setToggling(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      const values = await form.validateFields();
      setUpdating(true);
      setErrorMessage(null);

      const payload: UpdateFlagPayload = {
        name: values.name.trim(),
        description: values.description ? values.description.trim() : '',
        default_value: !!values.default_value,
      };

      const updated = await api.updateFlag(currentFlag.id, payload);
      message.success('Flag 基本信息更新成功');
      setCurrentFlag(updated);
      onFlagUpdated(updated);
      if (activeTab === 'audit') {
        fetchAuditLogs();
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else if (err && typeof err === 'object' && 'errorFields' in err) {
        // Form validation error
      } else {
        setErrorMessage('保存失败，请检查网络后重试');
      }
    } finally {
      setUpdating(false);
    }
  };

  const renderDiffSummary = (diff: Record<string, unknown>, action: string) => {
    if (!diff || Object.keys(diff).length === 0) {
      return <Text type="secondary">无详细差异</Text>;
    }

    if (action === 'FLAG_TOGGLED') {
      return (
        <Space size="middle" style={{ fontSize: 13 }}>
          <span>
            原状态:{' '}
            <Tag color={diff.old_enabled ? 'success' : 'default'}>
              {diff.old_enabled ? '已启用' : '已停用'}
            </Tag>
          </span>
          <span>→</span>
          <span>
            新状态:{' '}
            <Tag color={diff.new_enabled ? 'success' : 'default'}>
              {diff.new_enabled ? '已启用' : '已停用'}
            </Tag>
          </span>
        </Space>
      );
    }

    if (action === 'FLAG_UPDATED' && diff.before && diff.after) {
      const before = diff.before as Record<string, unknown>;
      const after = diff.after as Record<string, unknown>;
      return (
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          {before.name !== after.name && (
            <div>
              名称变更: <Text delete type="secondary">{String(before.name)}</Text> → <Text strong>{String(after.name)}</Text>
            </div>
          )}
          {before.description !== after.description && (
            <div>
              描述变更: <Text delete type="secondary">{String(before.description || '空')}</Text> → <Text strong>{String(after.description || '空')}</Text>
            </div>
          )}
          {before.default_value !== after.default_value && (
            <div>
              默认返回值:{' '}
              <Tag color={before.default_value ? 'cyan' : 'default'}>{String(before.default_value)}</Tag> →{' '}
              <Tag color={after.default_value ? 'cyan' : 'default'}>{String(after.default_value)}</Tag>
            </div>
          )}
        </div>
      );
    }

    return (
      <pre style={{ margin: 0, padding: 8, background: '#f5f5f5', borderRadius: 4, fontSize: 11 }}>
        {JSON.stringify(diff, null, 2)}
      </pre>
    );
  };

  return (
    <Drawer
      title={
        <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <span>Flag 详情:</span>
            <Text code copyable>{currentFlag.key}</Text>
            <Tag color={ENV_COLORS[currentFlag.environment]}>{currentFlag.environment}</Tag>
          </Space>
          <Space>
            <Text type="secondary" style={{ fontSize: 13 }}>启停控制:</Text>
            <Switch
              checked={currentFlag.enabled}
              loading={toggling}
              checkedChildren="已启用"
              unCheckedChildren="已停用"
              onChange={handleToggle}
            />
          </Space>
        </Space>
      }
      width={640}
      open={open}
      onClose={onClose}
      destroyOnClose
    >
      <Spin spinning={fetchingFlag}>
        {/* Overview Card */}
        <Card variant="borderless" style={{ background: '#fafafa', marginBottom: 20 }}>
          <Descriptions column={2} size="small">
            <Descriptions.Item label="显示名称">{currentFlag.name}</Descriptions.Item>
            <Descriptions.Item label="当前环境">
              <Tag color={ENV_COLORS[currentFlag.environment]}>{currentFlag.environment}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="详细描述" span={2}>
              {currentFlag.description ? (
                <Text>{currentFlag.description}</Text>
              ) : (
                <Text type="secondary">暂无描述</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="启停状态">
              <Tag color={currentFlag.enabled ? 'success' : 'default'}>
                {currentFlag.enabled ? '已启用 (生效中)' : '已停用 (阻断为 false)'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="默认返回值">
              <Tag color={currentFlag.default_value ? 'cyan' : 'default'}>
                {currentFlag.default_value ? 'true' : 'false'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {new Date(currentFlag.created_at).toLocaleString('zh-CN')}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              {new Date(currentFlag.updated_at).toLocaleString('zh-CN')}
            </Descriptions.Item>
          </Descriptions>
        </Card>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'settings',
            label: (
              <span>
                <EditOutlined /> 基本信息修改
              </span>
            ),
            children: (
              <div style={{ paddingTop: 8 }}>
                {errorMessage && (
                  <Alert
                    type="error"
                    showIcon
                    message={errorMessage}
                    style={{ marginBottom: 16 }}
                    closable
                    onClose={() => setErrorMessage(null)}
                  />
                )}

                <Form form={form} layout="vertical">
                  <Form.Item
                    name="name"
                    label="Flag 名称"
                    rules={[
                      { required: true, message: '请输入 Flag 显示名称' },
                      { max: 255, message: '名称不能超过 255 个字符' },
                    ]}
                  >
                    <Input placeholder="输入清晰的功能描述名称" />
                  </Form.Item>

                  <Form.Item name="description" label="详细描述">
                    <Input.TextArea
                      rows={3}
                      placeholder="业务背景与预期放量目标"
                      maxLength={500}
                      showCount
                    />
                  </Form.Item>

                  <Form.Item
                    name="default_value"
                    label="默认返回值 (Default Value)"
                    valuePropName="checked"
                    tooltip="所有灰度规则均未命中时的回退返回值"
                  >
                    <Switch checkedChildren="true" unCheckedChildren="false" />
                  </Form.Item>

                  <Form.Item style={{ marginTop: 24 }}>
                    <Button
                      type="primary"
                      onClick={handleSaveSettings}
                      loading={updating}
                    >
                      保存基本信息修改
                    </Button>
                  </Form.Item>
                </Form>
              </div>
            ),
          },
          {
            key: 'audit',
            label: (
              <span>
                <HistoryOutlined /> 操作历史 (Audit Log)
              </span>
            ),
            children: (
              <div style={{ paddingTop: 8 }}>
                {auditError && (
                  <Alert
                    type="error"
                    showIcon
                    message={auditError}
                    style={{ marginBottom: 16 }}
                    closable
                    onClose={() => setAuditError(null)}
                  />
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    记录所有针对此 Flag 的原子审计流水，按时间倒序排列。
                  </Text>
                  <Button
                    icon={<ReloadOutlined />}
                    size="small"
                    onClick={fetchAuditLogs}
                    loading={loadingLogs}
                  >
                    刷新流水
                  </Button>
                </div>

                <Timeline
                  mode="left"
                  items={auditLogs.map((log) => ({
                    color: ACTION_COLORS[log.action_type] || 'gray',
                    label: (
                      <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                        {new Date(log.created_at).toLocaleString('zh-CN')}
                      </span>
                    ),
                    children: (
                      <Card
                        size="small"
                        style={{ marginBottom: 12 }}
                        title={
                          <Space>
                            <Tag color={ACTION_COLORS[log.action_type] || 'default'}>
                              {ACTION_LABELS[log.action_type] || log.action_type}
                            </Tag>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              操作者: {log.operator}
                            </Text>
                          </Space>
                        }
                      >
                        {renderDiffSummary(log.diff_summary, log.action_type)}
                      </Card>
                    ),
                  }))}
                />
                {auditLogs.length === 0 && !loadingLogs && (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: '#8c8c8c' }}>
                    暂无操作历史记录
                  </div>
                )}
              </div>
            ),
          },
        ]}
      />
      </Spin>
    </Drawer>
  );
};
