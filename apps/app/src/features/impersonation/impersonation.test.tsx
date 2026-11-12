import type { Session } from '@supabase/supabase-js';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeResponse } from '@/api/generated/api';
import { apiFetch, apiUpload } from '@/api/http';
import { authFixture, makeSession, withFactor } from '@/test/auth-fixture';
import { quietSummary } from '@/test/dashboard-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

import { actingAsHeader } from './acting-as';
import { identityPage } from './identity';
import { impersonationRefusedMessage, wordingRefusalHere } from './refusal';

const memberOrganization = { id: '4d1c2a9e-7b3f-4e8a-9c5d-2f6b8a0e1c3d', name: 'Protect Consult' };
const ownOrganization = { id: '9a0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d', name: 'SSM Ușor Demo' };
const ana = '0e0c1d36-5a4e-4b19-9d4b-8a1f1b6f9f10';
const radu = '5b7c9d1e-2f3a-4b5c-9d6e-7f8a9b0c1d2e';
const endedKey = 'ssm-usor:impersonation-ended';

function adminSession(): Session {
  const session = withFactor(makeSession('admin-one', 'mircea@ssmusor.test'));
  return { ...session, user: { ...session.user, app_metadata: { role: 'admin' } } };
}

const admin = () => authFixture(adminSession(), 'aal2');

const profile = {
  fullName: 'Mircea Casapu',
  professionalTitle: null,
  termsVersion: null,
  termsAcceptedAt: null,
};

function actingAs(
  targetMemberId: string,
  {
    targetName = 'Ana Popescu',
    expiresAt = new Date(Date.now() + 90 * 60_000),
  }: { targetName?: string | null; expiresAt?: Date } = {}
): MeResponse {
  return {
    user: { id: 'admin-one', email: 'mircea@ssmusor.test' },
    profile,
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
    profile,
    membership: organization ? { organization: ownOrganization, role: 'owner' } : null,
    impersonation: null,
    subscription: null,
  };
}

const identityChanged = () =>
  Response.json(
    { error: 'conflict', message: 'Conflict.', reason: 'identity_changed' },
    { status: 409 }
  );

