import {
  isLosslessNumber,
  isSafeNumber,
  LosslessNumber,
  parse,
  stringify,
} from 'lossless-json';

const parseNumber = (value: string): number | LosslessNumber =>
  isSafeNumber(value, { approx: false }) ? Number(value) : new LosslessNumber(value);

export function parseJson(source: string): unknown {
  return parse(source, undefined, { parseNumber });
}

export function stringifyJson(value: unknown, space?: number): string {
  const result = stringify(value, undefined, space);
  if (result === undefined) throw new TypeError('无法序列化 JSON');
  return result;
}

export const isJsonNumber = (value: unknown): boolean =>
  (typeof value === 'number' && Number.isFinite(value)) || isLosslessNumber(value);

