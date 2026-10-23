import React, { useState } from 'react';
import { Alert, Button, Empty, Form, Input, Modal, Select, Switch, Tag } from 'antd';
import { Rule } from '../types';
import { moveRule, parseExpected } from '../pages/ruleDraft';

interface Props {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  defaultValue: boolean;
  defaultDirty: boolean;
  disabled: boolean;
}

export const RuleWorkspace: React.FC<Props> = ({
  rules,
  onChange,
  defaultValue,
  defaultDirty,
  disabled,
}) => {
  const [editing, setEditing] = useState<number | null>();
  const [confirmDelete, setConfirmDelete] = useState<number | 'all'>();
  const [form] = Form.useForm();

  const edit = (index: number | null) => {
    const rule =
      index === null
        ? { attribute_name: '', operator: 'equals', expected_value: '', return_value: true }
        : rules[index];
    form.setFieldsValue({ ...rule, expected_value: JSON.stringify(rule.expected_value) });
    setEditing(index);
  };

  return (
    <div className="rules-workspace" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="rule-toolbar">
        <Button
          type="primary"
          disabled={disabled}
          onClick={() => edit(null)}
          style={{ background: 'var(--brand, #ff7d41)', borderColor: 'var(--brand, #ff7d41)' }}
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

      {!rules.length && (
        <div className="empty-box">
          <Empty description="当前暂无灰度规则，将直接返回默认值" />
        </div>
      )}

      <div className="rule-list">
        {rules.map((rule, index) => (
          <div className="rule-card" key={rule.id ?? `draft-${index}`}>
            <div className="rule-card-head">
              规则 {String(index + 1).padStart(2, '0')}
            </div>
            <div className="rule-card-body">
              <div className="rule-cond">
                <strong className="rule-attr">{rule.attribute_name}</strong>
                <span className="rule-op">{rule.operator}</span>
                <code className="rule-val">{JSON.stringify(rule.expected_value)}</code>
                <span className="rule-return">
                  命中返回值：<strong>{String(rule.return_value)}</strong>
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

      <div className="default-card">
        <span className="default-card-label">默认返回值（已生效）</span>
        <Tag color={defaultValue ? 'green' : 'default'}>{String(defaultValue)}</Tag>
        {defaultDirty && (
          <Alert type="warning" showIcon message="基本设置中有未生效草稿" style={{ marginLeft: 8 }} />
        )}
      </div>

      <Modal
        title={editing === null ? '添加规则' : '编辑规则'}
        open={editing !== undefined}
        okText="确认"
        cancelText="取消"
        okButtonProps={{ style: { background: 'var(--brand, #ff7d41)', borderColor: 'var(--brand, #ff7d41)' } }}
        onCancel={() => setEditing(undefined)}
        onOk={async () => {
          try {
            const values = await form.validateFields();
            const rule: Rule = {
              ...values,
              expected_value: parseExpected(values.operator, values.expected_value),
              priority: (editing ?? rules.length) + 1,
            };
            onChange(
              editing === null
                ? [...rules, rule]
                : rules.map((old, index) => (index === editing ? { ...old, ...rule } : old))
            );
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
            ? '清空后所有流量将回退为默认返回值，此改动将在保存后生效'
            : '此改动将在保存后生效'}
        </p>
      </Modal>
    </div>
  );
};