const fetchMock = vi.fn<typeof fetch>();
let me: MeResponse;
let meAnswer: (() => Response) | null;
let otherAnswer: ((pathname: string, init?: RequestInit) => Response | undefined) | null;
let openHome: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  meAnswer = null;
  otherAnswer = null;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    if (pathname === '/me') return meAnswer?.() ?? Response.json(me);
    const other = otherAnswer?.(pathname, init);
    if (other) return other;
    if (pathname === '/me/impersonation' && init?.method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    if (pathname === '/dashboard/summary') return Response.json(quietSummary);
    if (pathname === '/releases') return Response.json({ items: [] });
    return Response.json({ error: 'not_found', message: 'Not found.' }, { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  openHome = vi.spyOn(identityPage, 'openHome').mockImplementation(() => {});
});

afterEach(() => {
  disposeRuntimes();
  sessionStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const requestsTo = (path: string, method = 'GET') =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === path && (init?.method ?? 'GET') === method
  );

const actingAsSent = (call: Parameters<typeof fetch>) =>
  new Headers(call[1]?.headers).get(actingAsHeader);

function focusTheWindow() {
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
}

describe('acting as a member', () => {
  it('says whom the admin acts as, until when in Bucharest, and that signing and sending are off', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T11:45:20Z'));
    me = actingAs(ana, { expiresAt: new Date('2026-11-11T12:32:00Z') });
    mountApp(admin().client);

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

  it('keeps whom he acts as in the header, which stays when the page scrolls', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T11:45:20Z'));
    me = actingAs(ana, { expiresAt: new Date('2026-11-11T12:32:00Z') });
    mountApp(admin().client);

    const header = (await screen.findByTestId('impersonation-banner')).ownerDocument.querySelector(
      'header'
    )!;
    const marker = within(header).getByRole('img', {
      name: 'Acționezi ca Ana Popescu · Protect Consult, până la 14:32.',
    });
    expect(marker.textContent).toBe('Ana Popescu');
  });

  it('names the member by what the API knows, or not at all', async () => {
    me = actingAs(ana, { targetName: null });
    mountApp(admin().client);

    expect((await screen.findByTestId('impersonation-target')).textContent).toBe(
      'Acționezi ca un membru · Protect Consult'
    );
  });

  it('shows the banner on an editor page too', async () => {
    me = actingAs(ana);
    mountApp(admin().client, `/clienti/${memberOrganization.id}/documente-ssm/${ana}`);

    const banner = await screen.findByTestId('impersonation-banner');
    expect(banner.closest('[data-slot=sidebar-wrapper]')?.className).toContain('fixed');
  });

  it('shows nothing to an admin who acts as no one', async () => {
    me = himself();
    mountApp(admin().client);

    await screen.findByTestId('dashboard-page');
    expect(screen.queryByTestId('impersonation-banner')).toBeNull();
    expect(screen.queryByTestId('impersonation-marker')).toBeNull();
  });

  it('ends it and opens the home page afresh', async () => {
    me = actingAs(ana);
    mountApp(admin().client);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Încheie' }));

    await waitFor(() => expect(openHome).toHaveBeenCalledOnce());
    expect(requestsTo('/me/impersonation', 'DELETE')).toHaveLength(1);
    expect(sessionStorage.getItem(endedKey)).toBe('1');
  });

  it('keeps acting as the member when ending fails', async () => {
    me = actingAs(ana);
    otherAnswer = (pathname, init) =>
      init?.method === 'DELETE'
        ? Response.json({ error: 'forbidden', message: 'Forbidden.' }, { status: 403 })
        : undefined;
    mountApp(admin().client);
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
    mountApp(admin().client);
    await screen.findByTestId('impersonation-banner');
    const asked = requestsTo('/me').length;

    me = himself();
    await act(() => vi.advanceTimersByTimeAsync(4 * 60_000));
    expect(openHome).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(60_000));

    await waitFor(() => expect(openHome).toHaveBeenCalledOnce());
    expect(requestsTo('/me').length).toBeGreaterThan(asked);
    expect(sessionStorage.getItem(endedKey)).toBe('1');
  });

  it('opens the home page afresh when the admin switched member in a window beside it', async () => {
    me = actingAs(ana);
    mountApp(admin().client);
    await screen.findByTestId('impersonation-banner');

    me = actingAs(radu, { targetName: 'Radu Ionescu' });
    focusTheWindow();

    await waitFor(() => expect(openHome).toHaveBeenCalledOnce());
    expect(sessionStorage.getItem(endedKey)).toBeNull();
  });

  it('asks again when the page comes back from the back-forward cache', async () => {
    me = himself();
    mountApp(admin().client);
    await screen.findByTestId('dashboard-page');

    me = actingAs(ana);
    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });

    await waitFor(() => expect(openHome).toHaveBeenCalledOnce());
  });

  it('stays on the page while the account stays the same', async () => {
    me = actingAs(ana);
    mountApp(admin().client);
    await screen.findByTestId('impersonation-banner');
    const asked = requestsTo('/me').length;

    focusTheWindow();

    await waitFor(() => expect(requestsTo('/me').length).toBeGreaterThan(asked));
    expect(openHome).not.toHaveBeenCalled();
  });

  it('leaves an ordinary member to the usual refresh when the window gains focus', async () => {
    me = { ...himself(), user: { id: 'user-one', email: 'review@example.test' } };
    mountApp(authFixture(makeSession()).client);
    await screen.findByTestId('dashboard-page');
    const asked = requestsTo('/me').length;

    focusTheWindow();
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(requestsTo('/me')).toHaveLength(asked);
  });
});

