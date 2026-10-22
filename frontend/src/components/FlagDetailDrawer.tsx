import React, { useState, useEffect, useCallback } from 'react';
import {
  Drawer,
  Tabs,
  Descriptions,
  Tag,
  Switch,
  Form,
  Input,
  InputNumber,
  Button,
  Space,
  Typography,
  Alert,
  message,
  Timeline,
  Card,
  Spin,
  Table,
  Modal,
  Popconfirm,
  Select,
  Radio,
  Tooltip,
} from 'antd';
import {
  HistoryOutlined,
  EditOutlined,
  ReloadOutlined,
  ControlOutlined,
  PlusOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  DeleteOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { AuditLog, Environment, Flag, Rule, RuleOperator, UpdateFlagPayload } from '../types';
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
  onNavigateToEval?: (flagKey: string, env: Environment) => void;
}

export const FlagDetailDrawer: React.FC<FlagDetailDrawerProps> = ({
  flag,
  open,
  onClose,
  onFlagUpdated,
  onNavigateToEval,
}) => {
  const [form] = Form.useForm();
  const [ruleForm] = Form.useForm();
  const [currentFlag, setCurrentFlag] = useState<Flag | null>(flag);
  const [fetchingFlag, setFetchingFlag] = useState(false);
  const [activeTab, setActiveTab] = useState('rules');
  const [updating, setUpdating] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Rules Workbench State
  const [rules, setRules] = useState<Rule[]>([]);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
  const [savingRules, setSavingRules] = useState(false);
  const [clearingRules, setClearingRules] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);

  const [currentOperator, setCurrentOperator] = useState<RuleOperator>('equals');
  const [currentValueType, setCurrentValueType] = useState<string>('string');

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const loadFreshFlag = useCallback(async (flagId: number) => {
    setFetchingFlag(true);
    try {
      const fresh = await api.getFlag(flagId);
      setCurrentFlag(fresh);
      setRules(fresh.rules || []);
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
      setRules(flag.rules || []);
      form.setFieldsValue({
        name: flag.name,
        description: flag.description,
        default_value: flag.default_value,
      });
      setErrorMessage(null);
      setAuditError(null);
      setRuleError(null);
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

  // --- Rule Workbench Handlers ---

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    setRules((prev) => {
      const copy = [...prev];
      // Atomic priority swap
      const tempPriority = copy[index].priority;
      copy[index] = { ...copy[index], priority: copy[index - 1].priority };
      copy[index - 1] = { ...copy[index - 1], priority: tempPriority };
      // Swap positions in array
      const temp = copy[index];
      copy[index] = copy[index - 1];
      copy[index - 1] = temp;
      return copy;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index >= rules.length - 1) return;
    setRules((prev) => {
      const copy = [...prev];
      // Atomic priority swap
      const tempPriority = copy[index].priority;
      copy[index] = { ...copy[index], priority: copy[index + 1].priority };
      copy[index + 1] = { ...copy[index + 1], priority: tempPriority };
      // Swap positions in array
      const temp = copy[index];
      copy[index] = copy[index + 1];
      copy[index + 1] = temp;
      return copy;
    });
  };

  const handleDeleteRule = (index: number) => {
    setRules((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddRule = () => {
    setEditingRuleIndex(null);
    const nextPriority = rules.length > 0 ? Math.max(...rules.map((r) => r.priority)) + 1 : 1;
    setCurrentOperator('equals');
    setCurrentValueType('string');
    ruleForm.resetFields();
    ruleForm.setFieldsValue({
      priority: nextPriority,
      attribute_name: '',
      operator: 'equals',
      value_type: 'string',
      expected_value: '',
      return_value: true,
    });
    setRuleModalOpen(true);
  };

  const handleEditRule = (index: number) => {
    setEditingRuleIndex(index);
    const target = rules[index];
    let valType = 'string';
    if (target.operator === 'equals') {
      if (typeof target.expected_value === 'number') {
        valType = 'number';
      } else if (typeof target.expected_value === 'boolean') {
        valType = 'boolean';
      } else {
        valType = 'string';
      }
    } else {
      if (Array.isArray(target.expected_value) && target.expected_value.length > 0) {
        if (typeof target.expected_value[0] === 'number') {
          valType = 'number_list';
        } else if (typeof target.expected_value[0] === 'boolean') {
          valType = 'boolean_list';
        } else {
          valType = 'string_list';
        }
      } else {
        valType = 'string_list';
      }
    }

    setCurrentOperator(target.operator);
    setCurrentValueType(valType);

    ruleForm.resetFields();
    ruleForm.setFieldsValue({
      priority: target.priority,
      attribute_name: target.attribute_name,
      operator: target.operator,
      value_type: valType,
      expected_value: target.expected_value,
      return_value: target.return_value,
    });
    setRuleModalOpen(true);
  };

  const handleRuleModalOk = async () => {
    try {
      const values = await ruleForm.validateFields();
      let parsedExpectedValue: unknown;

      if (values.operator === 'equals') {
        if (values.value_type === 'number') {
          parsedExpectedValue = Number(values.expected_value);
          if (isNaN(parsedExpectedValue as number)) {
            message.error('请输入有效数字');
            return;
          }
        } else if (values.value_type === 'boolean') {
          parsedExpectedValue = Boolean(values.expected_value);
        } else {
          parsedExpectedValue = String(values.expected_value ?? '').trim();
          if (parsedExpectedValue === '') {
            message.error('期望值不能为空');
            return;
          }
        }
      } else {
        const rawArr = Array.isArray(values.expected_value) ? values.expected_value : [];
        if (rawArr.length === 0) {
          message.error('操作符 in 的期望值列表不能为空');
          return;
        }
        if (values.value_type === 'number_list') {
          const numArr: number[] = [];
          for (const item of rawArr) {
            const n = Number(item);
            if (isNaN(n)) {
              message.error(`数字列表项 "${item}" 不是有效数字`);
              return;
            }
            numArr.push(n);
          }
          parsedExpectedValue = numArr;
        } else if (values.value_type === 'boolean_list') {
          parsedExpectedValue = rawArr.map((item: unknown) => Boolean(item));
        } else {
          parsedExpectedValue = rawArr.map((item: unknown) => String(item).trim()).filter(Boolean);
          if ((parsedExpectedValue as string[]).length === 0) {
            message.error('期望值列表不能为空');
            return;
          }
        }
      }

      const priorityNum = Number(values.priority);
      if (priorityNum < 1 || !Number.isInteger(priorityNum)) {
        message.error('优先级必须为正整数 (>= 1)');
        return;
      }

      const newRule: Rule = {
        ...(editingRuleIndex !== null && rules[editingRuleIndex]?.id
          ? { id: rules[editingRuleIndex].id }
          : {}),
        attribute_name: values.attribute_name.trim(),
        operator: values.operator,
        expected_value: parsedExpectedValue,
        return_value: !!values.return_value,
        priority: priorityNum,
      };

      setRules((prev) => {
        let updated: Rule[];
        if (editingRuleIndex !== null) {
          updated = [...prev];
          updated[editingRuleIndex] = newRule;
        } else {
          updated = [...prev, newRule];
        }
        return updated.sort((a, b) => a.priority - b.priority);
      });

      setRuleModalOpen(false);
    } catch {
      // Form validation error
    }
  };

  const executeSaveRules = async (rulesToSync: Rule[]) => {
    setSavingRules(true);
    setRuleError(null);
    try {
      const saved = await api.syncRules(currentFlag.id, rulesToSync);
      setRules(saved);
      setCurrentFlag((prev) => (prev ? { ...prev, rules: saved } : null));
      message.success(
        rulesToSync.length === 0
          ? '已清空该 Flag 下的全部灰度规则'
          : '规则配置已保存并同步成功'
      );
      if (activeTab === 'audit') {
        fetchAuditLogs();
      }
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : '保存规则失败，请稍后重试';
      setRuleError(msg);
      message.error(msg);
    } finally {
      setSavingRules(false);
      setClearingRules(false);
    }
  };

  const handleSaveRules = async () => {
    // If saving 0 rules, trigger secondary confirmation modal per SPEC:254
    if (rules.length === 0) {
      Modal.confirm({
        title: '清空全部规则确认',
        content: '当前规则列表为空，保存将清空该 Flag 下全部规则并使所有流量回退至默认返回值，确定要继续吗？',
        okText: '确认清空保存',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: async () => {
          await executeSaveRules([]);
        },
      });
      return;
    }

    // 1. Client-side priority validation
    const seenPriorities = new Set<number>();
    for (const r of rules) {
      if (r.priority < 1 || !Number.isInteger(r.priority)) {
        setRuleError(`规则优先级必须为正整数 (>= 1)，当前存在非法值: ${r.priority}`);
        return;
      }
      if (seenPriorities.has(r.priority)) {
        setRuleError(`同一 Flag 下存在重复的优先级 (#${r.priority})，请调整后再保存`);
        return;
      }
      seenPriorities.add(r.priority);
    }

    await executeSaveRules(rules);
  };

  const handleClearAllRules = async () => {
    setClearingRules(true);
    await executeSaveRules([]);
  };

  // --- Audit Diff Summary Formatter ---

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

    if (action === 'RULES_SYNCED' && (diff.added || diff.updated || diff.deleted)) {
      const added = (diff.added as Record<string, unknown>[]) || [];
      const updated = (diff.updated as Record<string, unknown>[]) || [];
      const deleted = (diff.deleted as Record<string, unknown>[]) || [];

      return (
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          {added.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <Tag color="green">新增规则 ({added.length})</Tag>
              {added.map((item, idx) => (
                <div key={idx} style={{ paddingLeft: 8, color: '#389e0d' }}>
                  + [#{String(item.priority)}] {String(item.attribute_name)} {String(item.operator)}{' '}
                  {JSON.stringify(item.expected_value)} → {String(item.return_value)}
                </div>
              ))}
            </div>
          )}
          {updated.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <Tag color="blue">修改规则 ({updated.length})</Tag>
              {updated.map((item, idx) => {
                const after = item.after as Record<string, unknown> | undefined;
                const before = item.before as Record<string, unknown> | undefined;
                return (
                  <div key={idx} style={{ paddingLeft: 8, color: '#0958d9' }}>
                    ~ [#{String(after?.priority)}] {String(after?.attribute_name)} (原: #{String(before?.priority)} {String(before?.attribute_name)})
                  </div>
                );
              })}
            </div>
          )}
          {deleted.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <Tag color="red">删除规则 ({deleted.length})</Tag>
              {deleted.map((item, idx) => (
                <div key={idx} style={{ paddingLeft: 8, color: '#cf1322' }}>
                  - [#{String(item.priority)}] {String(item.attribute_name)} {String(item.operator)}{' '}
                  {JSON.stringify(item.expected_value)}
                </div>
              ))}
            </div>
          )}
          {added.length === 0 && updated.length === 0 && deleted.length === 0 && (
            <Text type="secondary">无规则变更差异</Text>
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

  const ruleTableColumns = [
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 75,
      render: (p: number) => <Tag color="geekblue">#{p}</Tag>,
    },
    {
      title: '属性名',
      dataIndex: 'attribute_name',
      key: 'attribute_name',
      render: (name: string) => <Text code>{name}</Text>,
    },
    {
      title: '操作符',
      dataIndex: 'operator',
      key: 'operator',
      width: 90,
      render: (op: string) => (
        <Tag color={op === 'equals' ? 'blue' : 'purple'}>{op}</Tag>
      ),
    },
    {
      title: '期望值',
      dataIndex: 'expected_value',
      key: 'expected_value',
      render: (val: unknown) => (
        <Text code style={{ fontSize: 12 }}>
          {JSON.stringify(val)}
        </Text>
      ),
    },
    {
      title: '命中返回值',
      dataIndex: 'return_value',
      key: 'return_value',
      width: 95,
      render: (val: boolean) => (
        <Tag color={val ? 'cyan' : 'red'}>{String(val)}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 170,
      render: (_: unknown, __: Rule, index: number) => (
        <Space size="small">
          <Tooltip title="上移 (提升优先级)">
            <Button
              type="text"
              size="small"
              icon={<ArrowUpOutlined />}
              disabled={index === 0}
              onClick={() => handleMoveUp(index)}
              aria-label="上移规则"
            />
          </Tooltip>
          <Tooltip title="下移 (降低优先级)">
            <Button
              type="text"
              size="small"
              icon={<ArrowDownOutlined />}
              disabled={index === rules.length - 1}
              onClick={() => handleMoveDown(index)}
              aria-label="下移规则"
            />
          </Tooltip>
          <Button type="link" size="small" onClick={() => handleEditRule(index)}>
            编辑
          </Button>
          <Popconfirm
            title="确定删除此规则？"
            onConfirm={() => handleDeleteRule(index)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button type="link" danger size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

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
            {onNavigateToEval && (
              <Button
                size="small"
                icon={<ThunderboltOutlined />}
                onClick={() => {
                  onClose();
                  onNavigateToEval(currentFlag.key, currentFlag.environment);
                }}
              >
                去评估
              </Button>
            )}
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
      width={780}
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
              key: 'rules',
              label: (
                <span>
                  <ControlOutlined /> 规则配置工作台 ({rules.length})
                </span>
              ),
              forceRender: true,
              children: (
                <div style={{ paddingTop: 8 }}>
                  {ruleError && (
                    <Alert
                      type="error"
                      showIcon
                      message={ruleError}
                      style={{ marginBottom: 16 }}
                      closable
                      onClose={() => setRuleError(null)}
                    />
                  )}

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 16,
                    }}
                  >
                    <Space>
                      <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        onClick={handleAddRule}
                      >
                        添加规则
                      </Button>
                      <Popconfirm
                        title="确定清空全部规则？"
                        description="此操作将提交清空请求并安全记录包含删除明细的审计记录。"
                        onConfirm={handleClearAllRules}
                        okText="确定清空"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                      >
                        <Button
                          danger
                          icon={<DeleteOutlined />}
                          disabled={rules.length === 0}
                          loading={clearingRules}
                        >
                          清空全部规则
                        </Button>
                      </Popconfirm>
                    </Space>
                    <Space>
                      <Button
                        type="primary"
                        icon={<SaveOutlined />}
                        onClick={handleSaveRules}
                        loading={savingRules}
                      >
                        批量保存规则
                      </Button>
                    </Space>
                  </div>

                  <Table
                    rowKey={(record: Rule) => (record.id ? String(record.id) : `priority_${record.priority}`)}
                    dataSource={rules}
                    columns={ruleTableColumns}
                    pagination={false}
                    size="small"
                    locale={{ emptyText: '暂无规则配置，点击上方“添加规则”创建' }}
                  />
                </div>
              ),
            },
            {
              key: 'settings',
              label: (
                <span>
                  <EditOutlined /> 基本信息修改
                </span>
              ),
              forceRender: true,
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
              forceRender: true,
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
                      刷新操作历史
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

        {/* Modal for Add / Edit Rule */}
        <Modal
          title={editingRuleIndex !== null ? '编辑规则' : '添加新规则'}
          open={ruleModalOpen}
          onOk={handleRuleModalOk}
          onCancel={() => setRuleModalOpen(false)}
          destroyOnHidden
          okText="确认"
          cancelText="取消"
        >
          <Form form={ruleForm} layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item
              name="priority"
              label="优先级 (Priority)"
              rules={[
                { required: true, message: '请输入优先级' },
                {
                  validator: async (_, val) => {
                    if (val === undefined || val === null || val === '') return;
                    const n = Number(val);
                    if (!Number.isInteger(n) || n < 1) {
                      throw new Error('优先级必须为正整数 (>= 1)');
                    }
                  },
                },
              ]}
              tooltip="正整数，1 为最高优先级。评估时按优先级严格升序匹配。"
            >
              <InputNumber min={1} precision={0} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              name="attribute_name"
              label="属性名 (Attribute Name)"
              rules={[{ required: true, message: '请输入匹配属性名，如 country 或 user_id' }]}
            >
              <Input placeholder="例如: country, user_id, app_version" />
            </Form.Item>

            <Form.Item
              name="operator"
              label="操作符 (Operator)"
              rules={[{ required: true }]}
            >
              <Select
                options={[
                  { label: 'equals (等于标量)', value: 'equals' },
                  { label: 'in (包含于标量列表)', value: 'in' },
                ]}
                onChange={(val) => {
                  setCurrentOperator(val as RuleOperator);
                  if (val === 'equals') {
                    setCurrentValueType('string');
                    ruleForm.setFieldsValue({ value_type: 'string', expected_value: '' });
                  } else {
                    setCurrentValueType('string_list');
                    ruleForm.setFieldsValue({ value_type: 'string_list', expected_value: [] });
                  }
                }}
              />
            </Form.Item>

            <Form.Item
              name="value_type"
              label="期望值类型"
              rules={[{ required: true }]}
            >
              <Select
                value={currentValueType}
                onChange={(val) => {
                  setCurrentValueType(val);
                  if (val === 'boolean') {
                    ruleForm.setFieldsValue({ expected_value: true });
                  } else if (val === 'string_list' || val === 'number_list') {
                    ruleForm.setFieldsValue({ expected_value: [] });
                  } else {
                    ruleForm.setFieldsValue({ expected_value: '' });
                  }
                }}
                options={
                  currentOperator === 'equals'
                    ? [
                        { label: '字符串 (string)', value: 'string' },
                        { label: '数字 (number)', value: 'number' },
                        { label: '布尔值 (boolean)', value: 'boolean' },
                      ]
                    : [
                        { label: '字符串列表 (string[])', value: 'string_list' },
                        { label: '数字列表 (number[])', value: 'number_list' },
                        { label: '布尔值列表 (boolean[])', value: 'boolean_list' },
                      ]
                }
              />
            </Form.Item>

            <Form.Item
              name="expected_value"
              label="期望值 (Expected Value)"
              rules={[{ required: true, message: '请输入期望值' }]}
            >
              {currentOperator === 'equals' && currentValueType === 'string' && (
                <Input placeholder="例如: CN" />
              )}
              {currentOperator === 'equals' && currentValueType === 'number' && (
                <InputNumber placeholder="例如: 100" style={{ width: '100%' }} />
              )}
              {currentOperator === 'equals' && currentValueType === 'boolean' && (
                <Radio.Group>
                  <Radio value={true}>true</Radio>
                  <Radio value={false}>false</Radio>
                </Radio.Group>
              )}
              {currentOperator === 'in' && currentValueType === 'string_list' && (
                <Select
                  mode="tags"
                  placeholder="输入字符串按回车添加，例如: CN, US, SG"
                  tokenSeparators={[',', ' ']}
                  style={{ width: '100%' }}
                />
              )}
              {currentOperator === 'in' && currentValueType === 'number_list' && (
                <Select
                  mode="tags"
                  placeholder="输入数字按回车添加，例如: 100, 200"
                  tokenSeparators={[',', ' ']}
                  style={{ width: '100%' }}
                />
              )}
              {currentOperator === 'in' && currentValueType === 'boolean_list' && (
                <Select
                  mode="multiple"
                  placeholder="选择布尔值列表"
                  style={{ width: '100%' }}
                  options={[
                    { label: 'true', value: true },
                    { label: 'false', value: false },
                  ]}
                />
              )}
            </Form.Item>

            <Form.Item
              name="return_value"
              label="命中返回值 (Return Value)"
              valuePropName="checked"
              tooltip="当规则命中时立即返回该布尔值（短路求值）"
            >
              <Switch checkedChildren="true" unCheckedChildren="false" />
            </Form.Item>
          </Form>
        </Modal>
      </Spin>
    </Drawer>
  );
};
