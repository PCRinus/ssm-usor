import type { Session } from '@supabase/supabase-js';
import { focusManager } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeResponse } from '@/api/generated/api';
import { authFixture, makeSession, withFactor } from '@/test/auth-fixture';
import { quietSummary } from '@/test/dashboard-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

import { identityPage } from './identity';

const memberOrganization = { id: '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d', name: 'Protect Consult' };
const ownOrganization = { id: '9a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d', name: 'SSM Ușor Demo' };
const ana = '0e0c1d36-5a4e-4b19-9d4b-8a1f1b6f9f10';
const radu = '5b7c9d1e-2f3a-4b5c-9d6e-7f8a9b0c1d2e';

function adminSession(): Session {
  const session = withFactor(makeSession('admin-one', 'mircea@ssmusor.test'));
  return { ...session, user: { ...session.user, app_metadata: { role: 'admin' } } };
}

function actingAs(
  targetMemberId: string,
  {
    targetName = 'Ana Popescu',
    expiresAt = new Date(Date.now() + 90 * 60_000),
  }: { targetName?: string | null; expiresAt?: Date } = {}
): MeResponse {
  return {
    user: { id: 'admin-one', email: 'mircea@ssmusor.test' },
    profile: {
      fullName: 'Mircea Casapu',
      professionalTitle: null,
      termsVersion: null,
      termsAcceptedAt: null,
    },
    membership: { organization: memberOrganization, role: 'owner' },
    impersonation: {
      targetMemberId,
      targetOrganizationId: memberOrganization.id,
      expiresAt: expiresAt.toISOString(),
      targetName,
    },
    subscription: null,
  };
}

function himself({ organization = true } = {}): MeResponse {
  return {
    user: { id: 'admin-one', email: 'mircea@ssmusor.test' },
    profile: {
      fullName: 'Mircea Casapu',
      professionalTitle: null,
      termsVersion: null,
      termsAcceptedAt: null,
    },
    membership: organization ? { organization: ownOrganization, role: 'owner' } : null,
    impersonation: null,
    subscription: null,
  };
}

const fetchMock = vi.fn<typeof fetch>();
let me: MeResponse;
let openHome: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    if (pathname === '/me/impersonation' && init?.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    if (pathname === '/me') return Response.json(me);
    if (pathname === '/dashboard/summary') return Response.json(quietSummary);
    if (pathname === '/releases') return Response.json({ items: [] });
    return Response.json({ error: 'not_found', message: 'Not found.' }, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  openHome = vi.spyOn(identityPage, 'openHome').mockImplementation(() => {});
});

