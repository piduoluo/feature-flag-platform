import { expect, it } from 'vitest';
import { moveRule, rulesEqual, parseExpected } from './ruleDraft';
import { Rule } from '../types';
import { stringifyJson } from '../utils/json';
const rules: Rule[] = [
  { id: 1, attribute_name: 'country', operator: 'equals', expected_value: 'CN', return_value: true, priority: 10 },
  { id: 2, attribute_name: 'plan', operator: 'equals', expected_value: 'pro', return_value: false, priority: 30 },
];
it('restoring order clears dirtiness without rewriting persisted priority gaps', () => {
  const moved = moveRule(rules, 0, 1);
  expect(moved.map(r => r.id)).toEqual([2, 1]);
  expect(moved.map(r => r.priority)).toEqual([10, 30]);
  expect(rulesEqual(moved, rules)).toBe(false);
  expect(rulesEqual(moveRule(moved, 1, -1), rules)).toBe(true);
  expect(moveRule(rules, 0, -1)).toEqual(rules);
});
it('accepts only finite JSON scalars or nonempty scalar arrays according to operator', () => {
  expect(parseExpected('equals', 'false')).toBe(false);
  expect(parseExpected('in', '[1,"1",true]')).toEqual([1, '1', true]);
  expect(stringifyJson(parseExpected('equals', '1e400'))).toBe('1e400');
  expect(stringifyJson(parseExpected('in', '[1e400]'))).toBe('[1e400]');
  for (const value of ['null', '{}', '[]']) expect(() => parseExpected('equals', value)).toThrow();
  for (const value of ['[]', '[null]', '[[1]]', '[{}]']) expect(() => parseExpected('in', value)).toThrow();
});

it('preserves backend-supported integers beyond the browser safe integer range', () => {
  expect(stringifyJson(parseExpected('equals', '9007199254740993'))).toBe('9007199254740993');
  expect(stringifyJson(parseExpected('in', '[9007199254740993]'))).toBe('[9007199254740993]');
});
