import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { QueryClient } from '@tanstack/react-query';

type AuthError = { message: string; code?: string; status?: number };

export type SignInAddress = { email: string } | { phone: string };

type OtpVerification =
  { email: string; token: string; type: 'email' } | { phone: string; token: string; type: 'sms' };

export interface AuthClient {
  getSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }>;
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): {
    data: { subscription: { unsubscribe(): void } };
  };
  signOut(options: { scope: 'local' }): Promise<{ error: AuthError | null }>;
  signInWithOtp(
    credentials: SignInAddress & { options: { shouldCreateUser: false; captchaToken?: string } }
  ): Promise<{ error: AuthError | null }>;
  verifyOtp(
    params: OtpVerification
  ): Promise<{ data: { session: Session | null }; error: AuthError | null }>;
}

export type CodeRequestResult = 'requested' | 'unreachable' | 'challenge-failed';
export type CodeVerificationResult = 'signed-in' | 'invalid' | 'rate-limited' | 'unreachable';

// supabase-js reports a request that never got an answer with status 0.
const unreachable = (error: AuthError) => error.status === 0;

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

  return {
    ready,
    getSnapshot: () => snapshot,
    // The snapshot can hold an expired token: after the phone wakes, queries refetch before
    // Supabase's refresh reaches onAuthStateChange. getSession() waits for a refresh in
    // progress and renews an expired token itself.
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
    // Every refusal reads as a code on its way: an address nobody invited, a rate limit, and a
    // number the Send SMS hook will not text (a trial, no organization that may text, a 403 or a
    // 5xx). Supabase calls the hook only for an account that exists, so telling its refusal apart
    // would say which numbers have one. The page's wording for a number covers the refusal
    // instead. A refused Turnstile token says nothing about the address, so it is told apart.
    async requestCode(address: SignInAddress, captchaToken?: string): Promise<CodeRequestResult> {
      if (!client) return 'unreachable';
      await ready;
      try {
        const { error } = await client.signInWithOtp({
          ...address,
          options: { shouldCreateUser: false, captchaToken },
        });
        if (error && unreachable(error)) return 'unreachable';
        return error?.code === 'captcha_failed' ? 'challenge-failed' : 'requested';
      } catch {
        return 'unreachable';
      }
    },
    async verifyCode(address: SignInAddress, token: string): Promise<CodeVerificationResult> {
      if (!client) return 'unreachable';
      await ready;
      try {
        const { data, error } = await client.verifyOtp(
          'email' in address
            ? { email: address.email, token, type: 'email' }
            : { phone: address.phone, token, type: 'sms' }
        );
        if (error) {
          if (unreachable(error)) return 'unreachable';
          return error.status === 429 ? 'rate-limited' : 'invalid';
        }
        if (!data.session) return 'invalid';
        publish(data.session);
        return 'signed-in';
      } catch {
        return 'unreachable';
      }
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
}

export type AuthStore = ReturnType<typeof createAuthStore>;
