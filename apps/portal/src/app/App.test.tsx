import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthClient } from '@/features/auth/auth-store';
import { createQueryClient } from '@/lib/query-client';

import App from './App';
import { createPortalRuntime, type PortalRuntime } from './portal-runtime';

const runtimes: PortalRuntime[] = [];
afterEach(() => runtimes.splice(0).forEach((runtime) => runtime.dispose()));

function mount(client: AuthClient | null, path = '/') {
  const runtime = createPortalRuntime(
    client,
    createQueryClient(),
    createMemoryHistory({ initialEntries: [path] }),
    'http://localhost:8787'
  );
  runtimes.push(runtime);
  render(<App runtime={runtime} />);
  return runtime;
}

function signedOutClient(): AuthClient {
  return {
    getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signOut: vi.fn(async () => ({ error: null })),
  };
}

describe('the portal shell', () => {
  it('renders the home page once the session is restored', async () => {
    mount(signedOutClient());
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Portalul SSM Ușor' })
    ).toBeTruthy();
  });

  it('says the portal is unavailable when authentication is not configured', async () => {
    mount(null);
    expect(await screen.findByTestId('auth-unavailable')).toBeTruthy();
  });

  it('answers an unknown address with the not-found page', async () => {
    mount(signedOutClient(), '/nowhere');
    expect(await screen.findByTestId('not-found-page')).toBeTruthy();
  });
});
