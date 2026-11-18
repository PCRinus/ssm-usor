import {
  type AuthSnapshot,
  createSessionStore,
  type SessionClient,
} from '@ssm-usor/spa-runtime/session';
import type { Session } from '@supabase/supabase-js';
import type { QueryClient } from '@tanstack/react-query';

type AuthError = { message: string; code?: string; status?: number; name?: string };

// Supabase Auth refuses a gated call without a Turnstile token once CAPTCHA is on (ADR 004).
type CaptchaOptions = { captchaToken?: string };

// A small SDK boundary keeps session behavior testable without network requests.
export interface AuthClient extends SessionClient {
  signInWithPassword(credentials: {
    email: string;
    password: string;
    options: CaptchaOptions;
  }): Promise<{ data: { session: Session | null }; error: AuthError | null }>;
  signOut(options: { scope: 'local' | 'others' }): Promise<{ error: AuthError | null }>;
  resetPasswordForEmail(
    email: string,
    options: CaptchaOptions
  ): Promise<{ error: AuthError | null }>;
  signUp(credentials: { email: string; password: string; options: CaptchaOptions }): Promise<{
    data: { session: Session | null; user: { id: string } | null };
    error: AuthError | null;
  }>;
  verifyOtp(params: {
    token_hash: string;
    // 'email' is Supabase's type for the signup confirmation link.
    type: 'recovery' | 'email';
  }): Promise<{ data: { session: Session | null }; error: AuthError | null }>;
  updateUser(attributes: { password: string }): Promise<{ error: AuthError | null }>;
  signInWithOAuth(credentials: {
    provider: 'google';
    options: { redirectTo: string };
  }): Promise<{ error: AuthError | null }>;
  exchangeCodeForSession(
    authCode: string
  ): Promise<{ data: { session: Session | null }; error: AuthError | null }>;
  mfa: {
    getAuthenticatorAssuranceLevel(): Promise<{
      data: { currentLevel: string | null; nextLevel: string | null } | null;
      error: AuthError | null;
    }>;
    challengeAndVerify(params: {
      factorId: string;
      code: string;
    }): Promise<{ data: unknown; error: AuthError | null }>;
  };
}

export type VerifyResult = 'verified' | 'invalid' | 'rate-limited' | 'unreachable' | 'signed-out';

const signedOutCodes = new Set(['session_not_found', 'session_expired', 'bad_jwt']);

const isSignedOut = (error: AuthError) =>
  error.status === 401 ||
  error.status === 403 ||
  (error.code !== undefined && signedOutCodes.has(error.code)) ||
  error.name === 'AuthSessionMissingError';

// A reload of the code page in the middle of a password reset must still know that this tab used
// the link, which works once.
const recoveredUserKey = 'ssm-usor:recovered-user';

function readRecoveredUser() {
  try {
    return sessionStorage.getItem(recoveredUserKey);
  } catch {
    return null;
  }
}

function storeRecoveredUser(userId: string | null) {
  try {
    if (userId) sessionStorage.setItem(recoveredUserKey, userId);
    else sessionStorage.removeItem(recoveredUserKey);
  } catch {
    // Without storage, a reload during the reset asks for a new link.
  }
}

export class SecondFactorError extends Error {
  constructor(readonly result: Exclude<VerifyResult, 'verified'>) {
    super(`The second factor was not verified: ${result}.`);
  }
}

const verifiedTotp = (session: Session) =>
  session.user.factors?.find(
    (factor) => factor.factor_type === 'totp' && factor.status === 'verified'
  );

export const hasSecondFactor = (session: Session | null) =>
  Boolean(session && verifiedTotp(session));

export type { AuthSnapshot };