describe('a page left behind', () => {
  it('blocks the page before it leaves, so staying keeps nothing usable, and leaves again', async () => {
    me = actingAs(ana);
    mountApp(admin().client);
    await screen.findByTestId('impersonation-banner');

    me = actingAs(radu, { targetName: 'Radu Ionescu' });
    focusTheWindow();

    expect(await screen.findByTestId('identity-reloading')).toBeTruthy();
    expect(openHome).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('impersonation-banner')).toBeNull();
    expect(screen.queryByTestId('dashboard-page')).toBeNull();

    focusTheWindow();
    await waitFor(() => expect(openHome).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('identity-reloading')).toBeTruthy();

    await userEvent.setup().click(screen.getByTestId('identity-reload'));
    expect(openHome).toHaveBeenCalledTimes(3);
  });

  it('does not show the old page as an organization-less one when the impersonation ended', async () => {
    sessionStorage.removeItem(endedKey);
    me = actingAs(ana);
    mountApp(admin().client);
    await screen.findByTestId('impersonation-banner');

    me = himself({ organization: false });
    focusTheWindow();

    expect(await screen.findByTestId('identity-reloading')).toBeTruthy();
    expect(screen.queryByTestId('admin-without-organization')).toBeNull();
    expect(sessionStorage.getItem(endedKey)).toBe('1');
  });
});

describe('the identity the page was built for', () => {
  it('goes with every request but the one that tells it', async () => {
    me = actingAs(ana);
    const runtime = mountApp(admin().client);
    await screen.findByTestId('impersonation-banner');

    await apiFetch('/releases', runtime.apiRequest);

    expect(actingAsSent(requestsTo('/releases').at(-1)!)).toBe(ana);
    expect(requestsTo('/me').map(actingAsSent)).toEqual(requestsTo('/me').map(() => null));
  });

  it('is self for anyone acting as himself', async () => {
    me = { ...himself(), user: { id: 'user-one', email: 'review@example.test' } };
    const runtime = mountApp(authFixture(makeSession()).client);
    await screen.findByTestId('dashboard-page');

    await apiFetch('/releases', runtime.apiRequest);

    expect(actingAsSent(requestsTo('/releases').at(-1)!)).toBe('self');
  });

  it('stays the first one even when a later answer differs', async () => {
    me = actingAs(ana);
    const runtime = mountApp(admin().client);
    await screen.findByTestId('impersonation-banner');

    me = actingAs(radu);
    focusTheWindow();
    await waitFor(() => expect(openHome).toHaveBeenCalled());
    await apiFetch('/releases', runtime.apiRequest);

    expect(actingAsSent(requestsTo('/releases').at(-1)!)).toBe(ana);
  });

  it.each([
    ['switched', () => actingAs(radu), null],
    ['ended', () => himself(), '1'],
  ])(
    'leaves when the API says it no longer holds, and learns from /me that it %s',
    async (_, now, mark) => {
      me = actingAs(ana);
      const runtime = mountApp(admin().client);
      await screen.findByTestId('impersonation-banner');
      me = now();
      otherAnswer = (pathname) => (pathname === '/clients' ? identityChanged() : undefined);
      const asked = requestsTo('/me').length;

      await expect(
        apiFetch('/clients', { ...runtime.apiRequest, method: 'POST' })
      ).rejects.toMatchObject({ status: 409 });

      expect(await screen.findByTestId('identity-reloading')).toBeTruthy();
      await waitFor(() => expect(openHome).toHaveBeenCalledOnce());
      expect(requestsTo('/me').length).toBeGreaterThan(asked);
      expect(actingAsSent(requestsTo('/me').at(-1)!)).toBeNull();
      expect(sessionStorage.getItem(endedKey)).toBe(mark);
    }
  );

  it('leaves even when /me cannot be read after the API refused', async () => {
    me = actingAs(ana);
    const runtime = mountApp(admin().client);
    await screen.findByTestId('impersonation-banner');
    meAnswer = () => Response.json({ error: 'internal_error', message: 'Down.' }, { status: 500 });
    otherAnswer = (pathname) => (pathname === '/clients' ? identityChanged() : undefined);

    await expect(apiFetch('/clients', runtime.apiRequest)).rejects.toMatchObject({ status: 409 });

    await waitFor(() => expect(openHome).toHaveBeenCalledOnce());
    expect(screen.getByTestId('identity-reloading')).toBeTruthy();
  });
});

