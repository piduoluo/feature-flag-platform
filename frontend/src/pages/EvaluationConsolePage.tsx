import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useLocation, Link } from 'react-router-dom';
import { Select, AutoComplete, Button } from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleFilled,
  CloseOutlined,
  ExclamationCircleFilled,
  ExclamationCircleOutlined,
  FlagOutlined,
  InfoCircleFilled,
  PlayCircleOutlined,
  SearchOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { Environment, EvaluationResult, Flag } from '../types';
import { api, ApiError } from '../api/client';
import { parseJson, stringifyJson } from '../utils/json';
import { JsonContextEditor } from '../components/JsonContextEditor';
import './EvaluationConsolePage.css';

const ENV_LABELS: Record<Environment, string> = {
  development: 'Development (开发环境)',
  staging: 'Staging (预发环境)',
  production: 'Production (生产环境)',
};

function isEnvironment(value: string | null): value is Environment {
  return value === 'development' || value === 'staging' || value === 'production';
}

/**
 * Seeds the console from a deep link such as
 * `/evaluations?flag_key=ai_ride_assistant_enabled&environment=production&flag_id=1`.
 * Unknown or malformed parameters are ignored instead of failing the page.
 */
function resolveEntryQuery(searchParams: URLSearchParams) {
  const environmentParam = searchParams.get('environment') || searchParams.get('env');
  const flagKey = (searchParams.get('flag_key') || searchParams.get('key') || '').trim();
  const flagIdParam = searchParams.get('flag_id') || '';
  const flagId = /^\d+$/.test(flagIdParam) ? Number(flagIdParam) : null;

  return {
    environment: isEnvironment(environmentParam) ? environmentParam : 'development',
    flagKey,
    flagId,
    hasEntryContext: Boolean(flagKey) || isEnvironment(environmentParam),
  };
}

const DEFAULT_SAMPLE_CONTEXT = JSON.stringify(
  {
    country: 'CN',
    plan: 'premium',
    vip_level: 2,
  },
  null,
  2
);

interface ContextInputCheck {
  isValid: boolean;
  parsed: Record<string, unknown> | null;
  reason: string | null;
  line: number | null;
  isEmpty: boolean;
}

/** Line number of the first occurrence of a character outside a JSON string. */
function lineOfFirstToken(source: string, token: string): number | null {
  let inString = false;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === token) {
      return source.slice(0, index).split('\n').length;
    }
  }
  return null;
}

/**
 * Locates the offending line using the position V8 reports. Some syntax errors
 * only name the offending token, and "Unexpected end of JSON input" belongs to
 * the last line.
 */
function contextErrorLine(source: string, message: string): number | null {
  const lineMatch = /line (\d+) column \d+/.exec(message);
  if (lineMatch) {
    return Number(lineMatch[1]);
  }
  const positionMatch = /at position (\d+)/.exec(message);
  if (positionMatch) {
    return source.slice(0, Number(positionMatch[1])).split('\n').length;
  }
  // Bare-word values (e.g. `CN` or `undefined`) are reported as a token but
  // with no position; punctuation tokens are skipped because the first
  // occurrence is not necessarily the offending one.
  const tokenMatch = /Unexpected token '([A-Za-z_$])'/.exec(message);
  if (tokenMatch) {
    return lineOfFirstToken(source, tokenMatch[1]);
  }
  if (/end of (JSON )?input/i.test(message)) {
    return source.split('\n').length;
  }
  return null;
}

/**
 * Validates the context JSON on every keystroke so the submit button can be
 * blocked before a malformed payload ever reaches the evaluation API.
 */
function parseContextInput(source: string): ContextInputCheck {
  const trimmed = source.trim();
  if (!trimmed) {
    return { isValid: true, parsed: {}, reason: null, line: null, isEmpty: true };
  }
  try {
    const parsed = parseJson(trimmed);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {
        isValid: false,
        parsed: null,
        reason: '上下文必须是一个 JSON 对象，例如 {"plan": "premium"}',
        line: 1,
        isEmpty: false,
      };
    }
    return { isValid: true, parsed: parsed as Record<string, unknown>, reason: null, line: null, isEmpty: false };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      isValid: false,
      parsed: null,
      reason: message.replace(/ in JSON at position \d+( \(line \d+ column \d+\))?$/, ''),
      line: contextErrorLine(trimmed, message),
      isEmpty: false,
    };
  }
}

