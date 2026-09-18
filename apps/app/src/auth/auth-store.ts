import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { QueryClient } from '@tanstack/react-query';

type AuthError = { message: string; code?: string };

// A small SDK boundary keeps session behavior testable without network requests.
export interface AuthClient {
  getSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }>;
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): {
    data: { subscription: { unsubscribe(): void } };
  };
  signInWithPassword(credentials: {
    email: string;
    password: string;
  }): Promise<{ data: { session: Session | null }; error: AuthError | null }>;
  signOut(options: { scope: 'local' | 'others' }): Promise<{ error: AuthError | null }>;
  resetPasswordForEmail(email: string): Promise<{ error: AuthError | null }>;
  signUp(credentials: {
    email: string;
    password: string;
  }): Promise<{ data: { session: Session | null }; error: AuthError | null }>;
  verifyOtp(params: {
    token_hash: string;
    // 'email' is Supabase's type for the signup confirmation link.
    type: 'recovery' | 'email';
  }): Promise<{ data: { session: Session | null }; error: AuthError | null }>;
  updateUser(attributes: { password: string }): Promise<{ error: AuthError | null }>;
}

export interface AuthSnapshot {
  status: 'loading' | 'ready' | 'error' | 'unconfigured';
  session: Session | null;
}

export function createAuthStore(client: AuthClient | null, queryClient: QueryClient) {
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

  // For the signed-in user. Other devices are signed out: whoever knew the old password
  // should not keep a session.
  //
  // Supabase refuses a password equal to the current one. After a recovery link that is not
  // a failure: the person is signed in and the account has the password they asked for, and
  // a distinct error would tell whoever holds the link that the guess was right.
  // `acceptCurrent` treats it as done; changing a password on purpose leaves it off.
  async function updatePassword(password: string, { acceptCurrent = false } = {}) {
    if (!client) throw new Error('Authentication is not configured.');
    const { error } = await client.updateUser({ password });
    if (error && !(acceptCurrent && error.code === 'same_password')) throw error;
    // The password is already changed; failing to end other sessions is not worth an error.
    await client.signOut({ scope: 'others' }).catch(() => undefined);
  }

  return {
    ready,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async signIn(email: string, password: string) {
      if (!client) throw new Error('Authentication is not configured.');
      await ready;
      const { data, error } = await client.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session) throw new Error('No session was returned.');
      publish(data.session);
    },
    async signOut() {
      if (!client) return;
      const { error } = await client.signOut({ scope: 'local' });
      if (error) throw error;
      publish(null);
    },
    // Supabase answers the same for an address that already has an account, and sends the
    // confirmation email through the API's hook. A session comes back only where
    // confirmations are off.
    async signUp(email: string, password: string) {
      if (!client) throw new Error('Authentication is not configured.');
      const { data, error } = await client.signUp({ email, password });
      if (error) throw error;
      if (data.session) publish(data.session);
    },
    // Uses up the token from a confirmation email and signs its owner in. As with a recovery
    // link, call it on a button press, never on page load.
    async confirmEmail(tokenHash: string) {
      if (!client) throw new Error('Authentication is not configured.');
      await ready;
      const { data, error } = await client.verifyOtp({ token_hash: tokenHash, type: 'email' });
      if (error) throw error;
      if (!data.session) throw new Error('No session was returned.');
      publish(data.session);
    },
    // Supabase answers the same whether or not the address has an account.
    async requestPasswordReset(email: string) {
      if (!client) throw new Error('Authentication is not configured.');
      const { error } = await client.resetPasswordForEmail(email);
      if (error) throw error;
    },
    // Uses up the token from a recovery email and signs its owner in. Call it only when
    // the person submits a new password, never on page load: mail scanners open links.
    async verifyRecovery(tokenHash: string) {
      if (!client) throw new Error('Authentication is not configured.');
      await ready;
      const { data, error } = await client.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
      if (error) throw error;
      if (!data.session) throw new Error('No session was returned.');
      publish(data.session);
    },
    updatePassword,
    // Proves the person at the keyboard knows the current password before changing it.
    async changePassword(email: string, currentPassword: string, newPassword: string) {
      if (!client) throw new Error('Authentication is not configured.');
      const { data, error } = await client.signInWithPassword({ email, password: currentPassword });
      if (error) throw error;
      if (data.session) publish(data.session);
      await updatePassword(newPassword);
    },
    dispose() {
      disposed = true;
      subscription?.unsubscribe();
      listeners.clear();
    },
  };
}

export type AuthStore = ReturnType<typeof createAuthStore>;
