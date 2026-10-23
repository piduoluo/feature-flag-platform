import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate, useBlocker, useLocation, Navigate } from 'react-router-dom';
import { Alert, Button, Card, Divider, Form, Input, message, Modal, Space, Spin, Switch, Tabs, Typography } from 'antd';
import { api } from '../api/client';
import { Flag, Rule, UpdateFlagPayload } from '../types';
import { DetailBackNav } from '../components/DetailBackNav';
import { RuleWorkspace } from '../components/RuleWorkspace';
import { FlagAuditHistoryTab } from '../components/FlagAuditHistoryTab';
import { BooleanValueTag, EnvironmentBadge, StatusBadge } from '../components/EnvironmentBadge';
import { rulesEqual, rulePayload } from './ruleDraft';
import { EvaluationEntryState, readNavSource } from '../navigation';
import { toast } from '../utils/toast';

const basicValues = (flag: Flag): UpdateFlagPayload => ({
  name: flag.name,
  description: flag.description,
  default_value: flag.default_value,
});

const DETAIL_TABS = ['rules', 'audit', 'settings'] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

const isDetailTab = (value: unknown): value is DetailTab =>
  typeof value === 'string' && (DETAIL_TABS as readonly string[]).includes(value);

export const FlagDetailPage: React.FC = () => {
  const { id, tab } = useParams();
  const [query] = useSearchParams();
  const location = useLocation();
  const state = location.state;

  // Legacy path URLs such as /flags/42/audit used to be separate history
  // entries. Normalize them once through the same one-shot ?tab= entry that
  // bookmarks use; the workspace then strips the query.
  if (isDetailTab(tab)) {
    const next = new URLSearchParams(query);
    next.set('tab', tab);
    return (
      <Navigate
        to={`/flags/${id}${next.toString() ? `?${next.toString()}` : ''}`}
        replace
        state={state}
      />
    );
  }

  const queryTab = query.get('tab');
  const initialTab: DetailTab = isDetailTab(queryTab) ? queryTab : 'rules';

  return <FlagWorkspace key={id} id={Number(id)} initialTab={initialTab} />;
};

