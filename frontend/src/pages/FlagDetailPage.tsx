import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate, useBlocker } from 'react-router-dom';
import { Alert, Button, Card, Form, Input, message, Modal, Space, Spin, Switch, Tabs, Typography } from 'antd';
import { api } from '../api/client';
import { Flag, Rule, UpdateFlagPayload } from '../types';
import { RuleWorkspace } from '../components/RuleWorkspace';
import { FlagAuditHistoryTab } from '../components/FlagAuditHistoryTab';
import { BooleanValueTag, EnvironmentBadge } from '../components/EnvironmentBadge';
import { rulesEqual, rulePayload } from './ruleDraft';
import { toast } from '../utils/toast';

const basicValues = (flag: Flag): UpdateFlagPayload => ({
  name: flag.name,
  description: flag.description,
  default_value: flag.default_value,
});

export const FlagDetailPage: React.FC = () => {
  const { id, tab } = useParams();
  return <FlagWorkspace key={id} id={Number(id)} paramTab={tab} />;
};

const FlagWorkspace: React.FC<{ id: number; paramTab?: string }> = ({ id, paramTab }) => {
  const navigate = useNavigate();
  const bypass = useRef(false);
  const [evaluationPrompt, setEvaluationPrompt] = useState(false);
  const [query, setQuery] = useSearchParams();
  const tab = ['rules', 'audit', 'settings'].includes(paramTab || query.get('tab') || '')
    ? (paramTab || query.get('tab')!)
    : 'rules';
  const [savedFlag, setSavedFlag] = useState<Flag>();
  const [basicDraft, setBasicDraft] = useState<UpdateFlagPayload>();
  const [rulesDraft, setRulesDraft] = useState<Rule[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [form] = Form.useForm();

  useEffect(() => {
    let active = true;
    api
      .getFlag(id)
      .then((flag) => {
        if (active) {
          setSavedFlag({
            ...flag,
            rules: [...(flag.rules ?? [])].sort((a, b) => a.priority - b.priority),
          });
        }
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [id]);

  const basic = basicDraft ?? (savedFlag ? basicValues(savedFlag) : undefined);
  useEffect(() => {
    if (basic) form.setFieldsValue(basic);
  }, [basic, form]);

  const changeTab = (key: string) => {
    if (paramTab) {
      navigate(`/flags/${id}/${key}`);
    } else {
      setQuery((previous) => {
        const next = new URLSearchParams(previous);
        next.set('tab', key);
        return next;
      });
    }
  };

  const isBasicDirty = !!savedFlag && JSON.stringify(basic) !== JSON.stringify(basicValues(savedFlag));
  const rules = rulesDraft ?? savedFlag?.rules ?? [];
  const isRulesDirty = !!savedFlag && !rulesEqual(rules, savedFlag.rules ?? []);
  const hasUnsavedChanges = isBasicDirty || isRulesDirty;

  const blocker = useBlocker(
    ({ nextLocation }) =>
      !bypass.current &&
      (hasUnsavedChanges || pending.current) &&
      !nextLocation.pathname.startsWith(`/flags/${id}`)
  );

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges || pending.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);

  function goEvaluate() {
    if (!savedFlag) return;
    bypass.current = true;
    navigate(
      `/evaluations?${new URLSearchParams({
        flag_key: savedFlag.key,
        environment: savedFlag.environment,
      })}`
    );
  }

  async function saveAndEvaluate() {
    setEvaluationPrompt(false);
    if (isBasicDirty) {
      try {
        await saveBasic();
      } catch (err) {
        changeTab('settings');
        throw err;
      }
    }
    if (isRulesDirty) {
      try {
        await saveRules();
      } catch (err) {
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
    toast('基本设置已保存', 'success');
  }

  async function saveRules() {
    if (!isRulesDirty) return;
    const updated = await api.syncRules(id, rulePayload(rules));
    setSavedFlag((previous) => (previous ? { ...previous, rules: updated ?? [] } : previous));
    setRulesDraft(undefined);
    message.success('规则配置已保存');
    toast('规则配置已保存', 'success');
  }

  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : '请检查表单输入');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (!savedFlag) {
    return (
      <div data-testid="flag-detail-page">
        {error ? <Alert type="error" message={error} /> : <Spin />}
      </div>
    );
  }

  return (
    <div data-testid="flag-detail-page" className="detail-page" style={{ maxWidth: 1400, margin: '0 auto' }}>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      {/* Detail Head */}
      <div className="detail-head" style={{ marginBottom: 20 }}>
        <div className="detail-head-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div className="detail-main">
            <div className="detail-title-row" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Typography.Title level={3} style={{ margin: 0, fontWeight: 700 }}>
                {savedFlag.name}
              </Typography.Title>
              <EnvironmentBadge environment={savedFlag.environment} />
            </div>
            <div className="detail-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <Typography.Text
                code
                copyable={{
                  onCopy: () => {
                    toast(`已复制: ${savedFlag.key}`, 'success');
                  },
                }}
              >
                {savedFlag.key}
              </Typography.Text>
              <span className="sep" style={{ color: '#d6d0ca' }}>·</span>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                最后更新：{new Date(savedFlag.updated_at).toLocaleString('zh-CN')}
              </Typography.Text>
            </div>
            <div className="detail-meta" style={{ marginTop: 12, fontSize: 13, color: '#6d6761', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <span>规则总数：<strong style={{ color: '#3f3b37', fontWeight: 600 }}>{savedFlag.rules?.length ?? 0}</strong></span>
              <span style={{ color: '#8a8580' }}>·</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                已生效默认返回值：<BooleanValueTag value={savedFlag.default_value} />
              </span>
              <span style={{ color: '#8a8580' }}>·</span>
              <span>最后修改：{new Date(savedFlag.updated_at).toLocaleString('zh-CN')}</span>
            </div>
          </div>

          <div className="detail-side" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Space>
              <span className="detail-switch-label" style={{ fontSize: 13, color: '#5f5a55' }}>启停控制</span>
              <Switch
                aria-label="启停控制"
                checked={savedFlag.enabled}
                loading={busy}
                disabled={busy}
                onChange={(enabled) =>
                  run(async () => {
                    setSavedFlag(await api.toggleFlag(id, enabled));
                    message.success('启停状态已更新');
                    toast('启停状态已更新', 'success');
                  })
                }
              />
            </Space>
            <Button
              type="primary"
              disabled={busy}
              onClick={() => (hasUnsavedChanges ? setEvaluationPrompt(true) : goEvaluate())}
              style={{ background: 'var(--brand, #ff7d41)', borderColor: 'var(--brand, #ff7d41)' }}
            >
              前往在线评估
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        activeKey={tab}
        onChange={changeTab}
        items={[
          {
            key: 'rules',
            label: `规则配置${isRulesDirty ? ' *' : ''}`,
            children: (
              <RuleWorkspace
                rules={rules}
                onChange={setRulesDraft}
                defaultValue={savedFlag.default_value}
                defaultDirty={basic?.default_value !== savedFlag.default_value}
                disabled={busy}
              />
            ),
          },
          {
            key: 'audit',
            label: '变更历史',
            children: <FlagAuditHistoryTab flagId={id} />,
          },
          {
            key: 'settings',
            label: `基本设置${isBasicDirty ? ' *' : ''}`,
            forceRender: true,
            children: (
              <Card variant="borderless" style={{ borderRadius: 8, padding: '8px 0' }}>
                <Form
                  form={form}
                  layout="vertical"
                  disabled={busy}
                  onValuesChange={(_, values) => setBasicDraft(values)}
                  style={{ maxWidth: 600 }}
                >
                  <Form.Item
                    name="name"
                    label="Flag 名称"
                    rules={[
                      { required: true, whitespace: true, message: '请输入 Flag 名称' },
                      { max: 255, message: '名称不能超过 255 个字符' },
                    ]}
                  >
                    <Input placeholder="输入 Flag 名称" />
                  </Form.Item>
                  <Form.Item name="description" label="描述">
                    <Input.TextArea rows={3} placeholder="输入 Flag 描述" maxLength={500} showCount />
                  </Form.Item>
                  <Form.Item name="default_value" label="默认返回值" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                  <Button
                    type="primary"
                    loading={busy}
                    disabled={!isBasicDirty || busy}
                    onClick={() => run(saveBasic)}
                    style={{ background: 'var(--brand, #ff7d41)', borderColor: 'var(--brand, #ff7d41)' }}
                  >
                    保存设置
                  </Button>
                </Form>
              </Card>
            ),
          },
        ]}
      />

      {/* Floating Dirty Bar */}
      <div
        aria-hidden={!isRulesDirty}
        style={{
          position: 'sticky',
          bottom: 16,
          zIndex: 30,
          display: 'grid',
          gridTemplateRows: isRulesDirty ? '1fr' : '0fr',
          opacity: isRulesDirty ? 1 : 0,
          visibility: isRulesDirty ? 'visible' : 'hidden',
          transition: 'grid-template-rows 180ms, opacity 180ms, visibility 180ms',
        }}
      >
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div className="dirty-bar">
            <div className="dirty-bar-text">
              <span className="dot on" style={{ background: 'var(--brand, #ff7d41)' }} />
              <span>规则配置有未保存修改</span>
            </div>
            <div className="dirty-bar-actions">
              <Button disabled={busy || !isRulesDirty} onClick={() => setRulesDraft(undefined)}>
                放弃修改
              </Button>
              <Button
                type="primary"
                loading={busy}
                disabled={busy || !isRulesDirty}
                onClick={() => run(saveRules)}
                style={{ background: 'var(--brand, #ff7d41)', borderColor: 'var(--brand, #ff7d41)' }}
              >
                保存规则配置
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal
        title="前往评估前处理未保存修改"
        open={evaluationPrompt}
        onCancel={() => setEvaluationPrompt(false)}
        footer={[
          <Button key="stay" onClick={() => setEvaluationPrompt(false)}>
            继续留在本页编辑
          </Button>,
          <Button
            key="discard"
            onClick={() => {
              setBasicDraft(undefined);
              setRulesDraft(undefined);
              goEvaluate();
            }}
          >
            放弃修改并前往
          </Button>,
          <Button key="save" type="primary" onClick={() => run(saveAndEvaluate)} style={{ background: 'var(--brand, #ff7d41)', borderColor: 'var(--brand, #ff7d41)' }}>
            保存并前往
          </Button>,
        ]}
      >
        <p>未生效数据域：{[isBasicDirty && '基本设置', isRulesDirty && '规则配置'].filter(Boolean).join('、')}</p>
      </Modal>

      <Modal
        title="离开当前 Flag？"
        open={blocker.state === 'blocked'}
        onCancel={() => blocker.reset?.()}
        footer={[
          <Button key="stay" onClick={() => blocker.reset?.()}>
            继续编辑
          </Button>,
          <Button key="leave" danger disabled={busy} onClick={() => blocker.proceed?.()}>
            放弃修改并离开
          </Button>,
        ]}
      >
        <p>{busy ? '正在保存，请等待请求结束。' : '离开将丢弃未保存的基本设置与规则草稿。'}</p>
      </Modal>
    </div>
  );
};
