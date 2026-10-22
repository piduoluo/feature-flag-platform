import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Select,
  Input,
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

const DEFAULT_SAMPLE_CONTEXT = JSON.stringify(
  {
    country: 'CN',
    plan: 'premium',
    vip_level: 2,
  },
  null,
  2
);

interface EvaluationConsolePageProps {
  initialFlagKey?: string;
  initialEnvironment?: Environment;
  onNavigateToFlags?: () => void;
}

export const EvaluationConsolePage: React.FC<EvaluationConsolePageProps> = ({
  initialFlagKey = '',
  initialEnvironment = 'development',
  onNavigateToFlags,
}) => {
  const [environment, setEnvironment] = useState<Environment>(initialEnvironment);
  const [flagKey, setFlagKey] = useState<string>(initialFlagKey);
  const [contextText, setContextText] = useState<string>(DEFAULT_SAMPLE_CONTEXT);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loadingFlags, setLoadingFlags] = useState(false);

  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<EvaluationResult | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);

  // Sync initial props if changed
  useEffect(() => {
    if (initialFlagKey) {
      setFlagKey(initialFlagKey);
    }
  }, [initialFlagKey]);

  useEffect(() => {
    if (initialEnvironment) {
      setEnvironment(initialEnvironment);
    }
  }, [initialEnvironment]);

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
  const jsonValidation = useMemo(() => {
    const trimmed = contextText.trim();
    if (!trimmed) {
      return {
        isValid: false,
        error: '上下文 JSON 不能为空',
        parsed: null,
      };
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return {
          isValid: false,
          error: '上下文必须是一个 JSON 对象 (如 {"key": "value"})',
          parsed: null,
        };
      }
      return {
        isValid: true,
        error: null,
        parsed,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isValid: false,
        error: `JSON 语法错误: ${message}`,
        parsed: null,
      };
    }
  }, [contextText]);

  // Handle prettify
  const handleFormatJson = () => {
    if (jsonValidation.isValid && jsonValidation.parsed) {
      setContextText(JSON.stringify(jsonValidation.parsed, null, 2));
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

  // Run evaluation
  const handleEvaluate = async () => {
    if (!flagKey.trim()) {
      setEvalError('请先选择或输入 Flag Key');
      return;
    }
    if (!jsonValidation.isValid || !jsonValidation.parsed) {
      setEvalError('上下文 JSON 存在语法错误，无法发起评估');
      return;
    }

    setEvaluating(true);
    setEvalError(null);
    setEvalResult(null);

    try {
      const result = await api.evaluate({
        flag_key: flagKey.trim(),
        environment,
        context: jsonValidation.parsed,
      });
      setEvalResult(result);
    } catch (err) {
      if (err instanceof ApiError) {
        setEvalError(`[${err.code}] ${err.message}`);
      } else {
        setEvalError('评估请求执行失败，请检查服务状态');
      }
    } finally {
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
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Title level={4} style={{ margin: 0, color: '#d46b08' }}>
                  特性开关已停用 (FLAG_DISABLED)
                </Title>
                <Tag color="warning" style={{ fontSize: 13, padding: '2px 8px' }}>
                  FLAG_DISABLED
                </Tag>
              </div>

              <Paragraph style={{ margin: '8px 0 16px', color: '#595959' }}>
                当前 Feature Flag 处于停用状态。根据安全熔断机制，评估引擎强制拦截并直接返回 <Text code>false</Text>，未执行任何规则匹配。
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
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                <Descriptions column={2} size="small" bordered>
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
                  <Descriptions.Item label="规则期望值 (Expected Value)" span={2}>
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
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Title level={4} style={{ margin: 0, color: '#1d39c4' }}>
                回退至默认返回值 (DEFAULT_FALLBACK)
              </Title>
              <Tag color="processing" style={{ fontSize: 13, padding: '2px 8px' }}>
                DEFAULT_FALLBACK
              </Tag>
            </div>

            <Paragraph style={{ margin: '8px 0 16px', color: '#595959' }}>
              用户属性上下文未能满足该 Flag 下配置的任何有序灰度规则。系统按照安全策略回退至 Flag 的全局默认返回值。
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
  };

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      <div
        style={{
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <Title level={3} style={{ margin: 0 }}>
            <ThunderboltOutlined style={{ marginRight: 8, color: '#fa8c16' }} />
            确定性规则在线评估控制台
          </Title>
          <Text type="secondary">
            基于纯内存评估引擎，模拟调用方传入用户属性上下文，实时观测优先级匹配短路、类型隔离判定及三态评估结果。
          </Text>
        </div>
        {onNavigateToFlags && (
          <Button icon={<FlagOutlined />} onClick={onNavigateToFlags}>
            管理 Feature Flags
          </Button>
        )}
      </div>

      <Row gutter={[24, 24]}>
        {/* Left Form: Inputs */}
        <Col xs={24} lg={12}>
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
                <Text strong>生效环境 (Environment) *</Text>
                <Select<Environment>
                  style={{ width: '100%', marginTop: 6 }}
                  value={environment}
                  onChange={(env) => {
                    setEnvironment(env);
                    setEvalResult(null);
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text strong>特性开关标识 (Flag Key) *</Text>
                  {flags.length > 0 && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      已预载当前环境 {flags.length} 个 Flag
                    </Text>
                  )}
                </div>
                <Select
                  showSearch
                  style={{ width: '100%', marginTop: 6 }}
                  placeholder="选择或输入 Flag Key (例如 checkout_v2)"
                  value={flagKey || undefined}
                  onChange={(val) => {
                    setFlagKey(val);
                    setEvalResult(null);
                  }}
                  onSearch={(val) => {
                    setFlagKey(val);
                  }}
                  loading={loadingFlags}
                  filterOption={(input, option) =>
                    (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={flags.map((f) => ({
                    label: `${f.key} (${f.name}) [${f.enabled ? '已启用' : '已停用'}]`,
                    value: f.key,
                  }))}
                />
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
                  }}
                >
                  <Space align="center">
                    <Text strong>用户属性上下文 (Context JSON) *</Text>
                    {jsonValidation.isValid ? (
                      <Tag icon={<CheckCircleOutlined />} color="success">
                        JSON 格式有效
                      </Tag>
                    ) : (
                      <Tag icon={<ExclamationCircleOutlined />} color="error">
                        JSON 格式错误
                      </Tag>
                    )}
                  </Space>
                  <Space size="small">
                    <Tooltip title="自动美化排版 JSON">
                      <Button
                        size="small"
                        icon={<FormatPainterOutlined />}
                        onClick={handleFormatJson}
                        disabled={!jsonValidation.isValid}
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
                  rows={9}
                  value={contextText}
                  onChange={(e) => {
                    setContextText(e.target.value);
                    setEvalResult(null);
                  }}
                  status={!jsonValidation.isValid ? 'error' : ''}
                  style={{
                    fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
                    fontSize: 13,
                  }}
                  placeholder='{\n  "country": "CN",\n  "plan": "premium"\n}'
                />

                {/* Real-time Validation Error Banner */}
                {!jsonValidation.isValid && (
                  <Alert
                    type="error"
                    showIcon
                    message={jsonValidation.error}
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
                disabled={!flagKey.trim() || !jsonValidation.isValid}
                onClick={handleEvaluate}
                style={{ height: 44, fontSize: 16 }}
              >
                发起在线评估
              </Button>
            </Space>
          </Card>
        </Col>

        {/* Right Output: Result View */}
        <Col xs={24} lg={12}>
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
