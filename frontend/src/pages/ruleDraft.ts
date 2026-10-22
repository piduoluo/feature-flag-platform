import { Rule, RuleOperator } from '../types';

export function moveRule(rules: Rule[], index: number, direction: number): Rule[] {
  const target = index + direction;
  if (target < 0 || target >= rules.length) return rules;
  const next = [...rules];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// Array order owns priority; server metadata and numeric priority gaps are not edits.
export const rulePayload = (rules: Rule[]): Rule[] => rules.map((rule, index) => ({
  id: rule.id, attribute_name: rule.attribute_name, operator: rule.operator,
  expected_value: rule.expected_value, return_value: rule.return_value, priority: index + 1,
}));
export const rulesEqual = (left: Rule[], right: Rule[]) => JSON.stringify(rulePayload(left)) === JSON.stringify(rulePayload(right));

export function parseExpected(operator: RuleOperator, text: string): unknown {
  const value: unknown = JSON.parse(text);
  const values = Array.isArray(value) ? value : [value];
  if (values.some(item => typeof item === 'number' && Number.isInteger(item) && !Number.isSafeInteger(item))) {
    throw new Error('整数超出浏览器可精确表示范围，请使用安全整数，避免规则值失真');
  }
  const scalar = (item: unknown) => typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item));
  if (operator === 'equals' ? scalar(value) : Array.isArray(value) && value.length > 0 && value.every(scalar)) return value;
  throw new Error(operator === 'equals' ? 'equals 仅允许字符串、数字或布尔值' : 'in 需要非空标量 JSON 数组');
}
