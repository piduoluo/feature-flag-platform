import React, { useState } from 'react';
import { Alert, Button, Empty, Form, Input, InputNumber, Modal, Select, Switch } from 'antd';
import { Rule } from '../types';
import { moveRule, parseExpected } from '../pages/ruleDraft';
import { stringifyJson } from '../utils/json';
import { BooleanValueTag } from './EnvironmentBadge';

interface Props {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  defaultDirty: boolean;
  flagEnabled: boolean;
  disabled: boolean;
}

export const RuleWorkspace: React.FC<Props> = ({
  rules,
  onChange,
  defaultDirty,
  flagEnabled,
  disabled,
}) => {
  const [editing, setEditing] = useState<number | null>();
  const [confirmDelete, setConfirmDelete] = useState<number | 'all'>();
  const [form] = Form.useForm();

  const edit = (index: number | null) => {
    const rule =
      index === null
        ? {
            attribute_name: '',
            operator: 'equals',
            expected_value: '',
            return_value: true,
            priority: Math.max(0, ...rules.map((item) => item.priority)) + 1,
          }
        : rules[index];
    form.setFieldsValue({ ...rule, expected_value: stringifyJson(rule.expected_value) });
    setEditing(index);
  };

  return (
    <div className="rules-workspace" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="rule-toolbar">
        <Button
          type="primary"
          disabled={disabled}
          onClick={() => edit(null)}
          style={{ background: 'var(--brand, #FF6400)', borderColor: 'var(--brand, #FF6400)' }}
        >
          添加规则
        </Button>
        <Button
          danger
          disabled={disabled || !rules.length}
          onClick={() => setConfirmDelete('all')}
        >
          清空全部规则
        </Button>
      </div>

      {defaultDirty && (
        <Alert
          type="warning"
          showIcon
          message="基本设置中有未保存的默认值草稿，保存后才会影响评估结果"
        />
      )}

      {!rules.length && (
        <div className="empty-box" data-testid="rules-empty-state">
          <Empty
            description={
              <>
                <div className="empty-title">
                  {flagEnabled ? '暂无灰度规则' : '当前 Flag 已停用'}
                </div>
                <div className="empty-desc">
                  {flagEnabled
                    ? '当前没有配置灰度规则，评估时将返回 Flag 的配置默认值。'
                    : 'Flag 停用期间，评估将始终返回 false。重新启用后，将按照灰度规则进行评估；未命中任何规则时，返回配置默认值。'}
                </div>
              </>
            }
          />
        </div>
      )}

      <div className="rule-list">
        {rules.map((rule, index) => (
          <div className="rule-card" key={rule.id ?? `draft-${index}`}>
            <div className="rule-card-head">
              规则 {String(index + 1).padStart(2, '0')} · 优先级 {rule.priority}
            </div>
            <div className="rule-card-body">
              <div className="rule-condition rule-cond">
                <strong className="rule-attr">{rule.attribute_name}</strong>
                <span className="rule-op">{rule.operator}</span>
                <code className="rule-val">{stringifyJson(rule.expected_value)}</code>
                <span className="rule-return">
                  命中返回值：<BooleanValueTag value={rule.return_value} />
                </span>
              </div>
              <div className="rule-actions">
                <Button
                  aria-label={`上移规则 ${index + 1}`}
                  disabled={disabled || index === 0}
                  onClick={() => onChange(moveRule(rules, index, -1))}
                >
                  上移
                </Button>
                <Button
                  aria-label={`下移规则 ${index + 1}`}
                  disabled={disabled || index === rules.length - 1}
                  onClick={() => onChange(moveRule(rules, index, 1))}
                >
                  下移
                </Button>
                <Button disabled={disabled} onClick={() => edit(index)}>
                  编辑规则
                </Button>
                <Button danger disabled={disabled} onClick={() => setConfirmDelete(index)}>
                  删除规则
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal
        title={editing === null ? '添加规则' : '编辑规则'}
        open={editing !== undefined}
        okText="确认"
        cancelText="取消"
        okButtonProps={{ style: { background: 'var(--brand, #FF6400)', borderColor: 'var(--brand, #FF6400)' } }}
        onCancel={() => setEditing(undefined)}
        onOk={async () => {
          try {
            const values = await form.validateFields();
            const rule: Rule = {
              ...values,
              expected_value: parseExpected(values.operator, values.expected_value),
            };
            const nextRules =
              editing === null
                ? [...rules, rule]
                : rules.map((old, index) => (index === editing ? { ...old, ...rule } : old));
            onChange(nextRules.sort((left, right) => left.priority - right.priority));
            setEditing(undefined);
          } catch {
            /* Form displays validation errors */
          }
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="attribute_name"
            label="属性名"
            rules={[{ required: true, whitespace: true, message: '请输入属性名' }]}
          >
            <Input placeholder="例如: user_id, country, beta_tester" />
          </Form.Item>
          <Form.Item name="operator" label="操作符">
            <Select options={[{ value: 'equals' }, { value: 'in' }]} />
          </Form.Item>
          <Form.Item
            name="priority"
            label="优先级"
            rules={[
              {
                validator: async (_, value) => {
                  if (!Number.isInteger(value) || value < 1) {
                    throw new Error('优先级必须是大于等于 1 的整数');
                  }
                  if (rules.some((rule, index) => index !== editing && rule.priority === value)) {
                    throw new Error('同一 Flag 下优先级不能重复');
                  }
                },
              },
            ]}
          >
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="expected_value"
            label="期望值（JSON）"
            dependencies={['operator']}
            rules={[
              {
                validator: async (_, value) => {
                  parseExpected(form.getFieldValue('operator'), value);
                },
              },
            ]}
          >
            <Input.TextArea placeholder='例如: "CN", 10001, [10001, 10002]' rows={3} />
          </Form.Item>
          <Form.Item name="return_value" label="命中返回值" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={confirmDelete === 'all' ? '清空全部规则？' : '删除规则？'}
        open={confirmDelete !== undefined}
        okText="确认删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        onCancel={() => setConfirmDelete(undefined)}
        onOk={() => {
          onChange(confirmDelete === 'all' ? [] : rules.filter((_, index) => index !== confirmDelete));
          setConfirmDelete(undefined);
        }}
      >
        <p>
          {confirmDelete === 'all' || rules.length === 1
            ? flagEnabled
              ? '清空后评估将回退至当前 Flag 的默认返回值，此改动将在保存后生效'
              : '当前 Flag 已停用；清空规则不会改变强制返回 false 的结果，此改动将在保存后生效'
            : '此改动将在保存后生效'}
        </p>
      </Modal>
    </div>
  );
};
