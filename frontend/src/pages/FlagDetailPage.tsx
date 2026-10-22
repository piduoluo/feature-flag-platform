import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate, useBlocker } from 'react-router-dom';
import { Alert, Button, Card, Form, Input, message, Modal, Space, Spin, Switch, Tabs, Tag, Typography } from 'antd';
import { api } from '../api/client';
import { Flag, Rule, UpdateFlagPayload } from '../types';

import { RuleWorkspace } from '../components/RuleWorkspace';
import { rulesEqual, rulePayload } from './ruleDraft';

const basicValues = (flag: Flag): UpdateFlagPayload => ({ name: flag.name, description: flag.description, default_value: flag.default_value });

export const FlagDetailPage: React.FC = () => {
  const { id } = useParams();
  return <FlagWorkspace key={id} id={Number(id)} />;
};

const FlagWorkspace: React.FC<{ id: number }> = ({ id }) => {
  const navigate = useNavigate();
  const bypass = useRef(false);
  const [evaluationPrompt, setEvaluationPrompt] = useState(false);
  const [query, setQuery] = useSearchParams();
  const tab = ['rules', 'audit', 'settings'].includes(query.get('tab') || '') ? query.get('tab')! : 'rules';
  const [savedFlag, setSavedFlag] = useState<Flag>();
  const [basicDraft, setBasicDraft] = useState<UpdateFlagPayload>();
  const [rulesDraft, setRulesDraft] = useState<Rule[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [form] = Form.useForm();
  useEffect(() => {
    let active = true;
    api.getFlag(id).then(flag => {
      if (active) setSavedFlag({ ...flag, rules: [...(flag.rules ?? [])].sort((a, b) => a.priority - b.priority) });
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [id]);
  const basic = basicDraft ?? (savedFlag ? basicValues(savedFlag) : undefined);
  useEffect(() => { if (basic) form.setFieldsValue(basic); }, [basic, form]);
  const changeTab = (key: string) => setQuery(previous => { const next = new URLSearchParams(previous); next.set('tab', key); return next; });
  const isBasicDirty = !!savedFlag && JSON.stringify(basic) !== JSON.stringify(basicValues(savedFlag));
  const rules = rulesDraft ?? savedFlag?.rules ?? [];
  const isRulesDirty = !!savedFlag && !rulesEqual(rules, savedFlag.rules ?? []);
  const hasUnsavedChanges = isBasicDirty || isRulesDirty;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !bypass.current && (hasUnsavedChanges || pending.current) && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges || pending.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);
  function goEvaluate() {
    if (!savedFlag) return;
    bypass.current = true;
    navigate(`/evaluations?${new URLSearchParams({ flag_key: savedFlag.key, environment: savedFlag.environment })}`);
  }
  async function saveAndEvaluate() {
    setEvaluationPrompt(false);
    if (isBasicDirty) {
      try { await saveBasic(); } catch (err) { changeTab('settings'); throw err; }
    }
    if (isRulesDirty) {
      try { await saveRules(); } catch (err) {
        changeTab('rules');
        const detail = err instanceof Error ? err.message : '保存失败';
        throw new Error(`${isBasicDirty ? '基本设置已保存，但' : ''}规则配置保存失败，规则草稿已保留：${detail}`);
      }
    }
    goEvaluate();
  }
  async function saveBasic() {
    if (!savedFlag || !isBasicDirty) return;
    const values = await form.validateFields();
    const updated = await api.updateFlag(id, values);
    setSavedFlag(updated);
    setBasicDraft(undefined);
    message.success('基本设置已保存');
  }
  async function saveRules() {
    if (!isRulesDirty) return;
    const updated = await api.syncRules(id, rulePayload(rules));
    setSavedFlag(previous => previous ? { ...previous, rules: updated ?? [] } : previous);
    setRulesDraft(undefined);
    message.success('规则配置已保存');
  }
  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : '请检查表单输入'); }
    finally { pending.current = false; setBusy(false); }
  }
  if (!savedFlag) return <div data-testid="flag-detail-page">{error ? <Alert type="error" message={error} /> : <Spin />}</div>;
  return <div data-testid="flag-detail-page">
    {error && <Alert type="error" showIcon message={error} />}
    <Card>
      <Space><Typography.Title level={3}>{savedFlag.name}</Typography.Title><Tag>{savedFlag.environment}</Tag></Space>
      <Space><Typography.Text code copyable={{ onCopy: () => message.success('Key 已复制') }}>{savedFlag.key}</Typography.Text><Typography.Text type="secondary">最后更新：{new Date(savedFlag.updated_at).toLocaleString('zh-CN')}</Typography.Text></Space>
      <Space><span>启停控制</span><Switch aria-label="启停控制" checked={savedFlag.enabled} loading={busy} disabled={busy} onChange={enabled => run(async () => { setSavedFlag(await api.toggleFlag(id, enabled)); message.success('启停状态已更新'); })} /></Space>
      <Button disabled={busy} onClick={() => hasUnsavedChanges ? setEvaluationPrompt(true) : goEvaluate()}>前往在线评估</Button>
      <p>规则总数：{savedFlag.rules?.length ?? 0} · 已生效默认返回值：<Tag color="blue">{String(savedFlag.default_value)}</Tag> · 最后修改：{new Date(savedFlag.updated_at).toLocaleString('zh-CN')}</p>
    </Card>
    <Tabs activeKey={tab} onChange={changeTab} items={[
      { key: 'rules', label: `规则配置${isRulesDirty ? ' *' : ''}`, children: <RuleWorkspace rules={rules} onChange={setRulesDraft} defaultValue={savedFlag.default_value} defaultDirty={basic?.default_value !== savedFlag.default_value} disabled={busy} /> },
      { key: 'audit', label: '变更历史', children: <Card>变更历史暂未开放。</Card> },
      { key: 'settings', label: `基本设置${isBasicDirty ? ' *' : ''}`, forceRender: true, children:
        <Form form={form} layout="vertical" disabled={busy} onValuesChange={(_, values) => setBasicDraft(values)}>
          <Form.Item name="name" label="Flag 名称" rules={[{ required: true, whitespace: true, message: '请输入 Flag 名称' }, { max: 255 }]}><Input /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea /></Form.Item>
          <Form.Item name="default_value" label="默认返回值" valuePropName="checked"><Switch /></Form.Item>
          <Button type="primary" loading={busy} disabled={!isBasicDirty || busy} onClick={() => run(saveBasic)}>保存设置</Button>
        </Form> },
    ]} />
    <div aria-hidden={!isRulesDirty} style={{ position: 'sticky', bottom: 16, display: 'grid', gridTemplateRows: isRulesDirty ? '1fr' : '0fr', opacity: isRulesDirty ? 1 : 0, visibility: isRulesDirty ? 'visible' : 'hidden', transition: 'grid-template-rows 180ms, opacity 180ms, visibility 180ms' }}><div style={{ overflow: 'hidden', minHeight: 0 }}><Card style={{ boxShadow: '0 4px 16px #0002' }}>
      <Space><span>规则配置有未保存修改</span><Button disabled={busy || !isRulesDirty} onClick={() => setRulesDraft(undefined)}>放弃修改</Button>
        <Button type="primary" loading={busy} disabled={busy || !isRulesDirty} onClick={() => run(saveRules)}>保存规则配置</Button></Space>
    </Card></div></div>
    <Modal title="前往评估前处理未保存修改" open={evaluationPrompt} onCancel={() => setEvaluationPrompt(false)} footer={[
      <Button key="stay" onClick={() => setEvaluationPrompt(false)}>继续留在本页编辑</Button>,
      <Button key="discard" onClick={() => { setBasicDraft(undefined); setRulesDraft(undefined); goEvaluate(); }}>放弃修改并前往</Button>,
      <Button key="save" type="primary" onClick={() => run(saveAndEvaluate)}>保存并前往</Button>,
    ]}><p>未生效数据域：{[isBasicDirty && '基本设置', isRulesDirty && '规则配置'].filter(Boolean).join('、')}</p></Modal>
    <Modal title="离开当前 Flag？" open={blocker.state === 'blocked'} onCancel={() => blocker.reset?.()} footer={[
      <Button key="stay" onClick={() => blocker.reset?.()}>继续编辑</Button>,
      <Button key="leave" danger disabled={busy} onClick={() => blocker.proceed?.()}>放弃修改并离开</Button>,
    ]}><p>{busy ? '正在保存，请等待请求结束。' : '离开将丢弃未保存的基本设置与规则草稿。'}</p></Modal>
  </div>;
};
