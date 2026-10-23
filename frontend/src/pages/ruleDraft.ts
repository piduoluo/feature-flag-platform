import { Rule, RuleOperator } from '../types';
import { isJsonNumber, parseJson, stringifyJson } from '../utils/json';

export function moveRule(rules: Rule[], index: number, direction: number): Rule[] {
  const target = index + direction;
  if (target < 0 || target >= rules.length) return rules;
  const next = [...rules];
  const currentPriority = next[index].priority;
  const targetPriority = next[target].priority;
  [next[index], next[target]] = [
    { ...next[target], priority: currentPriority },
    { ...next[index], priority: targetPriority },
  ];
  return next;
}

export const rulePayload = (rules: Rule[]): Rule[] => rules.map((rule) => ({
  id: rule.id, attribute_name: rule.attribute_name, operator: rule.operator,
  expected_value: rule.expected_value, return_value: rule.return_value, priority: rule.priority,
}));
export const rulesEqual = (left: Rule[], right: Rule[]) =>
  stringifyJson(rulePayload(left)) === stringifyJson(rulePayload(right));

export function parseExpected(operator: RuleOperator, text: string): unknown {
  const value = parseJson(text);
  const scalar = (item: unknown) =>
    typeof item === 'string' || typeof item === 'boolean' || isJsonNumber(item);
  if (operator === 'equals' ? scalar(value) : Array.isArray(value) && value.length > 0 && value.every(scalar)) return value;
  throw new Error(operator === 'equals' ? 'equals 仅允许字符串、数字或布尔值' : 'in 需要非空标量 JSON 数组');
}
