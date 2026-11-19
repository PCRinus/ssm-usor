import type { Context } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';

import { fetchMock, stubFetch, testEnv, testSecretKey, testUser } from '../test/upstream';
import {
  adminClient,
  auditActorHeader,
  auditAssuranceHeader,
  createAdminClient,
  createLastingAdminClient,
} from './admin-db';
import type { ApiEnv } from './env';

const env = testEnv({ SUPABASE_SECRET_KEY: testSecretKey });

const userId = testUser.id;

function contextOf(
  user: { id: string } | undefined,
  signal = new AbortController().signal,
  platformAdmin = false
) {
  const variables: Record<string, unknown> = { user, platformAdmin };
  return {
    env,
    req: { raw: { signal } },
    get: (key: string) => variables[key],
  } as unknown as Context<ApiEnv>;
}

async function headersSentBy(client: ReturnType<typeof adminClient>) {
  await client.from('employees').update({ notes: 'x' }).eq('id', userId);
  const [, init] = fetchMock.mock.calls.at(-1)!;
  return new Headers(init?.headers);
}

stubFetch();

beforeEach(() => {
  fetchMock.mockImplementation(async (_input, init) => {
    init?.signal?.throwIfAborted();
    return new Response(null, { status: 204 });
  });
});

describe('the audit actor on secret-key requests', () => {
  it('names the signed-in user', async () => {
    const headers = await headersSentBy(createAdminClient(contextOf({ id: userId })));

    expect(headers.get(auditActorHeader)).toBe(userId);
    expect(headers.get('Authorization')).toBe(`Bearer ${env.SUPABASE_SECRET_KEY}`);
    expect(headers.has(auditAssuranceHeader)).toBe(false);
  });

  it('says a platform admin passed the second factor, so the database names an impersonation', async () => {
    const headers = await headersSentBy(
      createAdminClient(contextOf({ id: userId }, undefined, true))
    );

    expect(headers.get(auditActorHeader)).toBe(userId);
    expect(headers.get(auditAssuranceHeader)).toBe('aal2');
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