describe('an upload', () => {
  const sent: { url: string; headers: Record<string, string> }[] = [];
  let status = 201;
  let body = '{"file":{"id":"f"}}';

  class FakeXhr {
    upload = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    status = 0;
    responseText = '';
    responseURL = '';
    private url = '';
    private headers: Record<string, string> = {};
    open(_method: string, url: URL | string) {
      this.url = String(url);
    }
    setRequestHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    }
    getResponseHeader() {
      return null;
    }
    abort() {
      this.onabort?.();
    }
    send() {
      sent.push({ url: this.url, headers: this.headers });
      this.status = status;
      this.responseText = body;
      this.responseURL = this.url;
      this.onload?.();
    }
  }

  beforeEach(() => {
    sent.length = 0;
    status = 201;
    body = '{"file":{"id":"f"}}';
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  });

  it('goes as the identity the page was built for, and leaves when that no longer holds', async () => {
    me = actingAs(ana);
    const runtime = mountApp(admin().client);
    await screen.findByTestId('impersonation-banner');

    await apiUpload('/clients/c/files', new Blob(['bytes']), runtime.apiRequest);
    expect(sent[0]?.headers[actingAsHeader.toLowerCase()]).toBe(ana);

    me = actingAs(radu);
    status = 409;
    body = JSON.stringify({ error: 'conflict', message: 'Conflict.', reason: 'identity_changed' });
    await expect(
      apiUpload('/clients/c/files', new Blob(['bytes']), runtime.apiRequest)
    ).rejects.toMatchObject({ status: 409 });

    await waitFor(() => expect(openHome).toHaveBeenCalledOnce());
  });

  it('says why it was refused while acting as a member', async () => {
    me = actingAs(ana);
    const runtime = mountApp(admin().client);
    await screen.findByTestId('impersonation-banner');
    status = 403;
    body = JSON.stringify({
      error: 'forbidden',
      message: 'Forbidden.',
      reason: 'impersonation_refused',
    });

    await expect(
      apiUpload('/clients/c/files', new Blob(['bytes']), runtime.apiRequest)
    ).rejects.toMatchObject({ status: 403 });

    expect(await screen.findByText(impersonationRefusedMessage)).toBeTruthy();
  });
});

describe('an admin without an organization of his own', () => {
  it('is shown the way back to the admin area, not sent to set up an organization', async () => {
    me = himself({ organization: false });
    const runtime = mountApp(admin().client);

    const page = await screen.findByTestId('admin-without-organization');
    expect(within(page).getByRole('heading').textContent).toBe('Nu acționezi ca un membru');
    expect(within(page).getByTestId('admin-area-link').getAttribute('href')).toBe(
      'http://localhost:5176/'
    );
    expect(within(page).getByTestId('onboarding-sign-out')).toBeTruthy();
    expect(runtime.router.state.location.pathname).toBe('/dashboard');
  });

  it('is told the impersonation ended when he just ended it', async () => {
    sessionStorage.setItem(endedKey, '1');
    me = himself({ organization: false });
    mountApp(admin().client);

    const page = await screen.findByTestId('admin-without-organization');
    expect(within(page).getByRole('heading').textContent).toBe('Acțiunea ca membru s-a încheiat');
  });

  it('is not told so on a later visit by a page that never showed it', async () => {
    sessionStorage.setItem(endedKey, '1');
    me = himself();
    mountApp(admin().client);
    await screen.findByTestId('dashboard-page');
    expect(sessionStorage.getItem(endedKey)).toBeNull();
    cleanup();
    disposeRuntimes();

    me = himself({ organization: false });
    mountApp(admin().client);

    const page = await screen.findByTestId('admin-without-organization');
    expect(within(page).getByRole('heading').textContent).toBe('Nu acționezi ca un membru');
  });

  it('acts as a member who left their organization, and can end it there', async () => {
    me = { ...actingAs(ana), membership: null };
    me.impersonation!.targetOrganizationId = null as unknown as string;
    mountApp(admin().client);

    const page = await screen.findByTestId('admin-without-organization');
    expect(within(page).getByRole('heading').textContent).toBe(
      'Membrul nu mai face parte dintr-o organizație'
    );
    const banner = screen.getByTestId('impersonation-banner');
    expect(within(banner).getByTestId('impersonation-target').textContent).toBe(
      'Acționezi ca Ana Popescu'
    );
    await userEvent.setup().click(within(banner).getByRole('button', { name: 'Încheie' }));
    await waitFor(() => expect(openHome).toHaveBeenCalledOnce());
  });

  it('leaves a new account without an organization to set one up', async () => {
    me = { ...himself({ organization: false }), user: { id: 'user-one', email: null } };
    const runtime = mountApp(authFixture(makeSession()).client);

    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/configurare'));
    expect(screen.queryByTestId('admin-without-organization')).toBeNull();
  });
});