type VerdictTone = 'green' | 'amber' | 'blue' | 'neutral';

interface VerdictProps {
  tone: VerdictTone;
  testId: string;
  icon: React.ReactNode;
  title: string;
  tag: string;
  description: React.ReactNode;
  children?: React.ReactNode;
}

/** Shared decision panel: icon, verdict title + reason tag, copy and payload. */
const Verdict: React.FC<VerdictProps> = ({
  tone,
  testId,
  icon,
  title,
  tag,
  description,
  children,
}) => (
  <section className={`evalc-verdict evalc-verdict--${tone}`} data-testid={testId}>
    <span className="evalc-verdict-icon" aria-hidden="true">
      {icon}
    </span>
    <div className="evalc-verdict-main">
      <div className="evalc-verdict-head">
        <h3 className="evalc-verdict-title">{title}</h3>
        <span className="evalc-verdict-tag">{tag}</span>
      </div>
      <p className="evalc-verdict-desc">{description}</p>
      {children}
    </div>
  </section>
);

interface ValueCardProps {
  label: string;
  value: string;
  tone: 'green' | 'red' | 'muted';
  pill: string;
  dangerPill?: boolean;
}

const ValueCard: React.FC<ValueCardProps> = ({ label, value, tone, pill, dangerPill }) => (
  <div className="evalc-value-card">
    <div>
      <div className="evalc-value-label">{label}</div>
      <div className={`evalc-value evalc-value--${tone}`}>{value}</div>
    </div>
    <span className={`evalc-value-pill${dangerPill ? ' evalc-value-pill--danger' : ''}`}>{pill}</span>
  </div>
);

/** Empty inbox illustration from the mock: tray, lid notch and sun rays. */
const InboxIllustration: React.FC = () => (
  <svg
    className="evalc-empty-icon"
    viewBox="0 0 120 120"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <ellipse cx="60" cy="99" rx="33" ry="4.5" fill="#e7edf6" />
    <g stroke="currentColor" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M60 8v13" opacity=".92" />
      <path d="M42.5 13.5 36 23" opacity=".62" />
      <path d="M77.5 13.5 84 23" opacity=".62" />
      <path d="M26 50 44 34h32l18 16" />
      <path d="M26 50h22l4 7h16l4-7h22v38a8 8 0 0 1-8 8H34a8 8 0 0 1-8-8V50Z" />
    </g>
  </svg>
);

