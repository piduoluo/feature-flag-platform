import { describe, expect, it } from 'vitest';
import { parseJson, stringifyJson } from './json';

describe('lossless JSON boundary', () => {
  it('keeps safe API fields as numbers and preserves targeting values beyond 2^53', () => {
    const parsed = parseJson('{"id":42,"expected_value":9007199254740993}') as {
      id: number;
      expected_value: unknown;
    };

    expect(parsed.id).toBe(42);
    expect(stringifyJson(parsed)).toBe('{"id":42,"expected_value":9007199254740993}');
  });

  it('preserves high precision decimal values through parse and stringify', () => {
    const source = '{"score":0.123456789012345678901}';
    expect(stringifyJson(parseJson(source))).toBe(source);
  });
});

