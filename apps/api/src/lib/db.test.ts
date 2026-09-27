import type { Context } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fromDatabaseError, requestFetch } from './db';
import type { ApiEnv } from './env';

afterEach(() => vi.restoreAllMocks());

describe('fromDatabaseError', () => {
  it('logs why a request never reached the database', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = fromDatabaseError(
      { code: '', message: 'TypeError: fetch failed' },
      'list clients'
    );
    expect(error.code).toBe('service_unavailable');
    expect(logged).toHaveBeenCalledWith(
      'Database request failed (list clients): no code: TypeError: fetch failed'
    );
  });

  it('logs only the code of an error the database raised', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = fromDatabaseError(
      { code: 'XX000', message: 'failed on row (Ion Popescu)' },
      'save employee'
    );
    expect(error.code).toBe('internal_error');
    expect(logged).toHaveBeenCalledWith('Database request failed (save employee): XX000');
  });
});

describe('requestFetch', () => {
  const context = { req: { raw: new Request('https://api.test/') } } as unknown as Context<ApiEnv>;

  function upstreamTaking(ms: number, answer: () => Response) {
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        now += ms;
        return answer();
      })
    );
  }

  afterEach(() => vi.unstubAllGlobals());

  it('warns about a slow request, naming only the service and the resource', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    upstreamTaking(2_500, () => new Response(null, { status: 200 }));
    await requestFetch(
      context,
      8_000
    )('https://project.supabase.co/rest/v1/clients?id=eq.5d0f1a9e&select=*');
    expect(warned).toHaveBeenCalledWith(
      'Slow upstream request: project.supabase.co/rest/v1/clients took 2500 ms (status 200)'
    );
  });

  it('warns about a slow request that got no answer', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    upstreamTaking(5_000, () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });
    await expect(
      requestFetch(context, 5_000)('https://project.supabase.co/auth/v1/user')
    ).rejects.toThrow('timed out');
    expect(warned).toHaveBeenCalledWith(
      'Slow upstream request: project.supabase.co/auth/v1/user took 5000 ms (no response)'
    );
  });

  it('stays quiet about a quick request', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    upstreamTaking(300, () => new Response(null, { status: 200 }));
    await requestFetch(context, 8_000)('https://project.supabase.co/auth/v1/user');
    expect(warned).not.toHaveBeenCalled();
  });
});
