import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { createQueryClientDefaults } from './query-client';
import {
  createSessionStore,
  invalidateOnSessionChange,
  type SessionClient,
  type SessionStore,
} from './session';

function makeSession(id = 'user-one'): Session {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id,
      email: `${id}@example.test`,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-01-01T00:00:00Z',
    },
  };
}

function authFixture(session: Session | null = null) {
  let listener: ((event: AuthChangeEvent, session: Session | null) => void) | undefined;
  const unsubscribe = vi.fn(() => {
    listener = undefined;
  });
  const client = {
    getSession: vi.fn<SessionClient['getSession']>(() =>
      Promise.resolve({ data: { session }, error: null })
    ),
    onAuthStateChange: vi.fn<SessionClient['onAuthStateChange']>((callback) => {
      listener = callback;
      return { data: { subscription: { unsubscribe } } };
    }),
    signOut: vi.fn<SessionClient['signOut']>().mockResolvedValue({ error: null }),
  };
  return {
    client,
    unsubscribe,
    emit: (event: AuthChangeEvent, next: Session | null) => listener?.(event, next),
  };
}

const queryClient = () => new QueryClient({ defaultOptions: createQueryClientDefaults() });

describe('session transitions', () => {
  it('retains query data on token refresh but clears it when the account changes', async () => {
    const fixture = authFixture(makeSession());
    const queries = queryClient();
    const { store: auth } = createSessionStore(fixture.client, queries);
    await auth.ready;
    queries.setQueryData(['private-data'], 'user-one-data');
    fixture.emit('TOKEN_REFRESHED', { ...makeSession(), access_token: 'refreshed-token' });
    expect(queries.getQueryData(['private-data'])).toBe('user-one-data');
    fixture.emit('SIGNED_IN', makeSession('user-two'));
    expect(queries.getQueryCache().getAll()).toHaveLength(0);
    auth.dispose();
    expect(fixture.unsubscribe).toHaveBeenCalledOnce();
  });

  it('does not overwrite a newer auth event with an older session restoration result', async () => {
    const fixture = authFixture();
    let resolve!: (value: Awaited<ReturnType<SessionClient['getSession']>>) => void;
    fixture.client.getSession.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const { store: auth } = createSessionStore(fixture.client, queryClient());
    fixture.emit('SIGNED_IN', makeSession());
    resolve({ data: { session: null }, error: null });
    await auth.ready;
    expect(auth.getSnapshot().session?.user.id).toBe('user-one');
    auth.dispose();
  });

  it('reports a failed restoration as an error', async () => {
    const fixture = authFixture();
    fixture.client.getSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Failed to fetch', status: 0 },
    });
    const { store: auth } = createSessionStore(fixture.client, queryClient());
    await auth.ready;
    expect(auth.getSnapshot()).toEqual({ status: 'error', session: null });
    auth.dispose();
  });

  it('is unconfigured without a client', async () => {
    const { store: auth } = createSessionStore(null, queryClient());
    await auth.ready;
    expect(auth.getSnapshot()).toEqual({ status: 'unconfigured', session: null });
    expect(await auth.getAccessToken()).toBeNull();
  });

  it('asks the client for the token so a request never carries an expired one', async () => {
    const fixture = authFixture(makeSession());
    const { store: auth } = createSessionStore(fixture.client, queryClient());
    await auth.ready;
    // The client has renewed the token, but the event has not reached the store yet.
    fixture.client.getSession.mockResolvedValue({
      data: { session: { ...makeSession(), access_token: 'refreshed-token' } },
      error: null,
    });
    expect(auth.getSnapshot().session?.access_token).toBe('test-access-token');
    expect(await auth.getAccessToken()).toBe('refreshed-token');
    auth.dispose();
  });

  it('cancels in-flight queries when the session ends', async () => {
    const fixture = authFixture(makeSession());
    const queries = queryClient();
    const { store: auth } = createSessionStore(fixture.client, queries);
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

  it('ends only the local session on signing out', async () => {
    const fixture = authFixture(makeSession());
    const { store: auth } = createSessionStore(fixture.client, queryClient());
    await auth.ready;
    await auth.signOut();
    expect(fixture.client.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(auth.getSnapshot().session).toBeNull();
    auth.dispose();
  });

  it('keeps the session when signing out fails', async () => {
    const fixture = authFixture(makeSession());
    fixture.client.signOut.mockResolvedValue({ error: { message: 'Failed to fetch', status: 0 } });
    const { store: auth } = createSessionStore(fixture.client, queryClient());
    await auth.ready;
    await expect(auth.signOut()).rejects.toMatchObject({ status: 0 });
    expect(auth.getSnapshot().session?.user.id).toBe('user-one');
    auth.dispose();
  });
});

describe('onPublish', () => {
  it('sees each new session before the listeners do', async () => {
    const fixture = authFixture(makeSession());
    const order: string[] = [];
    const { store: auth } = createSessionStore(fixture.client, queryClient(), {
      onPublish: (session) => order.push(`publish:${session?.user.id ?? 'none'}`),
    });
    auth.subscribe(() => order.push(`listener:${auth.getSnapshot().session?.user.id ?? 'none'}`));
    await auth.ready;
    fixture.emit('SIGNED_OUT', null);
    expect(order).toEqual([
      'publish:user-one',
      'listener:user-one',
      'publish:none',
      'listener:none',
    ]);
    auth.dispose();
  });

  it('is not called after dispose or for a failed restoration', async () => {
    const onPublish = vi.fn();
    const fixture = authFixture();
    fixture.client.getSession.mockRejectedValue(new Error('offline'));
    const { store: auth, publish } = createSessionStore(fixture.client, queryClient(), {
      onPublish,
    });
    await auth.ready;
    auth.dispose();
    publish(makeSession());
    expect(onPublish).not.toHaveBeenCalled();
  });
});

describe('invalidateOnSessionChange', () => {
  async function setup(position?: (auth: SessionStore) => () => unknown) {
    const fixture = authFixture(makeSession());
    const { store: auth } = createSessionStore(fixture.client, queryClient());
    await auth.ready;
    const router = { invalidate: vi.fn(() => Promise.resolve()) };
    const stop = invalidateOnSessionChange(auth, router, position?.(auth));
    return { fixture, auth, router, stop };
  }

  it('re-runs the guards once the user changes, outside the auth callback', async () => {
    const { fixture, router, auth, stop } = await setup();
    fixture.emit('SIGNED_OUT', null);
    expect(router.invalidate).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(router.invalidate).toHaveBeenCalledOnce();
    stop();
    auth.dispose();
  });

  it('leaves the guards alone on a token refresh', async () => {
    const { fixture, router, auth, stop } = await setup();
    fixture.emit('TOKEN_REFRESHED', { ...makeSession(), access_token: 'refreshed-token' });
    await Promise.resolve();
    expect(router.invalidate).not.toHaveBeenCalled();
    stop();
    auth.dispose();
  });

  it('follows the position it is given', async () => {
    const { fixture, router, auth, stop } = await setup(
      (store) => () => store.getSnapshot().session?.access_token
    );
    fixture.emit('TOKEN_REFRESHED', { ...makeSession(), access_token: 'refreshed-token' });
    await Promise.resolve();
    expect(router.invalidate).toHaveBeenCalledOnce();
    stop();
    auth.dispose();
  });

  it('does nothing once stopped, even for a change already queued', async () => {
    const { fixture, router, auth, stop } = await setup();
    fixture.emit('SIGNED_OUT', null);
    stop();
    await Promise.resolve();
    fixture.emit('SIGNED_IN', makeSession('user-two'));
    await Promise.resolve();
    expect(router.invalidate).not.toHaveBeenCalled();
    auth.dispose();
  });
});

describe('query defaults', () => {
  const retry = createQueryClientDefaults().queries?.retry;
  const failure = (status?: number) => Object.assign(new Error('failed'), { status });

  it('does not retry a request the API refused', () => {
    if (typeof retry !== 'function') throw new Error('retry is not a function');
    expect(retry(0, failure(404))).toBe(false);
    expect(retry(0, failure(422))).toBe(false);
  });

  it('retries a server or network failure twice', () => {
    if (typeof retry !== 'function') throw new Error('retry is not a function');
    expect(retry(0, failure(503))).toBe(true);
    expect(retry(1, failure())).toBe(true);
    expect(retry(2, failure(503))).toBe(false);
  });

  it('never retries a change', () => {
    expect(createQueryClientDefaults().mutations?.retry).toBe(false);
  });
});