export function createAuthStore(client: AuthClient | null, queryClient: QueryClient) {
  // The account whose session a recovery link signed in, until it sets its new password.
  let recoveredUserId = readRecoveredUser();
  const setRecoveredUser = (userId: string | null) => {
    recoveredUserId = userId;
    storeRecoveredUser(userId);
  };

  const { store, publish, refreshSnapshot } = createSessionStore(client, queryClient, {
    onPublish: (session) => {
      if (recoveredUserId !== null && session?.user.id !== recoveredUserId) setRecoveredUser(null);
    },
  });
  const { ready } = store;
  const currentSession = () => store.getSnapshot().session;

  // The code can be exchanged once: a second exchange, from a re-render or a remount, fails
  // after the first one has signed the person in.
  const exchanges = new Map<string, Promise<void>>();

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
    setRecoveredUser(null);
    // The password is already changed; failing to end other sessions is not worth an error.
    await client.signOut({ scope: 'others' }).catch(() => undefined);
  }

  // Supabase Auth refuses a password change at aal1 to an account with a verified factor, and
  // ends its aal1 sessions whenever the factor is verified elsewhere, as in the admin app.
  async function needsSecondFactor() {
    await ready;
    if (!client || !currentSession()) return false;
    const { data } = await client.mfa.getAuthenticatorAssuranceLevel();
    return data?.currentLevel === 'aal1' && data.nextLevel === 'aal2';
  }

  async function verifySecondFactor(code: string): Promise<VerifyResult> {
    const current = currentSession();
    if (client && !current) return 'signed-out';
    const factor = current && verifiedTotp(current);
    if (!client || !factor) return 'unreachable';
    try {
      const { error } = await client.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (error) {
        // supabase-js reports a request that never got an answer with status 0.
        if (error.status === 0) return 'unreachable';
        if (error.status === 429) return 'rate-limited';
        return isSignedOut(error) ? 'signed-out' : 'invalid';
      }
      await refreshSnapshot();
      return 'verified';
    } catch {
      return 'unreachable';
    }
  }

  return {
    ...store,
    needsSecondFactor,
    verifySecondFactor,
    isRecoverySession: (session: Session | null) =>
      recoveredUserId !== null && session?.user.id === recoveredUserId,
    async signIn(email: string, password: string, captchaToken?: string) {
      if (!client) throw new Error('Authentication is not configured.');
      await ready;
      const { data, error } = await client.signInWithPassword({
        email,
        password,
        options: { captchaToken },
      });
      if (error) throw error;
      if (!data.session) throw new Error('No session was returned.');
      publish(data.session);
    },
    // Supabase answers the same for an address that already has an account, and sends the
    // confirmation email through the API's hook. A session comes back only where
    // confirmations are off.
    async signUp(email: string, password: string, captchaToken?: string) {
      if (!client) throw new Error('Authentication is not configured.');
      const { data, error } = await client.signUp({ email, password, options: { captchaToken } });
      if (error) throw error;
      if (data.session) publish(data.session);
      // For an address that already has an account, Supabase answers with a made-up user id.
      return data.user?.id ?? null;
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
    async requestPasswordReset(email: string, captchaToken?: string) {
      if (!client) throw new Error('Authentication is not configured.');
      const { error } = await client.resetPasswordForEmail(email, { captchaToken });
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
      setRecoveredUser(data.session.user.id);
      publish(data.session);
    },
    updatePassword,
    // Leaves the page for Google; Supabase returns to `redirectTo` with a code.
    async signInWithGoogle(redirectTo: string) {
      if (!client) throw new Error('Authentication is not configured.');
      const { error } = await client.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) throw error;
    },
    completeOAuth(code: string) {
      if (!client) return Promise.reject(new Error('Authentication is not configured.'));
      let exchange = exchanges.get(code);
      if (!exchange) {
        exchange = ready
          .then(() => client.exchangeCodeForSession(code))
          .then(({ data, error }) => {
            if (error) throw error;
            if (!data.session) throw new Error('No session was returned.');
            publish(data.session);
          });
        exchanges.set(code, exchange);
      }
      return exchange;
    },
    // Proves the person at the keyboard knows the current password before changing it. Signing
    // in again leaves the session at aal1, so an account with a second factor gives its code too,
    // and after a SecondFactorError the session stays at aal1 until a code is verified.
    async changePassword(
      email: string,
      currentPassword: string,
      newPassword: string,
      captchaToken?: string,
      code?: string
    ) {
      if (!client) throw new Error('Authentication is not configured.');
      const { data, error } = await client.signInWithPassword({
        email,
        password: currentPassword,
        options: { captchaToken },
      });
      if (error) throw error;
      if (data.session) publish(data.session);
      if (code !== undefined && (await needsSecondFactor())) {
        const verified = await verifySecondFactor(code);
        if (verified !== 'verified') throw new SecondFactorError(verified);
      }
      await updatePassword(newPassword);
    },
  };
}

export type AuthStore = ReturnType<typeof createAuthStore>;
