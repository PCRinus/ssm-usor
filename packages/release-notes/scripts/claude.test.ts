import { describe, expect, it, vi } from 'vitest';

import { withoutProviderKey } from './claude.js';

describe('withoutProviderKey', () => {
  it('drops the SDK key and keeps the gateway token', async () => {
    const inner = vi.fn().mockResolvedValue(new Response('{}'));

    await withoutProviderKey(inner as unknown as typeof fetch)('https://gateway.example/v1', {
      method: 'POST',
      headers: { 'x-api-key': 'unified-billing', 'cf-aig-authorization': 'Bearer token' },
    });

    const headers = inner.mock.calls[0]![1].headers as Headers;
    expect(headers.get('x-api-key')).toBeNull();
    expect(headers.get('cf-aig-authorization')).toBe('Bearer token');
  });
});