const FlagWorkspace: React.FC<{ id: number; initialTab: DetailTab }> = ({ id, initialTab }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const bypass = useRef(false);
  const [evaluationPrompt, setEvaluationPrompt] = useState(false);
  const [query, setQuery] = useSearchParams();
  const [activeTab, setActiveTab] = useState<DetailTab>(initialTab);
  const navState = readNavSource(location.state);
  const backTarget = navState.from;
  const backLabel = navState.fromLabel ?? '功能开关';
  const [savedFlag, setSavedFlag] = useState<Flag>();
  const [basicDraft, setBasicDraft] = useState<UpdateFlagPayload>();
  const [rulesDraft, setRulesDraft] = useState<Rule[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [auditRefreshToken, setAuditRefreshToken] = useState(0);
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

  // Tabs are view state of this record, not separate pages: switching them
  // must not push history entries or discard either draft.
  const changeTab = (key: string) => {
    if (isDetailTab(key)) setActiveTab(key);
  };

  const goBackToSource = () => {
    const historyIndex = (window.history.state as { idx?: number } | null)?.idx;
    if (backTarget && typeof historyIndex === 'number' && historyIndex > 0) {
      navigate(-1);
      return;
    }
    navigate(backTarget ?? '/flags');
  };

  // Strip a legacy ?tab=... query without adding a history entry. The tab is
  // already captured in activeTab above.
  useEffect(() => {
    if (!query.has('tab')) return;
    const next = new URLSearchParams(query);
    next.delete('tab');
    setQuery(next, { replace: true, state: location.state });
  }, [query, setQuery]);

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
    const entryState: EvaluationEntryState = { fromFlagDetail: { path: `/flags/${id}` } };
    navigate(
      `/evaluations?${new URLSearchParams({
        flag_key: savedFlag.key,
        environment: savedFlag.environment,
      })}`,
      { state: entryState }
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
    setAuditRefreshToken((token) => token + 1);
    message.success('基本设置已保存');
    toast('基本设置已保存', 'success');
  }

  async function saveRules() {
    if (!isRulesDirty) return;
    const updated = await api.syncRules(id, rulePayload(rules));
    setSavedFlag((previous) => (previous ? { ...previous, rules: updated ?? [] } : previous));
    setRulesDraft(undefined);
    setAuditRefreshToken((token) => token + 1);
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
      <div data-testid="flag-detail-page" className="detail-page" style={{ maxWidth: 1400, margin: '0 auto' }}>
        <DetailBackNav label={backLabel} onClick={goBackToSource} />
        {error ? <Alert type="error" message={error} /> : <Spin />}
      </div>
    );
  }

  return (
    <div data-testid="flag-detail-page" className="detail-page" style={{ maxWidth: 1400, margin: '0 auto' }}>
      <DetailBackNav label={backLabel} onClick={goBackToSource} />
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}

      {/* Detail Head */}
      <div className="detail-head" style={{ marginBottom: 20 }}>
        <div className="detail-head-row" data-testid="detail-head-row">
          <div className="detail-main">
            <div className="detail-title-row" data-testid="detail-title-row">
              <Typography.Title level={3} style={{ margin: 0 }}>
                {savedFlag.name}
              </Typography.Title>
              <EnvironmentBadge environment={savedFlag.environment} />
              <StatusBadge enabled={savedFlag.enabled} />
            </div>
            <div className="detail-sub">
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
            </div>
          </div>

          <div className="detail-side" data-testid="detail-actions">
            <Space>
              <span className="detail-switch-label">启停控制</span>
              <Switch
                aria-label="启停控制"
                checked={savedFlag.enabled}
                loading={busy}
                disabled={busy}
                onChange={(enabled) =>
                  run(async () => {
                    setSavedFlag(await api.toggleFlag(id, enabled));
                    setAuditRefreshToken((token) => token + 1);
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
              style={{ background: 'var(--brand, #FF6400)', borderColor: 'var(--brand, #FF6400)' }}
            >
              前往在线评估
            </Button>
          </div>
        </div>

        <div className="detail-meta" data-testid="detail-meta">
          规则总数：<strong>{savedFlag.rules?.length ?? 0}</strong>
          <span aria-hidden>·</span>
          配置默认值：<BooleanValueTag value={savedFlag.default_value} />
          <span className="detail-default-hint">
            {savedFlag.enabled ? '未命中规则时返回该值' : '停用期间评估始终返回 false'}
          </span>
          <span aria-hidden>·</span>
          最后修改：{new Date(savedFlag.updated_at).toLocaleString('zh-CN')}
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={changeTab}
        items={[
          {
            key: 'rules',
            label: `规则配置${isRulesDirty ? ' *' : ''}`,
            children: (
              <RuleWorkspace
                rules={rules}
                onChange={setRulesDraft}
                defaultDirty={basic?.default_value !== savedFlag.default_value}
                flagEnabled={savedFlag.enabled}
                disabled={busy}
              />
            ),
          },
          {
            key: 'audit',
            label: '变更历史',
            children: <FlagAuditHistoryTab flagId={id} refreshToken={auditRefreshToken} />,
          },
          {
            key: 'settings',
            label: `基本设置${isBasicDirty ? ' *' : ''}`,
            forceRender: true,
            children: (
              <Card variant="borderless" className="detail-settings-card">
                <Form
                  form={form}
                  layout="vertical"
                  disabled={busy}
                  onValuesChange={(_, values) => setBasicDraft(values)}
                  className="detail-settings-form"
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
                    <Input.TextArea rows={3} placeholder="输入 Flag 描述" />
                  </Form.Item>
                  <Divider className="detail-settings-divider" />
                  <Form.Item name="default_value" label="默认返回值" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                  <Button
                    type="primary"
                    loading={busy}
                    disabled={!isBasicDirty || busy}
                    onClick={() => run(saveBasic)}
                    style={{ background: 'var(--brand, #FF6400)', borderColor: 'var(--brand, #FF6400)' }}
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
              <span className="dot on" style={{ background: 'var(--brand, #FF6400)' }} />
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
                style={{ background: 'var(--brand, #FF6400)', borderColor: 'var(--brand, #FF6400)' }}
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
          <Button key="save" type="primary" onClick={() => run(saveAndEvaluate)} style={{ background: 'var(--brand, #FF6400)', borderColor: 'var(--brand, #FF6400)' }}>
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
