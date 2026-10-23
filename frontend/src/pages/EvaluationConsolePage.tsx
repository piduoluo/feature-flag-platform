import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { Select, AutoComplete, Button } from 'antd';
import {
  ArrowLeftOutlined,
  CloseOutlined,
  ExclamationCircleFilled,
  FlagOutlined,
  PlayCircleOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Environment, EvaluationPayload, EvaluationResult, Flag } from '../types';
import { api, ApiError } from '../api/client';
import { parseJson, stringifyJson } from '../utils/json';
import { JsonContextEditor } from '../components/JsonContextEditor';
import { EvaluationDecision } from '../components/EvaluationDecision';
import { EvaluationEntryState, isInAppPath } from '../navigation';
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
  const navigate = useNavigate();
  const [entry] = useState(() => resolveEntryQuery(searchParams));
  const entryState = (location.state ?? {}) as EvaluationEntryState;

  const [environment, setEnvironment] = useState<Environment>(entry.environment);
  const [flagKey, setFlagKey] = useState<string>(entry.flagKey);
  const [contextText, setContextText] = useState<string>('');
  const [flags, setFlags] = useState<Flag[]>([]);
  const [flagTotal, setFlagTotal] = useState<number | null>(null);
  const [loadingFlags, setLoadingFlags] = useState(false);

  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<EvaluationResult | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [submittedRequest, setSubmittedRequest] = useState<string | null>(null);
  const evaluationRequestRef = useRef(0);
  const evaluatingRef = useRef(false);
  const flagRequestRef = useRef(0);

  const selectedFlag = flags.find((flag) => flag.key === flagKey && flag.environment === environment);
  const unchangedEntry = environment === entry.environment && flagKey === entry.flagKey;
  const resolvedFlagId = (unchangedEntry ? entry.flagId : null) ?? selectedFlag?.id ?? null;
  const entryDetailPath =
    entryState.fromFlagDetail && isInAppPath(entryState.fromFlagDetail.path)
      ? entryState.fromFlagDetail.path
      : undefined;
  // Opened by the same Flag's detail page and still showing that Flag: the
  // banner must revisit the existing detail entry. Pushing a new one would
  // replace its original source with "规则评估" and bounce the user between the
  // two pages forever.
  const roundTripDetailPath = unchangedEntry ? entryDetailPath : undefined;
  const backToFlagDetail =
    roundTripDetailPath ?? (resolvedFlagId ? `/flags/${resolvedFlagId}` : '/flags');

  // Keep modified clicks (new tab / new window) working as plain links; only a
  // normal click should step back to the detail entry that opened the console.
  const handleBackToEntryDetail = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(-1);
  };

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
      if (requestId === flagRequestRef.current) {
        setFlags(res.items);
        setFlagTotal(res.total);
      }
    } catch {
      if (requestId === flagRequestRef.current) {
        setFlags([]);
        setFlagTotal(null);
      }
    } finally {
      if (requestId === flagRequestRef.current) setLoadingFlags(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => loadFlags(environment, flagKey.trim()), 250);
    return () => {
      window.clearTimeout(timer);
      flagRequestRef.current += 1;
    };
  }, [environment, flagKey, loadFlags]);

  useEffect(() => () => { evaluationRequestRef.current += 1; }, []);

  const invalidateEvaluation = () => {
    evaluationRequestRef.current += 1;
    evaluatingRef.current = false;
    setEvaluating(false);
    setEvalResult(null);
    setEvalError(null);
    setSubmittedRequest(null);
  };

  const changeContext = (next: string) => {
    invalidateEvaluation();
    setContextText(next);
  };

  // Real-time JSON validation
  const contextCheck = useMemo(() => parseContextInput(contextText), [contextText]);

  // Handle prettify
  const handleFormatJson = () => {
    if (contextCheck.isValid && contextCheck.parsed) {
      changeContext(stringifyJson(contextCheck.parsed, 2));
    }
  };

  // Handle reset to sample
  const handleResetSample = () => {
    changeContext(DEFAULT_SAMPLE_CONTEXT);
  };

  // Handle clear
  const handleClearContext = () => {
    changeContext('{}');
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

    const requestId = ++evaluationRequestRef.current;
    const payload: EvaluationPayload = {
      flag_key: flagKey.trim(), environment, context: contextCheck.parsed ?? {},
    };
    const requestSnapshot = stringifyJson(payload, 2);
    setSubmittedRequest(null);
    evaluatingRef.current = true;
    setEvaluating(true);
    setEvalError(null);
    setEvalResult(null);

    try {
      const result = await api.evaluate(payload);
      if (requestId !== evaluationRequestRef.current) return;
      setEvalResult(result);
      setSubmittedRequest(requestSnapshot);
    } catch (err) {
      if (requestId !== evaluationRequestRef.current) return;
      if (err instanceof ApiError) {
        setEvalError(`[${err.code}] ${err.message}`);
      } else {
        setEvalError('评估请求执行失败，请检查服务状态');
      }
    } finally {
      if (requestId === evaluationRequestRef.current) {
        evaluatingRef.current = false;
        setEvaluating(false);
      }
    }
  };

  const contextError = contextCheck.isValid
    ? null
    : {
        title: `JSON 语法错误${contextCheck.line ? `（第 ${contextCheck.line} 行）` : ''}`,
        message: contextCheck.reason ?? '无法解析该 JSON',
      };

  // Render the result panel as one of: failure, loading, empty, or decision.
  const renderResult = () => {
    if (evalError) {
      return (
        <div
          className="evalc-result-inset evalc-result-error"
          role="alert"
          aria-live="assertive"
        >
          <div className="evalc-alert">
            <ExclamationCircleFilled className="evalc-alert-icon" aria-hidden="true" />
            <div className="evalc-alert-body">
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
        </div>
      );
    }

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

    return <EvaluationDecision result={evalResult} request={submittedRequest} />;
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
              !roundTripDetailPath && resolvedFlagId
                ? { from: `${location.pathname}${location.search}`, fromLabel: '规则评估' }
                : undefined
            }
            onClick={roundTripDetailPath ? handleBackToEntryDetail : undefined}
          >
            <ArrowLeftOutlined aria-hidden="true" />
            {roundTripDetailPath || resolvedFlagId ? '返回 Flag 详情' : '返回 Flag 列表'}
          </Link>
        </div>
      )}

      <div className="evalc-grid">
        {/* Left: evaluation inputs */}
        <section className="evalc-card" aria-label="评估输入配置">
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
                    setFlags([]);
                    setFlagTotal(null);
                    invalidateEvaluation();
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
                  {flagTotal !== null && (
                    <span className="evalc-hint">
                      当前匹配 {flagTotal} 个 Flag
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
                      setFlagTotal(null);
                      invalidateEvaluation();
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
                  onChange={changeContext}
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
        <section className="evalc-card" aria-label="评估结果与链路决策">
          <div className="evalc-card-body evalc-result-body">
            <div className="evalc-result-stage">{renderResult()}</div>
          </div>
        </section>
      </div>
    </div>
  );
};
