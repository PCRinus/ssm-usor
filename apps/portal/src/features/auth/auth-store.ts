import {
  type AuthSnapshot,
  createSessionStore,
  type SessionClient,
} from '@ssm-usor/spa-runtime/session';
import type { Session } from '@supabase/supabase-js';
import type { QueryClient } from '@tanstack/react-query';

type AuthError = { message: string; code?: string; status?: number };

export type SignInAddress = { email: string } | { phone: string };

type OtpVerification =
  { email: string; token: string; type: 'email' } | { phone: string; token: string; type: 'sms' };

export interface AuthClient extends SessionClient {
  signInWithOtp(
    credentials: SignInAddress & { options: { shouldCreateUser: false; captchaToken?: string } }
  ): Promise<{ error: AuthError | null }>;
  verifyOtp(
    params: OtpVerification
  ): Promise<{ data: { session: Session | null }; error: AuthError | null }>;
}

export type { AuthSnapshot };

export type CodeRequestResult = 'requested' | 'unreachable' | 'challenge-failed';
export type CodeVerificationResult = 'signed-in' | 'invalid' | 'rate-limited' | 'unreachable';

// supabase-js reports a request that never got an answer with status 0.
const unreachable = (error: AuthError) => error.status === 0;

export function createAuthStore(client: AuthClient | null, queryClient: QueryClient) {
  const { store, publish } = createSessionStore(client, queryClient);
  const { ready } = store;

  return {
    ...store,
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
  };
}

export type AuthStore = ReturnType<typeof createAuthStore>;
