import React, { useState } from 'react';
import { Alert, Button, Card, Empty, Form, Input, Modal, Select, Space, Switch, Tag } from 'antd';
import { Rule } from '../types';
import { moveRule, parseExpected } from '../pages/ruleDraft';

interface Props {
  rules: Rule[];
  onChange: (rules: Rule[]) => void;
  defaultValue: boolean;
  defaultDirty: boolean;
  disabled: boolean;
}
export const RuleWorkspace: React.FC<Props> = ({ rules, onChange, defaultValue, defaultDirty, disabled }) => {
  const [editing, setEditing] = useState<number | null>();
  const [confirmDelete, setConfirmDelete] = useState<number | 'all'>();
  const [form] = Form.useForm();
  const edit = (index: number | null) => {
    const rule = index === null ? { attribute_name: '', operator: 'equals', expected_value: '', return_value: true } : rules[index];
    form.setFieldsValue({ ...rule, expected_value: JSON.stringify(rule.expected_value) });
    setEditing(index);
  };
  return <Space direction="vertical" size="middle" style={{ width: '100%' }}>
    <Space><Button disabled={disabled} onClick={() => edit(null)}>添加规则</Button>
      <Button danger disabled={disabled || !rules.length} onClick={() => setConfirmDelete('all')}>清空全部规则</Button></Space>
    {!rules.length && <Empty description="当前暂无灰度规则，将直接返回默认值" />}
    {rules.map((rule, index) => <Card key={rule.id ?? `draft-${index}`} title={`规则 ${String(index + 1).padStart(2, '0')}`}>
      <Space wrap><strong>{rule.attribute_name}</strong><Tag>{rule.operator}</Tag><code>{JSON.stringify(rule.expected_value)}</code><span>命中返回值：{String(rule.return_value)}</span></Space>
      <div><Space>
        <Button aria-label={`上移规则 ${index + 1}`} disabled={disabled || index === 0} onClick={() => onChange(moveRule(rules, index, -1))}>上移</Button>
        <Button aria-label={`下移规则 ${index + 1}`} disabled={disabled || index === rules.length - 1} onClick={() => onChange(moveRule(rules, index, 1))}>下移</Button>
        <Button disabled={disabled} onClick={() => edit(index)}>编辑规则</Button>
        <Button danger disabled={disabled} onClick={() => setConfirmDelete(index)}>删除规则</Button>
      </Space></div>
    </Card>)}
    <Card title="默认返回值（已生效）"><Tag>{String(defaultValue)}</Tag>{defaultDirty && <Alert type="warning" message="基本设置中有未生效草稿" />}</Card>
    <Modal title={editing === null ? '添加规则' : '编辑规则'} open={editing !== undefined} okText="确认" cancelText="取消" onCancel={() => setEditing(undefined)} onOk={async () => {
      try {
        const values = await form.validateFields();
        const rule: Rule = { ...values, expected_value: parseExpected(values.operator, values.expected_value), priority: (editing ?? rules.length) + 1 };
        onChange(editing === null ? [...rules, rule] : rules.map((old, index) => index === editing ? { ...old, ...rule } : old));
        setEditing(undefined);
      } catch { /* Form displays validation errors. */ }
    }}>
      <Form form={form} layout="vertical">
        <Form.Item name="attribute_name" label="属性名" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
        <Form.Item name="operator" label="操作符"><Select options={[{ value: 'equals' }, { value: 'in' }]} /></Form.Item>
        <Form.Item name="expected_value" label="期望值（JSON）" dependencies={['operator']} rules={[{ validator: async (_, value) => { parseExpected(form.getFieldValue('operator'), value); } }]}><Input.TextArea /></Form.Item>
        <Form.Item name="return_value" label="命中返回值" valuePropName="checked"><Switch /></Form.Item>
      </Form>
    </Modal>
    <Modal title={confirmDelete === 'all' ? '清空全部规则？' : '删除规则？'} open={confirmDelete !== undefined} okText="确认删除" cancelText="取消" okButtonProps={{ danger: true }} onCancel={() => setConfirmDelete(undefined)} onOk={() => {
      onChange(confirmDelete === 'all' ? [] : rules.filter((_, index) => index !== confirmDelete)); setConfirmDelete(undefined);
    }}><p>{confirmDelete === 'all' || rules.length === 1 ? '清空后所有流量将回退为默认返回值，此改动将在保存后生效' : '此改动将在保存后生效'}</p></Modal>
  </Space>;
};
