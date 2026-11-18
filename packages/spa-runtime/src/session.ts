import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { QueryClient } from '@tanstack/react-query';

type AuthError = { message: string; code?: string; status?: number };

export interface SessionClient {
  getSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }>;
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): {
    data: { subscription: { unsubscribe(): void } };
  };
  signOut(options: { scope: 'local' }): Promise<{ error: AuthError | null }>;
}

export interface AuthSnapshot {
  status: 'loading' | 'ready' | 'error' | 'unconfigured';
  session: Session | null;
}

export interface SessionStoreOptions {
  // Runs before the new snapshot reaches the listeners, so they never see state from the
  // session that just ended.
  onPublish?: (session: Session | null) => void;
}

export function createSessionStore(
  client: SessionClient | null,
  queryClient: QueryClient,
  { onPublish }: SessionStoreOptions = {}
) {
  let snapshot: AuthSnapshot = { status: client ? 'loading' : 'unconfigured', session: null };
  let revision = 0;
  let disposed = false;
  const listeners = new Set<() => void>();

  const publish = (session: Session | null) => {
    if (disposed) return;
    revision += 1;
    if (snapshot.session?.user.id !== session?.user.id) {
      // clear() also cancels cached queries, preventing old results from being reused.
      queryClient.clear();
    }
    onPublish?.(session);
    snapshot = { status: 'ready', session };
    listeners.forEach((listener) => listener());
  };

  // Keep this callback synchronous. Calling Supabase auth methods inside it can deadlock.
  const subscription = client?.onAuthStateChange((_event, session) => publish(session)).data
    .subscription;
  const initialRevision = revision;
  const ready = client
    ? client
        .getSession()
        .then(({ data, error }) => {
          if (disposed || revision !== initialRevision) return;
          if (error) throw error;
          publish(data.session);
        })
        .catch(() => {
          if (disposed || revision !== initialRevision) return;
          snapshot = { status: 'error', session: null };
          listeners.forEach((listener) => listener());
        })
    : Promise.resolve();

  async function refreshSnapshot() {
    if (!client) return;
    const { data, error } = await client.getSession();
    if (!error) publish(data.session);
  }

  const store = {
    ready,
    getSnapshot: () => snapshot,
    // The snapshot can hold an expired token: after the device wakes from sleep, queries
    // refetch before Supabase's refresh reaches onAuthStateChange. getSession() waits for a
    // refresh in progress and renews an expired token itself.
    async getAccessToken() {
      await ready;
      if (!client || !snapshot.session) return null;
      const { data, error } = await client.getSession();
      // The refresh failed, most likely offline. The request fails either way.
      if (error) return snapshot.session?.access_token ?? null;
      return data.session?.access_token ?? null;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async signOut() {
      if (!client) return;
      const { error } = await client.signOut({ scope: 'local' });
      if (error) throw error;
      publish(null);
    },
    dispose() {
      disposed = true;
      subscription?.unsubscribe();
      listeners.clear();
    },
  };

  return { store, publish, refreshSnapshot };
}

export type SessionStore = ReturnType<typeof createSessionStore>['store'];

type SessionSource = Pick<SessionStore, 'getSnapshot' | 'subscribe'>;

// Route guards read the session at navigation time only. When the signed-in user changes
// (sign-out, another tab, a different account) they run again so protected pages disappear.
export function invalidateOnSessionChange(
  auth: SessionSource,
  router: { invalidate(): unknown },
  position: () => unknown = () => auth.getSnapshot().session?.user.id
) {
  let current = position();
  let stopped = false;
  const unsubscribe = auth.subscribe(() => {
    const next = position();
    if (next === current) return;
    current = next;
    // Leave the Supabase event callback before re-running route guards.
    queueMicrotask(() => {
      if (!stopped) void router.invalidate();
    });
  });
  return () => {
    stopped = true;
    unsubscribe();
  };
}
