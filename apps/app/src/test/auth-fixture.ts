import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { vi } from 'vitest';

import type { AuthClient } from '../auth/auth-store';

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

export function authFixture(session: Session | null = null) {
  let listener: ((event: AuthChangeEvent, session: Session | null) => void) | undefined;
  const unsubscribe = vi.fn(() => {
    listener = undefined;
  });
  const client = {
    getSession: vi
      .fn<AuthClient['getSession']>()
      .mockResolvedValue({ data: { session }, error: null }),
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
    verifyOtp: vi.fn<AuthClient['verifyOtp']>().mockResolvedValue({
      data: { session: null },
      error: { message: 'Token has expired or is invalid', code: 'otp_expired' },
    }),
    updateUser: vi.fn<AuthClient['updateUser']>().mockResolvedValue({ error: null }),
  };
  return {
    client,
    unsubscribe,
    emit: (event: AuthChangeEvent, next: Session | null) => listener?.(event, next),
  };
}