export const EvaluationConsolePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const [entry] = useState(() => resolveEntryQuery(searchParams));

  const [environment, setEnvironment] = useState<Environment>(entry.environment);
  const [flagKey, setFlagKey] = useState<string>(entry.flagKey);
  const [contextText, setContextText] = useState<string>('');
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loadingFlags, setLoadingFlags] = useState(false);

  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<EvaluationResult | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const evaluatingRef = useRef(false);
  const flagRequestRef = useRef(0);

  const selectedFlag = flags.find((flag) => flag.key === flagKey);
  const unchangedEntry = environment === entry.environment && flagKey === entry.flagKey;
  const resolvedFlagId = (unchangedEntry ? entry.flagId : null) ?? selectedFlag?.id ?? null;
  const backToFlagDetail = resolvedFlagId ? `/flags/${resolvedFlagId}` : '/flags';

  // Query the existing list endpoint as the user types so every Flag remains reachable.
  const loadFlags = useCallback(async (env: Environment, search: string) => {
    const requestId = flagRequestRef.current + 1;
    flagRequestRef.current = requestId;
    setLoadingFlags(true);
    try {
      const res = await api.getFlags({
        environment: env,
        search: search || undefined,
        page: 1,
        page_size: 20,
      });
      if (requestId === flagRequestRef.current) setFlags(res.items);
    } catch {
      // Non-fatal assistance
    } finally {
      if (requestId === flagRequestRef.current) setLoadingFlags(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => loadFlags(environment, flagKey.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [environment, flagKey, loadFlags]);

  // Real-time JSON validation
  const contextCheck = useMemo(() => parseContextInput(contextText), [contextText]);

  // Handle prettify
  const handleFormatJson = () => {
    if (contextCheck.isValid && contextCheck.parsed) {
      setContextText(stringifyJson(contextCheck.parsed, 2));
    }
  };

  // Handle reset to sample
  const handleResetSample = () => {
    setContextText(DEFAULT_SAMPLE_CONTEXT);
  };

  // Handle clear
  const handleClearContext = () => {
    setContextText('{}');
  };

  // Run evaluation; the ref guard protects against a double click landing
  // before the disabled button has re-rendered.
  const handleEvaluate = async () => {
    if (evaluatingRef.current) {
      return;
    }
    if (!flagKey.trim()) {
      setEvalError('请先选择或输入 Flag Key');
      return;
    }
    if (!contextCheck.isValid) {
      setEvalError('上下文 JSON 存在语法错误，无法发起评估');
      return;
    }

    evaluatingRef.current = true;
    setEvaluating(true);
    setEvalError(null);
    setEvalResult(null);

    try {
      const result = await api.evaluate({
        flag_key: flagKey.trim(),
        environment,
        context: contextCheck.parsed ?? {},
      });
      setEvalResult(result);
    } catch (err) {
      if (err instanceof ApiError) {
        setEvalError(`[${err.code}] ${err.message}`);
      } else {
        setEvalError('评估请求执行失败，请检查服务状态');
      }
    } finally {
      evaluatingRef.current = false;
      setEvaluating(false);
    }
  };

  const contextError = contextCheck.isValid
    ? null
    : {
        title: `JSON 语法错误${contextCheck.line ? `（第 ${contextCheck.line} 行）` : ''}`,
        message: contextCheck.reason ?? '无法解析该 JSON',
      };

  // Render Result Card based on the 3 contract reasons (plus loading / empty).
  const renderResult = () => {
    if (evaluating) {
      return (
        <div className="evalc-result-inset evalc-result-loading" role="status" aria-live="polite">
          <span className="evalc-spinner" aria-hidden="true" />
          <span className="evalc-loading-text">正在执行领域评估引擎规则匹配...</span>
        </div>
      );
    }

    if (!evalResult) {
      return (
        <div className="evalc-result-inset">
          <div className="evalc-empty-art">
            <InboxIllustration />
          </div>
          <p className="evalc-empty-text">选择环境和 Flag，填写用户属性后开始评估</p>
        </div>
      );
    }

    // State 1: FLAG_DISABLED
    if (evalResult.reason === 'FLAG_DISABLED') {
      return (
        <Verdict
          tone="amber"
          testId="result-card-disabled"
          icon={<StopOutlined />}
          title="特性开关已停用 (FLAG_DISABLED)"
          tag="FLAG_DISABLED"
          description={
            <>
              特性开关已停用，评估引擎已熔断并强制返回 <code>false</code>。当前 Feature Flag
              的启停开关关闭，安全熔断机制会拦截所有规则匹配。
            </>
          }
        >
          <ValueCard
            label="最终返回值 (Result)"
            value="false"
            tone="red"
            pill="已熔断 / 强制关闭"
            dangerPill
          />
        </Verdict>
      );
    }

    // State 2: RULE_MATCH (Green Success)
    if (evalResult.reason === 'RULE_MATCH' && evalResult.matched_rule) {
      const rule = evalResult.matched_rule;
      const isPositive = evalResult.result;

      return (
        <Verdict
          tone="green"
          testId="result-card-rule-match"
          icon={<CheckCircleFilled />}
          title="命中灰度规则 (RULE_MATCH)"
          tag="RULE_MATCH"
          description="用户属性上下文成功命中优先级最高的一条灰度规则，触发短路求值并直接返回该规则预设值。"
        >
          <ValueCard
            label="最终返回值 (Result)"
            value={String(evalResult.result)}
            tone={isPositive ? 'green' : 'red'}
            pill={isPositive ? '返回 true' : '返回 false'}
          />
          <div className="evalc-rule-detail">
            <div className="evalc-rule-detail-head">命中规则明细</div>
            <table className="evalc-rule-table">
              <tbody>
                <tr>
                  <th>规则优先级 (Priority)</th>
                  <td>
                    <span className="evalc-rule-pill">#{rule.priority}</span>
                  </td>
                  <th>规则返回值</th>
                  <td>
                    <span className={`evalc-rule-bool evalc-rule-bool--${rule.return_value}`}>
                      {String(rule.return_value)}
                    </span>
                  </td>
                </tr>
                <tr>
                  <th>匹配属性名 (Attribute)</th>
                  <td>
                    <code>{rule.attribute_name}</code>
                  </td>
                  <th>操作符 (Operator)</th>
                  <td>
                    <span className="evalc-rule-op">{rule.operator}</span>
                  </td>
                </tr>
                <tr>
                  <th>规则期望值 (Expected Value)</th>
                  <td colSpan={3}>
                    <code>{stringifyJson(rule.expected_value)}</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Verdict>
      );
    }

    // State 3: DEFAULT_FALLBACK
    if (evalResult.reason === 'DEFAULT_FALLBACK') {
      return (
        <Verdict
          tone="blue"
          testId="result-card-default-fallback"
          icon={<InfoCircleFilled />}
          title="回退至默认返回值 (DEFAULT_FALLBACK)"
          tag="DEFAULT_FALLBACK"
          description="未命中任何规则，回退至当前 Flag 的默认返回值。用户属性上下文未满足该 Flag 下配置的有序灰度规则。"
        >
          <ValueCard
            label="最终返回值 (默认值)"
            value={String(evalResult.result)}
            tone={evalResult.result ? 'green' : 'muted'}
            pill="未命中规则 · 回退默认"
          />
        </Verdict>
      );
    }

    // Contract violation fallback: never label an unexplained reason as a
    // default-value fallback.
    return (
      <Verdict
        tone="neutral"
        testId="result-card-unknown"
        icon={<ExclamationCircleOutlined />}
        title="评估结果缺少可解释的决策依据"
        tag="UNKNOWN"
        description={
          <>
            后端返回原因 <code>{evalResult.reason}</code>，最终返回值{' '}
            <code>{String(evalResult.result)}</code>，未包含命中的规则明细。
          </>
        }
      />
    );
  };

  return (
    <div className="evalc-page">
      {entry.hasEntryContext && (
        <div className="evalc-banner" data-testid="context-banner">
          <div className="evalc-banner-main">
            <span className="evalc-banner-badge">
              <FlagOutlined aria-hidden="true" />
              来自 Flag 深层链接
            </span>
            <span className="evalc-banner-text">
              正在评估特性开关：<strong>{flagKey || '（未指定）'}</strong>{' '}
              <span className="evalc-banner-env">[{environment}]</span>
            </span>
          </div>
          <Link
            to={backToFlagDetail}
            className="evalc-banner-link"
            state={
              resolvedFlagId
                ? { from: `${location.pathname}${location.search}`, fromLabel: '规则评估' }
                : undefined
            }
          >
            <ArrowLeftOutlined aria-hidden="true" />
            {resolvedFlagId ? '返回 Flag 详情' : '返回 Flag 列表'}
          </Link>
        </div>
      )}

      <div className="evalc-grid">
        {/* Left: evaluation inputs */}
        <section className="evalc-card" aria-labelledby="eval-input-title">
          <header className="evalc-card-head">
            <h2 id="eval-input-title" className="evalc-card-title">
              评估输入配置
            </h2>
          </header>
          <div className="evalc-card-body">
            <div className="evalc-form">
              <div>
                <label className="evalc-label" htmlFor="environment-select">
                  生效环境 (Environment)
                  <span className="evalc-req" aria-hidden="true">*</span>
                </label>
                <Select<Environment>
                  id="environment-select"
                  className="evalc-env-select"
                  value={environment}
                  onChange={(env) => {
                    setEnvironment(env);
                    setEvalResult(null);
                    setEvalError(null);
                  }}
                  options={[
                    { label: ENV_LABELS.development, value: 'development' },
                    { label: ENV_LABELS.staging, value: 'staging' },
                    { label: ENV_LABELS.production, value: 'production' },
                  ]}
                />
              </div>

              <div className="evalc-field-flag">
                <div className="evalc-label-row">
                  <label className="evalc-label" htmlFor="flag-key-input">
                    特性开关标识 (Flag Key)
                    <span className="evalc-req" aria-hidden="true">*</span>
                  </label>
                  {flags.length > 0 && (
                    <span className="evalc-hint">
                      当前匹配 {flags.length} 个 Flag
                    </span>
                  )}
                  {loadingFlags && flags.length === 0 && (
                    <span className="evalc-hint">正在匹配 Flag...</span>
                  )}
                </div>
                <div className="evalc-combo">
                  <SearchOutlined className="evalc-combo-icon" aria-hidden="true" />
                  <AutoComplete
                    id="flag-key-input"
                    className="evalc-flag-autocomplete"
                    placeholder="选择或输入 Flag Key (例如 ai_ride_assistant_enabled)"
                    value={flagKey}
                    onChange={(val: string) => {
                      setFlagKey(val);
                      setEvalResult(null);
                      setEvalError(null);
                    }}
                    allowClear
                    options={flags.map((f) => ({
                      label: `${f.key} (${f.name}) [${f.enabled ? '已启用' : '已停用'}]`,
                      value: f.key,
                    }))}
                    filterOption={false}
                  />
                </div>
              </div>

              <div className="evalc-divider" role="presentation" />

              <div className="evalc-field-context">
                <label className="evalc-label" htmlFor="context-json">
                  用户属性上下文 (Context JSON)
                  <span className="evalc-req" aria-hidden="true">*</span>
                </label>
                <JsonContextEditor
                  id="context-json"
                  value={contextText}
                  onChange={(next) => {
                    setContextText(next);
                    setEvalResult(null);
                    setEvalError(null);
                  }}
                  onFormat={handleFormatJson}
                  onInsertSample={handleResetSample}
                  onClear={handleClearContext}
                  isValid={contextCheck.isValid}
                  error={contextError}
                  onSubmitShortcut={() => {
                    if (flagKey.trim() && contextCheck.isValid && !evaluating) {
                      void handleEvaluate();
                    }
                  }}
                />
              </div>

              <Button
                type="primary"
                size="large"
                block
                className="evalc-submit"
                icon={<PlayCircleOutlined />}
                loading={evaluating}
                disabled={!flagKey.trim() || !contextCheck.isValid || evaluating}
                onClick={handleEvaluate}
              >
                发起在线评估
              </Button>
            </div>
          </div>
        </section>

        {/* Right: decision chain */}
        <section className="evalc-card" aria-labelledby="eval-result-title">
          <header className="evalc-card-head">
            <h2 id="eval-result-title" className="evalc-card-title">
              评估结果与链路决策
            </h2>
          </header>
          <div className="evalc-card-body evalc-result-body">
            {evalError && (
              <div className="evalc-alert" role="alert">
                <ExclamationCircleFilled className="evalc-alert-icon" aria-hidden="true" />
                <div>
                  <div className="evalc-alert-title">评估调用失败</div>
                  <div className="evalc-alert-desc">{evalError}</div>
                </div>
                <button
                  type="button"
                  className="evalc-alert-close"
                  aria-label="关闭评估错误提示"
                  onClick={() => setEvalError(null)}
                >
                  <CloseOutlined />
                </button>
              </div>
            )}
            <div className="evalc-result-stage">{renderResult()}</div>
          </div>
        </section>
      </div>
    </div>
  );
};
