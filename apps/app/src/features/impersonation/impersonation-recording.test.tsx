import { screen, waitFor } from '@testing-library/react';
import type { PostHog } from 'posthog-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession, withFactor } from '@/test/auth-fixture';
import { quietSummary } from '@/test/dashboard-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

const { posthog } = vi.hoisted(() => ({ posthog: { client: null as PostHog | null } }));
vi.mock('@/app/observability/posthog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/observability/posthog')>()),
  loadPostHog: () => Promise.resolve(posthog.client),
  stopPostHog: () => {},
}));

function fakePostHog() {
  return {
    opt_in_capturing: vi.fn(),
    startSessionRecording: vi.fn(),
    stopSessionRecording: vi.fn(),
    identify: vi.fn(),
    resetGroups: vi.fn(),
    unregister: vi.fn(),
    group: vi.fn(),
    register: vi.fn(),
    capture: vi.fn(),
    setIdentity: vi.fn(),
    conversations: { isAvailable: () => false },
  };
}

const organization = { id: '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d', name: 'Protect Consult' };
const fetchMock = vi.fn<typeof fetch>();
let impersonating: boolean;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const { pathname } = new URL(String(input));
    if (pathname === '/dashboard/summary') return Response.json(quietSummary);
    if (pathname !== '/me') return Response.json({ error: 'not_found' }, { status: 404 });
    return Response.json({
      user: { id: 'admin-one', email: 'mircea@ssmusor.test' },
      profile: { fullName: 'Mircea Casapu', termsVersion: null, termsAcceptedAt: null },
      membership: { organization, role: 'owner' },
      impersonation: impersonating
        ? {
            targetMemberId: '0e0c1d36-5a4e-4b19-9d4b-8a1f1b6f9f10',
            targetOrganizationId: organization.id,
            expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
            targetName: 'Ana Popescu',
          }
        : null,
      subscription: null,
    });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  posthog.client = null;
  vi.unstubAllGlobals();
});

function admin() {
  const session = withFactor(makeSession('admin-one', 'mircea@ssmusor.test'));
  return authFixture(
    { ...session, user: { ...session.user, app_metadata: { role: 'admin' } } },
    'aal2'
  );
}

describe('session recording while acting as a member', () => {
  it('records nothing of the member organization', async () => {
    impersonating = true;
    const client = fakePostHog();
    posthog.client = client as unknown as PostHog;
    mountApp(admin().client);

    await screen.findByTestId('impersonation-banner');
    await waitFor(() => expect(client.stopSessionRecording).toHaveBeenCalled());
    expect(client.startSessionRecording).not.toHaveBeenCalled();
    expect(client.stopSessionRecording.mock.invocationCallOrder[0]).toBeLessThan(
      client.opt_in_capturing.mock.invocationCallOrder[0]!
    );
  });

  it('records the admin in his own organization', async () => {
    impersonating = false;
    const client = fakePostHog();
    posthog.client = client as unknown as PostHog;
    mountApp(admin().client);

    await waitFor(() => expect(client.startSessionRecording).toHaveBeenCalledWith(true));
  });
});
