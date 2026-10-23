import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  Select,
  Input,
  AutoComplete,
  Button,
  Typography,
  Space,
  Tag,
  Alert,
  Spin,
  Descriptions,
  Divider,
  Empty,
  Tooltip,
} from 'antd';
import {
  CheckCircleFilled,
  InfoCircleFilled,
  StopOutlined,
  PlayCircleOutlined,
  FormatPainterOutlined,
  ClearOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  FlagOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { Environment, EvaluationResult, Flag } from '../types';
import { api, ApiError } from '../api/client';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

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
  const flagIdParam = searchParams.get('flag_id') || searchParams.get('id') || '';
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
    const parsed = JSON.parse(trimmed);
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

export const EvaluationConsolePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
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

  // Prefer the id carried by the deep link, otherwise resolve it from the
  // environment's flag list so the return link always points at the flag.
  const resolvedFlagId =
    entry.flagId ?? flags.find((flag) => flag.key === flagKey)?.id ?? null;
  const backToFlagDetail = resolvedFlagId ? `/flags/${resolvedFlagId}` : '/flags';

  // Load flags for the current environment to assist input
  const loadFlags = useCallback(async (env: Environment) => {
    setLoadingFlags(true);
    try {
      const res = await api.getFlags({ environment: env, page_size: 100 });
      setFlags(res.items);
    } catch {
      // Non-fatal assistance
    } finally {
      setLoadingFlags(false);
    }
  }, []);

  useEffect(() => {
    loadFlags(environment);
  }, [environment, loadFlags]);

  // Real-time JSON validation
  const contextCheck = useMemo(() => parseContextInput(contextText), [contextText]);

  // Handle prettify
  const handleFormatJson = () => {
    if (contextCheck.isValid && contextCheck.parsed) {
      setContextText(JSON.stringify(contextCheck.parsed, null, 2));
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

  // Render Result Card based on 3 distinct visual states
  const renderResultCard = () => {
    if (evaluating) {
      return (
        <Card
          variant="borderless"
          style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 380,
            background: '#fafafa',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, color: '#8c8c8c' }}>
              正在执行领域评估引擎规则匹配...
            </div>
          </div>
        </Card>
      );
    }

    if (!evalResult) {
      return (
        <Card
          variant="borderless"
          style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 380,
            background: '#fafafa',
          }}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="在左侧选择环境、Flag 并输入用户上下文，点击「发起评估」实时验证"
          />
        </Card>
      );
    }

    // State 1: FLAG_DISABLED
    if (evalResult.reason === 'FLAG_DISABLED') {
      return (
        <Card
          data-testid="result-card-disabled"
          style={{
            background: '#fffbe6',
            borderColor: '#ffe58f',
            boxShadow: '0 2px 8px rgba(250, 140, 22, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <StopOutlined style={{ fontSize: 32, color: '#fa8c16', marginTop: 4 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <Title level={4} style={{ margin: 0, color: '#d46b08' }}>
                  特性开关已停用 (FLAG_DISABLED)
                </Title>
                <Tag color="warning" style={{ fontSize: 13, padding: '2px 8px' }}>
                  FLAG_DISABLED
                </Tag>
              </div>

              <Paragraph style={{ margin: '8px 0 16px', color: '#595959' }}>
                特性开关已停用，评估引擎已熔断并强制返回 <Text code>false</Text>。当前 Feature Flag 的启停开关关闭，安全熔断机制会拦截所有规则匹配。
              </Paragraph>

              <div
                style={{
                  background: '#ffffff',
                  padding: '16px 20px',
                  borderRadius: 6,
                  border: '1px solid #ffe58f',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>最终返回值 (Result)</Text>
                  <div style={{ fontSize: 24, fontWeight: 'bold', color: '#cf1322' }}>
                    false
                  </div>
                </div>
                <Tag color="error" style={{ fontSize: 14, padding: '4px 12px' }}>
                  已熔断 / 强制关闭
                </Tag>
              </div>
            </div>
          </div>
        </Card>
      );
    }

    // State 2: RULE_MATCH (Green Success)
    if (evalResult.reason === 'RULE_MATCH' && evalResult.matched_rule) {
      const rule = evalResult.matched_rule;
      const isPositive = evalResult.result;

      return (
        <Card
          data-testid="result-card-rule-match"
          style={{
            background: '#f6ffed',
            borderColor: '#b7eb8f',
            boxShadow: '0 2px 8px rgba(82, 196, 26, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <CheckCircleFilled style={{ fontSize: 32, color: '#52c41a', marginTop: 4 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <Title level={4} style={{ margin: 0, color: '#389e0d' }}>
                  命中灰度规则 (RULE_MATCH)
                </Title>
                <Tag color="success" style={{ fontSize: 13, padding: '2px 8px' }}>
                  RULE_MATCH
                </Tag>
              </div>

              <Paragraph style={{ margin: '8px 0 16px', color: '#595959' }}>
                用户属性上下文成功命中优先级最高的一条灰度规则，触发短路求值并直接返回该规则预设值。
              </Paragraph>

              {/* Large Result Bar */}
              <div
                style={{
                  background: '#ffffff',
                  padding: '16px 20px',
                  borderRadius: 6,
                  border: '1px solid #b7eb8f',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>最终返回值 (Result)</Text>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 'bold',
                      color: isPositive ? '#389e0d' : '#cf1322',
                    }}
                  >
                    {String(evalResult.result)}
                  </div>
                </div>
                <Tag color={isPositive ? 'green' : 'red'} style={{ fontSize: 14, padding: '4px 12px' }}>
                  {isPositive ? '功能放量开放 (true)' : '特定限制关闭 (false)'}
                </Tag>
              </div>

              {/* Matched Rule Breakdown */}
              <Card
                size="small"
                title={<span style={{ color: '#237804', fontWeight: 600 }}>命中规则明细</span>}
                style={{ background: '#ffffff', borderColor: '#d9f7be' }}
              >
                <Descriptions column={{ xs: 1, md: 2 }} size="small" bordered>
                  <Descriptions.Item label="规则优先级 (Priority)">
                    <Tag color="blue" style={{ fontWeight: 'bold' }}>
                      #{rule.priority}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="规则返回值">
                    <Text strong style={{ color: rule.return_value ? '#52c41a' : '#ff4d4f' }}>
                      {String(rule.return_value)}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="匹配属性名 (Attribute)">
                    <Text code copyable>{rule.attribute_name}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="操作符 (Operator)">
                    <Tag color="geekblue">{rule.operator}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="规则期望值 (Expected Value)" span={{ xs: 1, md: 2 }}>
                    <Text code style={{ wordBreak: 'break-all' }}>
                      {typeof rule.expected_value === 'string'
                        ? rule.expected_value
                        : JSON.stringify(rule.expected_value)}
                    </Text>
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </div>
          </div>
        </Card>
      );
    }

    // State 3: DEFAULT_FALLBACK (Neutral Blue)
    if (evalResult.reason === 'DEFAULT_FALLBACK') {
      return (
        <Card
          data-testid="result-card-default-fallback"
          style={{
            background: '#f0f5ff',
            borderColor: '#adc6ff',
            boxShadow: '0 2px 8px rgba(47, 84, 235, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <InfoCircleFilled style={{ fontSize: 32, color: '#2f54eb', marginTop: 4 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <Title level={4} style={{ margin: 0, color: '#1d39c4' }}>
                  回退至默认返回值 (DEFAULT_FALLBACK)
                </Title>
                <Tag color="processing" style={{ fontSize: 13, padding: '2px 8px' }}>
                  DEFAULT_FALLBACK
                </Tag>
              </div>

              <Paragraph style={{ margin: '8px 0 16px', color: '#595959' }}>
                未命中任何规则，回退至 Flag 默认值。用户属性上下文未满足该 Flag 下配置的有序灰度规则，评估引擎按安全策略返回全局默认值。
              </Paragraph>

              <div
                style={{
                  background: '#ffffff',
                  padding: '16px 20px',
                  borderRadius: 6,
                  border: '1px solid #adc6ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>最终返回值 (默认值)</Text>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 'bold',
                      color: evalResult.result ? '#1677ff' : '#8c8c8c',
                    }}
                  >
                    {String(evalResult.result)}
                  </div>
                </div>
                <Tag color="blue" style={{ fontSize: 14, padding: '4px 12px' }}>
                  未命中规则 · 回退默认
                </Tag>
              </div>
            </div>
          </div>
        </Card>
      );
    }

    // Contract violation fallback: never label an unexplained reason as a
    // default-value fallback.
    return (
      <Card data-testid="result-card-unknown" style={{ background: '#fafafa', borderColor: '#d9d9d9' }}>
        <Space align="start">
          <ExclamationCircleOutlined style={{ fontSize: 28, color: '#8c8c8c' }} />
          <div>
            <Title level={4} style={{ margin: 0 }}>
              评估结果缺少可解释的决策依据
            </Title>
            <Paragraph style={{ margin: '8px 0 0', color: '#595959' }}>
              后端返回原因 <Text code>{evalResult.reason}</Text>，最终返回值{' '}
              <Text code>{String(evalResult.result)}</Text>，未包含命中的规则明细。
            </Paragraph>
          </div>
        </Space>
      </Card>
    );
  };

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      <div
        style={{
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <Title level={3} style={{ margin: 0 }}>
            <ThunderboltOutlined style={{ marginRight: 8, color: '#fa8c16' }} />
            确定性规则在线评估控制台
          </Title>
        </div>
        <Button icon={<FlagOutlined />} onClick={() => navigate('/flags')}>
          管理 Feature Flags
        </Button>
      </div>

      {entry.hasEntryContext && (
        <Card
          data-testid="context-banner"
          size="small"
          style={{
            marginBottom: 20,
            background: '#e6f4ff',
            borderColor: '#91caff',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <Space size="middle" wrap>
              <Tag color="blue" icon={<FlagOutlined />}>
                来自 Flag 深层链接
              </Tag>
              <Text>
                正在评估特性开关：<Text strong>{flagKey || '（未指定）'}</Text> [{environment}]
              </Text>
            </Space>
            <Link to={backToFlagDetail}>
              <ArrowLeftOutlined style={{ marginRight: 4 }} />
              返回 Flag 详情
            </Link>
          </div>
        </Card>
      )}
      <Row gutter={[24, 24]}>
        {/* Left Form: Inputs */}
        <Col xs={24} xl={12}>
          <Card
            title="评估输入配置"
            variant="borderless"
            style={{
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02)',
              borderRadius: 8,
            }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {/* Environment Select */}
              <div>
                <label htmlFor="environment-select">
                  <Text strong>生效环境 (Environment) *</Text>
                </label>
                <Select<Environment>
                  id="environment-select"
                  style={{ width: '100%', marginTop: 6 }}
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

              {/* Flag Key Input / Select */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                  <label htmlFor="flag-key-input">
                    <Text strong>特性开关标识 (Flag Key) *</Text>
                  </label>
                  {flags.length > 0 && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      已预载当前环境 {flags.length} 个 Flag
                    </Text>
                  )}
                </div>
                <AutoComplete
                  id="flag-key-input"
                  style={{ width: '100%', marginTop: 6 }}
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
                  filterOption={(input, option) =>
                    `${option?.value ?? ''} ${option?.label ?? ''}`
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                />
                {loadingFlags && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    正在加载当前环境 Flag...
                  </Text>
                )}
              </div>

              <Divider style={{ margin: '8px 0' }} />

              {/* Context JSON Editor */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 6,
                    flexWrap: 'wrap',
                    gap: 8,
                  }}
                >
                  <Space align="center" wrap style={{ maxWidth: '100%' }}>
                    <Text strong>用户属性上下文 (Context JSON) *</Text>
                    {contextCheck.isEmpty ? (
                      <Tag>空上下文 · 将按 {} 提交</Tag>
                    ) : contextCheck.isValid ? (
                      <Tag icon={<CheckCircleOutlined />} color="success">
                        JSON 格式有效
                      </Tag>
                    ) : (
                      <Tag icon={<ExclamationCircleOutlined />} color="error">
                        JSON 格式错误
                      </Tag>
                    )}
                  </Space>
                  <Space size="small" wrap style={{ maxWidth: '100%' }}>
                    <Tooltip title="自动美化排版 JSON">
                      <Button
                        size="small"
                        icon={<FormatPainterOutlined />}
                        onClick={handleFormatJson}
                        disabled={!contextCheck.isValid}
                      >
                        格式化
                      </Button>
                    </Tooltip>
                    <Button size="small" onClick={handleResetSample}>
                      示例
                    </Button>
                    <Tooltip title="重置为空对象 {}">
                      <Button size="small" icon={<ClearOutlined />} onClick={handleClearContext}>
                        清空
                      </Button>
                    </Tooltip>
                  </Space>
                </div>

                <TextArea
                  id="context-json"
                  aria-label="用户属性上下文 Context JSON"
                  aria-invalid={!contextCheck.isValid}
                  rows={9}
                  value={contextText}
                  onChange={(e) => {
                    setContextText(e.target.value);
                    setEvalResult(null);
                    setEvalError(null);
                  }}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      if (flagKey.trim() && contextCheck.isValid && !evaluating) {
                        handleEvaluate();
                      }
                    }
                  }}
                  status={contextCheck.isValid ? '' : 'error'}
                  style={{
                    fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
                    fontSize: 13,
                  }}
                  placeholder='{\n  "country": "CN",\n  "plan": "premium"\n}'
                />

                {/* Real-time Validation Error Banner */}
                {!contextCheck.isValid && (
                  <Alert
                    data-testid="context-json-error"
                    type="error"
                    showIcon
                    message={`JSON 语法错误${contextCheck.line ? `（第 ${contextCheck.line} 行）` : ''}`}
                    description={contextCheck.reason}
                    style={{ marginTop: 8 }}
                  />
                )}
              </div>

              {/* Evaluation Action Button */}
              <Button
                type="primary"
                size="large"
                icon={<PlayCircleOutlined />}
                block
                loading={evaluating}
                disabled={!flagKey.trim() || !contextCheck.isValid || evaluating}
                onClick={handleEvaluate}
                style={{ height: 44, fontSize: 16 }}
              >
                发起在线评估
              </Button>
            </Space>
          </Card>
        </Col>

        {/* Right Output: Result View */}
        <Col xs={24} xl={12}>
          <Card
            title="评估结果与链路决策"
            variant="borderless"
            style={{
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02)',
              borderRadius: 8,
              minHeight: 460,
            }}
          >
            {evalError && (
              <Alert
                type="error"
                showIcon
                message="评估调用失败"
                description={evalError}
                style={{ marginBottom: 16 }}
                closable
                onClose={() => setEvalError(null)}
              />
            )}

            {renderResultCard()}
          </Card>
        </Col>
      </Row>
    </div>
  );
};
