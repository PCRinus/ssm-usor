import type { Session } from '@supabase/supabase-js';
import { createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { vi } from 'vitest';

import { type AdminRuntime, createAdminRuntime } from '@/app/admin-runtime';
import App from '@/app/App';
import type { AuthClient } from '@/features/auth/auth-store';
import { createQueryClient } from '@/lib/query-client';

const encode = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const session = {
  access_token: `${encode({ alg: 'HS256' })}.${encode({ sub: 'user-1', aal: 'aal2' })}.signature`,
  refresh_token: 'refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: 'user-1',
    app_metadata: { role: 'admin' },
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-11-04T08:00:00Z',
    email: 'mircea@example.ro',
    factors: [
      {
        id: 'factor-1',
        factor_type: 'totp',
        status: 'verified',
        created_at: '2026-11-04T08:00:00Z',
        updated_at: '2026-11-04T08:00:00Z',
      },
    ],
  },
} as Session;

export const authClient = {
  getSession: vi.fn(async () => ({ data: { session }, error: null })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  mfa: {
    listFactors: vi.fn(async () => ({ data: { all: session.user.factors ?? [] }, error: null })),
    unenroll: vi.fn(),
    enroll: vi.fn(),
    challengeAndVerify: vi.fn(),
  },
} as unknown as AuthClient;

const runtimes: AdminRuntime[] = [];

export function mountAdmin(path: string) {
  const runtime = createAdminRuntime(
    authClient,
    createQueryClient(),
    createMemoryHistory({ initialEntries: [path] }),
    'http://localhost:5176'
  );
  runtimes.push(runtime);
  render(<App runtime={runtime} />);
  return runtime;
}

export const disposeAdmins = () => runtimes.splice(0).forEach((runtime) => runtime.dispose());