afterEach(() => {
  disposeRuntimes();
  focusManager.setFocused(undefined);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const requestsTo = (path: string, method = 'GET') =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === path && (init?.method ?? 'GET') === method
  );

function comeBackToTheTab() {
  act(() => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
}

describe('acting as a member', () => {
  it('says whom the admin acts as, until when, and that signing and sending are off', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 11, 13, 45, 20));
    me = actingAs(ana, { expiresAt: new Date(2026, 10, 11, 14, 32) });
    mountApp(authFixture(adminSession(), 'aal2').client);

    const banner = await screen.findByTestId('impersonation-banner');
    expect(within(banner).getByTestId('impersonation-target').textContent).toBe(
      'Acționezi ca Ana Popescu · Protect Consult'
    );
    expect(within(banner).getByTestId('impersonation-until').textContent).toBe(
      'până la 14:32 (încă 47 min).'
    );
    expect(banner.textContent).toContain(
      'Semnarea și trimiterile (invitații, coduri) sunt oprite.'
    );
    expect(within(banner).getByRole('button', { name: 'Încheie' })).toBeTruthy();
  });

  it('names the member by what the API knows, or not at all', async () => {
    me = actingAs(ana, { targetName: null });
    mountApp(authFixture(adminSession(), 'aal2').client);

    expect((await screen.findByTestId('impersonation-target')).textContent).toBe(
      'Acționezi ca un membru · Protect Consult'
    );
  });

  it('shows the banner on an editor page too', async () => {
    me = actingAs(ana);
    mountApp(
      authFixture(adminSession(), 'aal2').client,
      `/clienti/${memberOrganization.id}/documente-ssm/${ana}`
    );

    const banner = await screen.findByTestId('impersonation-banner');
    expect(banner.closest('[data-slot=sidebar-wrapper]')?.className).toContain('fixed');
  });

  it('shows nothing to an admin who acts as no one', async () => {
    me = himself();
    mountApp(authFixture(adminSession(), 'aal2').client);

    await screen.findByTestId('dashboard-page');
    expect(screen.queryByTestId('impersonation-banner')).toBeNull();
  });

  it('ends it and opens the home page afresh', async () => {
    me = actingAs(ana);
    mountApp(authFixture(adminSession(), 'aal2').client);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Încheie' }));

    await waitFor(() => expect(openHome).toHaveBeenCalledOnce());
    expect(requestsTo('/me/impersonation', 'DELETE')).toHaveLength(1);
    expect(sessionStorage.getItem('ssm-usor:impersonation-ended')).toBe('1');
  });

  it('keeps acting as the member when ending fails', async () => {
    me = actingAs(ana);
    const answer = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) =>
      init?.method === 'DELETE'
        ? Response.json({ error: 'forbidden', message: 'Forbidden.' }, { status: 403 })
        : answer(input, init)
    );
    mountApp(authFixture(adminSession(), 'aal2').client);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Încheie' }));

    expect(
      await screen.findByText('Nu am putut încheia. Verifică conexiunea și încearcă din nou.')
    ).toBeTruthy();
    expect(openHome).not.toHaveBeenCalled();
    expect(screen.getByTestId('impersonation-banner')).toBeTruthy();
  });

  it('opens the home page afresh when it runs out, without anyone ending it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    me = actingAs(ana, { expiresAt: new Date(Date.now() + 5 * 60_000) });
    mountApp(authFixture(adminSession(), 'aal2').client);
    await screen.findByTestId('impersonation-banner');
    const asked = requestsTo('/me').length;

    me = himself();
    await act(() => vi.advanceTimersByTimeAsync(4 * 60_000));
    expect(openHome).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(60_000));

    await waitFor(() => expect(openHome).toHaveBeenCalledOnce());
    expect(requestsTo('/me').length).toBeGreaterThan(asked);
    expect(sessionStorage.getItem('ssm-usor:impersonation-ended')).toBe('1');
  });

  it('opens the home page afresh when the admin switched member in another tab', async () => {
    me = actingAs(ana);
    mountApp(authFixture(adminSession(), 'aal2').client);
    await screen.findByTestId('impersonation-banner');

    me = actingAs(radu, { targetName: 'Radu Ionescu' });
    comeBackToTheTab();

    await waitFor(() => expect(openHome).toHaveBeenCalledOnce());
    expect(sessionStorage.getItem('ssm-usor:impersonation-ended')).toBeNull();
  });

  it('opens the home page afresh when the admin started acting as a member in another tab', async () => {
    me = himself();
    mountApp(authFixture(adminSession(), 'aal2').client);
    await screen.findByTestId('dashboard-page');

    me = actingAs(ana);
    comeBackToTheTab();

    await waitFor(() => expect(openHome).toHaveBeenCalledOnce());
  });

  it('stays on the page while the account stays the same', async () => {
    me = actingAs(ana);
    mountApp(authFixture(adminSession(), 'aal2').client);
    await screen.findByTestId('impersonation-banner');
    const asked = requestsTo('/me').length;

    comeBackToTheTab();

    await waitFor(() => expect(requestsTo('/me').length).toBeGreaterThan(asked));
    expect(openHome).not.toHaveBeenCalled();
  });
});

describe('an admin without an organization of his own', () => {
  it('is shown the way back to the admin area, not sent to set up an organization', async () => {
    me = himself({ organization: false });
    const runtime = mountApp(authFixture(adminSession(), 'aal2').client);

    const page = await screen.findByTestId('admin-without-organization');
    expect(within(page).getByRole('heading').textContent).toBe('Nu acționezi ca un membru');
    expect(within(page).getByTestId('admin-area-link').getAttribute('href')).toBe(
      'http://localhost:5176/'
    );
    expect(within(page).getByTestId('onboarding-sign-out')).toBeTruthy();
    expect(runtime.router.state.location.pathname).toBe('/dashboard');
  });

  it('is told the impersonation ended when he just ended it', async () => {
    sessionStorage.setItem('ssm-usor:impersonation-ended', '1');
    me = himself({ organization: false });
    mountApp(authFixture(adminSession(), 'aal2').client);

    const page = await screen.findByTestId('admin-without-organization');
    expect(within(page).getByRole('heading').textContent).toBe('Acțiunea ca membru s-a încheiat');
  });

  it('leaves a new account without an organization to set one up', async () => {
    me = { ...himself({ organization: false }), user: { id: 'user-one', email: null } };
    const runtime = mountApp(authFixture(makeSession()).client);

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/configurare'));
    expect(screen.queryByTestId('admin-without-organization')).toBeNull();
  });
});
