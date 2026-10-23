import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from 'antd';
import { ArrowRightOutlined, CheckOutlined, CopyOutlined, SettingOutlined } from '@ant-design/icons';
import { EvaluationResult, RuleTraceReason } from '../types';
import { stringifyJson } from '../utils/json';

const TRACE_LABELS: Record<RuleTraceReason, string> = {
  MATCHED: '规则命中',
  ATTRIBUTE_MISSING: '未传入属性',
  NULL_VALUE: '属性值为 null',
  TYPE_MISMATCH: '类型不匹配',
  VALUE_MISMATCH: '值不相等',
  NOT_IN_SET: '值不在范围',
  INVALID_RULE: '规则无效，已跳过',
};

export function EvaluationDecision({ result, request }: { result: EvaluationResult; request: string | null }) {
  const location = useLocation();
  const [copyStatus, setCopyStatus] = useState('');
  const disabled = result.reason === 'FLAG_DISABLED';
  const matched = result.reason === 'RULE_MATCH' && !!result.matched_rule;
  const fallback = result.reason === 'DEFAULT_FALLBACK';
  const known = disabled || matched || fallback;
  const source = disabled ? '停用状态' : matched ? '命中规则' : fallback ? 'Flag 默认值配置' : '未知';
  const finalValue = fallback ? result.default_value ?? result.result : result.result;
  const trace = result.rule_trace;
  const hasTrace = Array.isArray(trace) && typeof result.rule_count === 'number';
  const navState = { from: `${location.pathname}${location.search}`, fromLabel: '规则评估' };

  const copyRequest = async () => {
    if (!request) return;
    try {
      await navigator.clipboard.writeText(request);
      setCopyStatus('已复制本次请求');
    } catch {
      setCopyStatus('复制失败，请检查浏览器剪贴板权限后重试');
    }
  };

  return (
    <div className="evalc-decision" data-testid={`result-card-${disabled ? 'disabled' : matched ? 'rule-match' : fallback ? 'default-fallback' : 'unknown'}`}>
      <section className="evalc-summary" aria-label="结果摘要">
        <strong
          className={`evalc-summary-value ${result.result ? 'is-true' : 'is-false'}`}
          aria-label="最终返回值"
        >
          {String(result.result)}
        </strong>
        <span className="evalc-summary-source">来源：{source}</span>
      </section>

      {known && hasTrace ? (
        <section className="evalc-chain" aria-labelledby="eval-chain-title">
          <h3 id="eval-chain-title">决策链路</h3>
          <ol className="evalc-steps">
            <li className={`evalc-step ${disabled ? 'is-stopped' : 'is-passed'}`}>
              <span className="evalc-step-dot" aria-hidden="true">{disabled ? '−' : <CheckOutlined />}</span>
              <div className="evalc-step-heading"><h4>开关状态</h4><span>{result.enabled ? '已启用' : '已停用'}</span></div>
            </li>
            <li className={`evalc-step ${disabled ? 'is-stopped' : matched ? 'is-passed' : ''}`}>
              <span className="evalc-step-dot" aria-hidden="true">{matched ? <CheckOutlined /> : '−'}</span>
              <div className="evalc-step-heading"><h4>规则匹配（{result.rule_count} 条规则）</h4><span>已评估 {trace.length} 条</span></div>
              {trace.length > 0 && (
                <ol className="evalc-traces" aria-label="逐条规则评估明细">
                  {trace.map((rule) => (
                    <li key={rule.id} className={`evalc-trace ${rule.matched ? 'is-matched' : ''}`}>
                      <div>
                        <strong>#{rule.priority} {rule.attribute_name}</strong>
                        <p><code>{rule.operator} {stringifyJson(rule.expected_value)}</code></p>
                      </div>
                      <div>
                        <strong>{TRACE_LABELS[rule.reason] ?? '原因未知'}</strong>
                        <p>{!rule.attribute_present ? `未提供 ${rule.attribute_name}` : <>实际值：<code>{stringifyJson(rule.actual_value)}</code></>}</p>
                        {rule.attribute_present && <p>期望值：<code>{stringifyJson(rule.expected_value)}</code></p>}
                        {rule.matched && <p>规则返回值：<code>{String(rule.return_value)}</code></p>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </li>
            <li className="evalc-step is-final">
              <span className="evalc-step-dot" aria-hidden="true" />
              <div className="evalc-step-heading"><h4>{fallback ? '回退默认值' : disabled ? '强制返回' : '返回规则值'}</h4><span>{fallback ? '默认值' : '返回值'}：{String(finalValue)}</span></div>
            </li>
          </ol>
        </section>
      ) : known && <p className="evalc-trace-unavailable" role="status">本次评估明细不可用，仅展示返回结果。</p>}

      <section className="evalc-next" aria-label="后续操作">
        <div className="evalc-actions">
          {result.flag_id ? (
            <Link className="evalc-action evalc-action--primary" to={`/flags/${result.flag_id}?tab=rules`} state={navState}>查看该 Flag 的规则 <ArrowRightOutlined aria-hidden="true" /></Link>
          ) : <Button disabled>查看该 Flag 的规则</Button>}
          <Button icon={<CopyOutlined aria-hidden="true" />} onClick={copyRequest} disabled={!request}>复制本次请求</Button>
          {result.flag_id ? (
            <Link className="evalc-action" to={`/flags/${result.flag_id}?tab=settings`} state={navState}><SettingOutlined aria-hidden="true" /> 查看默认值配置</Link>
          ) : <Button icon={<SettingOutlined aria-hidden="true" />} disabled>查看默认值配置</Button>}
        </div>
        {copyStatus && <p className="evalc-copy-status" role="status">{copyStatus}</p>}
      </section>
    </div>
  );
}
