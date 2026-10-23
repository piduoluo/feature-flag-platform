import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './client';
import { stringifyJson } from '../utils/json';

describe('API lossless JSON transport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('preserves an unsafe integer from a response through a rule sync request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          '{"code":"SUCCESS","message":"ok","data":{"id":1,"key":"big","name":"Big","description":"","environment":"production","enabled":true,"default_value":false,"created_at":"2026-01-01","updated_at":"2026-01-01","rules":[{"id":2,"attribute_name":"user_id","operator":"equals","expected_value":9007199254740993,"return_value":true,"priority":10}]}}',
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        new Response('{"code":"SUCCESS","message":"ok","data":[]}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const flag = await api.getFlag(1);
    expect(stringifyJson(flag.rules?.[0].expected_value)).toBe('9007199254740993');

    await api.syncRules(1, flag.rules ?? []);
    expect(fetchMock.mock.calls[1][1]?.body).toContain('"expected_value":9007199254740993');
  });
});

