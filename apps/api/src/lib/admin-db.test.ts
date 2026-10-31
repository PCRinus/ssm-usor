import type { Context } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  adminClient,
  auditActorHeader,
  createAdminClient,
  createLastingAdminClient,
} from './admin-db';
import type { ApiEnv } from './env';

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  SUPABASE_SECRET_KEY: 'sb_secret_test_key_value',
} as ApiEnv['Bindings'];

const userId = '0f7c8d96-479c-47b3-b49e-01f4555a0221';

const fetchMock = vi.fn<typeof fetch>();

function contextOf(user: { id: string } | undefined, signal = new AbortController().signal) {
  return {
    env,
    req: { raw: { signal } },
    get: (key: string) => (key === 'user' ? user : undefined),
  } as unknown as Context<ApiEnv>;
}

async function headersSentBy(client: ReturnType<typeof adminClient>) {
  await client.from('employees').update({ notes: 'x' }).eq('id', userId);
  const [, init] = fetchMock.mock.calls.at(-1)!;
  return new Headers(init?.headers);
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_input, init) => {
    init?.signal?.throwIfAborted();
    return new Response(null, { status: 204 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the audit actor on secret-key requests', () => {
  it('names the signed-in user', async () => {
    const headers = await headersSentBy(createAdminClient(contextOf({ id: userId })));

    expect(headers.get(auditActorHeader)).toBe(userId);
    expect(headers.get('Authorization')).toBe(`Bearer ${env.SUPABASE_SECRET_KEY}`);
  });

  it('names nobody for work no one signed in asked for', async () => {
    const headers = await headersSentBy(createAdminClient(contextOf(undefined)));

    expect(headers.has(auditActorHeader)).toBe(false);
  });

  it('names nobody from a client made outside a request', async () => {
    const headers = await headersSentBy(adminClient(env));

    expect(headers.has(auditActorHeader)).toBe(false);
  });

  it('names the user on a write that outlives the request, which the request cannot abort', async () => {
    const aborted = new AbortController();
    aborted.abort();
    const context = contextOf({ id: userId }, aborted.signal);

    const headers = await headersSentBy(createLastingAdminClient(context));
    expect(headers.get(auditActorHeader)).toBe(userId);

    const { error } = await createAdminClient(context)
      .from('employees')
      .update({ notes: 'x' })
      .eq('id', userId);
    expect(error).not.toBeNull();
  });
});
