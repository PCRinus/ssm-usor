import { describe, expect, it } from 'vitest';

import { createQueryClient } from '../lib/query-client';
import { authFixture, makeSession } from '../test/auth-fixture';
import { type AuthClient, createAuthStore } from './auth-store';

describe('session transitions', () => {
  it('retains query data on token refresh but clears it when the account changes', async () => {
    const fixture = authFixture(makeSession());
    const queries = createQueryClient();
    const auth = createAuthStore(fixture.client, queries);
    await auth.ready;
    queries.setQueryData(['private-data'], 'user-one-data');
    fixture.emit('TOKEN_REFRESHED', { ...makeSession(), access_token: 'refreshed-token' });
    expect(queries.getQueryData(['private-data'])).toBe('user-one-data');
    fixture.emit('SIGNED_IN', makeSession('user-two', 'second@example.test'));
    expect(queries.getQueryCache().getAll()).toHaveLength(0);
    auth.dispose();
    expect(fixture.unsubscribe).toHaveBeenCalledOnce();
  });

  it('does not overwrite a newer auth event with an older session restoration result', async () => {
    const fixture = authFixture();
    let resolve!: (value: Awaited<ReturnType<AuthClient['getSession']>>) => void;
    fixture.client.getSession.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const auth = createAuthStore(fixture.client, createQueryClient());
    fixture.emit('SIGNED_IN', makeSession());
    resolve({ data: { session: null }, error: null });
    await auth.ready;
    expect(auth.getSnapshot().session?.user.id).toBe('user-one');
    auth.dispose();
  });

  it('cancels in-flight queries when the session ends', async () => {
    const fixture = authFixture(makeSession());
    const queries = createQueryClient();
    const auth = createAuthStore(fixture.client, queries);
    await auth.ready;
    let aborted = false;
    const request = queries
      .fetchQuery({
        queryKey: ['pending-private-data'],
        queryFn: ({ signal }) =>
          new Promise<string>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              aborted = true;
              reject(new Error('aborted'));
            });
          }),
      })
      .catch(() => undefined);
    fixture.emit('SIGNED_OUT', null);
    await request;
    expect(aborted).toBe(true);
    expect(queries.getQueryCache().getAll()).toHaveLength(0);
    auth.dispose();
  });
});
