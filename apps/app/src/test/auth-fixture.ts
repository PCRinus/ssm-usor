import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { vi } from 'vitest';

import type { AuthClient } from '@/features/auth/auth-store';

export function withFactor(session: Session): Session {
  return {
    ...session,
    user: {
      ...session.user,
      factors: [
        {
          id: 'factor-one',
          factor_type: 'totp',
          status: 'verified',
          created_at: '2026-11-01T00:00:00Z',
          updated_at: '2026-11-01T00:00:00Z',
        },
      ],
    },
  };
}

export function makeSession(id = 'user-one', email = 'review@example.test'): Session {
  return {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id,
      email,
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-01-01T00:00:00Z',
    },
  };
}

export function authFixture(
  session: Session | null = null,
  signedInLevel: 'aal1' | 'aal2' = 'aal1'
) {
  let listener: ((event: AuthChangeEvent, session: Session | null) => void) | undefined;
  // Like the real client, getSession() answers with the session last announced.
  let current = session;
  let level = signedInLevel;
  const unsubscribe = vi.fn(() => {
    listener = undefined;
  });
  const client = {
    getSession: vi.fn<AuthClient['getSession']>(() =>
      Promise.resolve({ data: { session: current }, error: null })
    ),
    onAuthStateChange: vi.fn<AuthClient['onAuthStateChange']>((callback) => {
      listener = callback;
      return { data: { subscription: { unsubscribe } } };
    }),
    signInWithPassword: vi.fn<AuthClient['signInWithPassword']>().mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials', code: 'invalid_credentials' },
    }),
    signOut: vi.fn<AuthClient['signOut']>().mockResolvedValue({ error: null }),
    resetPasswordForEmail: vi
      .fn<AuthClient['resetPasswordForEmail']>()
      .mockResolvedValue({ error: null }),
    signUp: vi
      .fn<AuthClient['signUp']>()
      .mockResolvedValue({ data: { session: null, user: { id: 'user-one' } }, error: null }),
    verifyOtp: vi.fn<AuthClient['verifyOtp']>().mockResolvedValue({
      data: { session: null },
      error: { message: 'Token has expired or is invalid', code: 'otp_expired' },
    }),
    updateUser: vi.fn<AuthClient['updateUser']>().mockResolvedValue({ error: null }),
    signInWithOAuth: vi.fn<AuthClient['signInWithOAuth']>().mockResolvedValue({ error: null }),
    exchangeCodeForSession: vi.fn<AuthClient['exchangeCodeForSession']>().mockResolvedValue({
      data: { session: null },
      error: {
        message: 'invalid flow state, no valid flow state found',
        code: 'flow_state_not_found',
      },
    }),
    mfa: {
      getAuthenticatorAssuranceLevel: vi.fn<AuthClient['mfa']['getAuthenticatorAssuranceLevel']>(
        () =>
          Promise.resolve({
            data: current
              ? {
                  currentLevel: level,
                  nextLevel: current.user.factors?.some((factor) => factor.status === 'verified')
                    ? 'aal2'
                    : level,
                }
              : { currentLevel: null, nextLevel: null },
            error: null,
          })
      ),
      // Accepts 123456, the way a fresh code from the authenticator would be.
      challengeAndVerify: vi.fn<AuthClient['mfa']['challengeAndVerify']>(({ code }) => {
        if (code !== '123456') {
          return Promise.resolve({
            data: null,
            error: {
              message: 'Invalid TOTP code entered',
              code: 'mfa_verification_failed',
              status: 422,
            },
          });
        }
        level = 'aal2';
        listener?.('MFA_CHALLENGE_VERIFIED', current);
        return Promise.resolve({ data: {}, error: null });
      }),
    },
  };
  return {
    client,
    unsubscribe,
    emit: (event: AuthChangeEvent, next: Session | null) => {
      current = next;
      if (event === 'SIGNED_IN') level = 'aal1';
      listener?.(event, next);
    },
  };
}