describe('signing out while acting as a member', () => {
  async function signOut() {
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('account-menu'));
    await user.click(screen.getByTestId('account-sign-out'));
    await screen.findByTestId('login-page');
  }

  it('ends the impersonation first', async () => {
    me = actingAs(ana);
    const { client } = admin();
    mountApp(client);
    await screen.findByTestId('impersonation-banner');

    await signOut();

    const [ended] = requestsTo('/me/impersonation', 'DELETE');
    expect(ended).toBeTruthy();
    const endedAt = fetchMock.mock.invocationCallOrder[fetchMock.mock.calls.indexOf(ended!)]!;
    expect(endedAt).toBeLessThan(client.signOut.mock.invocationCallOrder[0]!);
  });

  it('signs out even when ending fails', async () => {
    me = actingAs(ana);
    otherAnswer = (pathname, init) =>
      init?.method === 'DELETE'
        ? Response.json({ error: 'internal_error', message: 'Down.' }, { status: 500 })
        : undefined;
    const { client } = admin();
    mountApp(client);
    await screen.findByTestId('impersonation-banner');

    await signOut();

    expect(client.signOut).toHaveBeenCalledOnce();
  });

  it('does not ask to end what is not there', async () => {
    me = himself();
    mountApp(admin().client);
    await screen.findByTestId('dashboard-page');

    await signOut();

    expect(requestsTo('/me/impersonation', 'DELETE')).toHaveLength(0);
  });
});

describe('a request refused while acting as a member', () => {
  const refused = () =>
    Response.json(
      { error: 'forbidden', message: 'Forbidden.', reason: 'impersonation_refused' },
      { status: 403 }
    );

  it('says why in one message, whichever page sent it', async () => {
    me = actingAs(ana);
    const runtime = mountApp(admin().client);
    await screen.findByTestId('impersonation-banner');
    otherAnswer = (pathname, init) => (init?.method === 'POST' ? refused() : undefined);
    const request = { ...runtime.apiRequest, method: 'POST' };

    await expect(apiFetch('/invitations', request)).rejects.toMatchObject({ status: 403 });
    await expect(apiFetch('/signing-codes', request)).rejects.toMatchObject({ status: 403 });

    await waitFor(() => expect(screen.getAllByText(impersonationRefusedMessage)).toHaveLength(1));
  });

  it('leaves the message to a page that words it itself', async () => {
    me = actingAs(ana);
    const runtime = mountApp(admin().client);
    await screen.findByTestId('impersonation-banner');
    otherAnswer = (pathname, init) => (init?.method === 'POST' ? refused() : undefined);

    await expect(
      apiFetch('/invitations', wordingRefusalHere({ ...runtime.apiRequest, method: 'POST' }))
    ).rejects.toMatchObject({ status: 403 });
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(screen.queryByText(impersonationRefusedMessage)).toBeNull();
  });
});
