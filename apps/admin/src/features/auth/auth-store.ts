import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { QueryClient } from '@tanstack/react-query';

type AuthError = { message: string; code?: string; status?: number };

type Factor = { id: string; factor_type: string; status: string };

export interface AuthClient {
  getSession(): Promise<{ data: { session: Session | null }; error: AuthError | null }>;
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): {
    data: { subscription: { unsubscribe(): void } };
  };
  signInWithPassword(credentials: {
    email: string;
    password: string;
    options: { captchaToken?: string };
  }): Promise<{ data: { session: Session | null }; error: AuthError | null }>;
  signOut(options: { scope: 'local' }): Promise<{ error: AuthError | null }>;
  mfa: {
    listFactors(): Promise<
      { data: { all: Factor[] }; error: null } | { data: null; error: AuthError }
    >;
    unenroll(params: { factorId: string }): Promise<{ error: AuthError | null }>;
    enroll(params: {
      factorType: 'totp';
      issuer: string;
    }): Promise<
      | { data: { id: string; totp: { qr_code: string; secret: string } }; error: null }
      | { data: null; error: AuthError }
    >;
    challengeAndVerify(params: {
      factorId: string;
      code: string;
    }): Promise<{ data: unknown; error: AuthError | null }>;
  };
}

// Where the session stands on the way to the admin pages: a password alone is not enough, the
// API refuses a token whose `aal` is not `aal2` (ADR 038).
export type Step = 'sign-in' | 'enrol' | 'verify' | 'admin';

export type SignInResult =
  'signed-in' | 'invalid' | 'challenge-failed' | 'rate-limited' | 'unreachable';
export type VerifyResult = 'verified' | 'invalid' | 'rate-limited' | 'unreachable';

export interface Enrolment {
  factorId: string;
  // An SVG data URL from Supabase Auth.
  qrCode: string;
  secret: string;
}

// supabase-js reports a request that never got an answer with status 0.
const unreachable = (error: AuthError) => error.status === 0;

function assuranceLevel(accessToken: string) {
  try {
    const payload = accessToken.split('.')[1] ?? '';
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims: unknown = JSON.parse(json);
    return typeof claims === 'object' && claims !== null && 'aal' in claims ? claims.aal : null;
  } catch {
    return null;
  }
}

const verifiedTotp = (session: Session) =>
  session.user.factors?.find(
    (factor) => factor.factor_type === 'totp' && factor.status === 'verified'
  );

export function stepOf(session: Session | null): Step {
  if (!session) return 'sign-in';
  if (assuranceLevel(session.access_token) === 'aal2') return 'admin';
  return verifiedTotp(session) ? 'verify' : 'enrol';
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
    if (snapshot.session?.user.id !== session?.user.id) queryClient.clear();
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

  return {
    ready,
    getSnapshot: () => snapshot,
    step: () => stepOf(snapshot.session),
    // getSession() renews an expired token and waits for a refresh in progress.
    async getAccessToken() {
      await ready;
      if (!client || !snapshot.session) return null;
      const { data, error } = await client.getSession();
      if (error) return snapshot.session?.access_token ?? null;
      return data.session?.access_token ?? null;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async signIn(email: string, password: string, captchaToken?: string): Promise<SignInResult> {
      if (!client) return 'unreachable';
      await ready;
      try {
        const { data, error } = await client.signInWithPassword({
          email,
          password,
          options: { captchaToken },
        });
        if (error) {
          if (unreachable(error)) return 'unreachable';
          if (error.code === 'captcha_failed') return 'challenge-failed';
          return error.status === 429 ? 'rate-limited' : 'invalid';
        }
        if (!data.session) return 'invalid';
        publish(data.session);
        return 'signed-in';
      } catch {
        return 'unreachable';
      }
    },
    // A factor left unverified by an enrolment that was abandoned would otherwise pile up
    // against the project's limit of enrolled factors.
    async startEnrolment(): Promise<Enrolment> {
      if (!client) throw new Error('Authentication is not configured.');
      const factors = await client.mfa.listFactors();
      if (factors.error) throw factors.error;
      for (const factor of factors.data.all) {
        if (factor.factor_type !== 'totp' || factor.status === 'verified') continue;
        const { error } = await client.mfa.unenroll({ factorId: factor.id });
        if (error) throw error;
      }
      const { data, error } = await client.mfa.enroll({
        factorType: 'totp',
        issuer: 'SSM Ușor admin',
      });
      if (error) throw error;
      return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
    },
    verifiedFactorId: () => (snapshot.session ? verifiedTotp(snapshot.session)?.id : undefined),
    async verifyCode(factorId: string, code: string): Promise<VerifyResult> {
      if (!client) return 'unreachable';
      try {
        const { error } = await client.mfa.challengeAndVerify({ factorId, code });
        if (error) {
          if (unreachable(error)) return 'unreachable';
          return error.status === 429 ? 'rate-limited' : 'invalid';
        }
        await refreshSnapshot();
        return 'verified';
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
