import type {
  AdminImpersonation,
  AdminImpersonationList,
  AdminMemberList,
  ApiErrorResponse,
} from '@ssm-usor/contracts';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { disposeAdmins, mountAdmin } from '@/test/admin-app';

const adminId = '0a1b2c3d-0000-4000-8000-000000000001';
const ionId = '0a1b2c3d-0000-4000-8000-000000000002';
const anaId = '0a1b2c3d-0000-4000-8000-000000000003';
const organization = { id: '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10', name: 'Protecția Muncii SRL' };

const members: AdminMemberList = {
  items: [
    {
      userId: adminId,
      email: 'mircea@example.ro',
      fullName: 'Mircea Casapu',
      organization: { id: '9c1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f11', name: 'SSM Ușor Test' },
      role: 'owner',
      subscription: null,
      lastSignInAt: '2026-11-10T08:00:00+00:00',
    },
    {
      userId: ionId,
      email: 'ion.popescu@example.ro',
      fullName: 'Ion Popescu',
      organization,
      role: 'specialist',
      subscription: { plan: 'profesional', status: 'past_due' },
      lastSignInAt: '2026-11-09T14:30:00+00:00',
    },
    {
      userId: anaId,
      email: 'ana@example.ro',
      fullName: null,
      organization,
      role: 'owner',
      subscription: { plan: 'start', status: 'trialing' },
      lastSignInAt: null,
    },
  ],
  page: 1,
  pageSize: 25,
  total: 40,
};

const minute = 60_000;
const at = (offset: number) => new Date(Date.now() + offset).toISOString();

function impersonationOf(
  target: (typeof members.items)[number],
  reason: string,
  overrides: Partial<AdminImpersonation> = {}
): AdminImpersonation {
  return {
    id: crypto.randomUUID(),
    target: {
      userId: target.userId,
      email: target.email,
      fullName: target.fullName,
      organization: target.organization,
      role: target.role,
    },
    reason,
    startedAt: at(-10 * minute),
    expiresAt: at(110 * minute),
    endedAt: null,
    ...overrides,
  };
}

const ion = members.items[1]!;
const ana = members.items[2]!;

let active: AdminImpersonation | null;
let history: AdminImpersonationList;
let startAnswer: (() => Response) | null;
let membersAnswer: (() => Response) | null;

const fetchMock = vi.fn<typeof fetch>();
const open = vi.fn();

const requests = () =>
  fetchMock.mock.calls.map(([input, init]) => ({
    url: new URL(String(input)),
    method: init?.method ?? 'GET',
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  }));
const requestsTo = (pathname: string, method = 'GET') =>
  requests().filter((request) => request.url.pathname === pathname && request.method === method);

beforeEach(() => {
  active = null;
  history = { items: [], page: 1, pageSize: 10, total: 0 };
  startAnswer = null;
  membersAnswer = null;
  vi.stubEnv('VITE_APP_URL', 'http://localhost:5199');
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('open', open);
  open.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname === '/api/me')
      return Response.json({ id: adminId, email: 'mircea@example.ro' });
    if (url.pathname === '/api/members') return membersAnswer?.() ?? Response.json(members);
    if (url.pathname === '/api/impersonations') return Response.json(history);
    if (url.pathname === '/api/impersonation' && method === 'GET') {
      return Response.json({ impersonation: active });
    }
    if (url.pathname === '/api/impersonation' && method === 'POST') {
      if (startAnswer) return startAnswer();
      const { targetUserId, reason } = JSON.parse(String(init?.body));
      const target = members.items.find((member) => member.userId === targetUserId)!;
      active = impersonationOf(target, reason);
      history = { ...history, items: [active, ...history.items], total: history.total + 1 };
      return Response.json(active, { status: 201 });
    }
    if (url.pathname === '/api/impersonation' && method === 'DELETE') {
      active = null;
      return new Response(null, { status: 204 });
    }
    return Response.json({ error: 'not_found', message: 'Not found.' }, { status: 404 });
  });
});

afterEach(() => {
  disposeAdmins();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function openDialogFor(name: string) {
  const user = userEvent.setup();
  const row = (await screen.findAllByTestId('member-row')).find((each) =>
    each.textContent?.includes(name)
  )!;
  await user.click(within(row).getByTestId('act-as'));
  return { user, dialog: await screen.findByTestId('start-impersonation') };
}

describe('the members list', () => {
  it('shows each member with their organization, role, plan and last sign-in, and pages on', async () => {
    const runtime = mountAdmin('/members');
    const rows = await screen.findAllByTestId('member-row');

    expect(rows).toHaveLength(3);
    const second = within(rows[1]!);
    expect(second.getByText('Ion Popescu')).toBeTruthy();
    expect(second.getByText('ion.popescu@example.ro')).toBeTruthy();
    expect(second.getByText('Protecția Muncii SRL')).toBeTruthy();
    expect(second.getByText('Specialist')).toBeTruthy();
    expect(rows[1]!.textContent).toContain('Profesional · past due');
    expect(rows[1]!.textContent).toContain('9 Nov 2026, 16:30');
    expect(rows[2]!.textContent).toContain('Start · trial');
    expect(screen.getByTestId('pager-summary').textContent).toBe('1–25 of 40 members');
    expect(requestsTo('/api/members')[0]!.url.search).toBe('?page=1&pageSize=25');

    await userEvent.setup().click(screen.getByTestId('pager-next'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ page: 2 }));
    await waitFor(() =>
      expect(requestsTo('/api/members').at(-1)!.url.searchParams.get('page')).toBe('2')
    );
  });

  it('offers no Act as on the admin’s own account', async () => {
    mountAdmin('/members');
    const rows = await screen.findAllByTestId('member-row');
    await waitFor(() => expect(within(rows[1]!).queryByTestId('act-as')).toBeTruthy());
    expect(within(rows[0]!).queryByTestId('act-as')).toBeNull();
    expect(within(rows[2]!).queryByTestId('act-as')).toBeTruthy();
  });

  it('searches through the address, back on the first page', async () => {
    const runtime = mountAdmin('/members?search=ion&page=2');
    await screen.findAllByTestId('member-row');
    const input = screen.getByTestId('members-search') as HTMLInputElement;
    expect(input.value).toBe('ion');
    expect(requestsTo('/api/members')[0]!.url.search).toBe('?page=2&pageSize=25&search=ion');

    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, '  Protecția ');

    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ search: 'Protecția' })
    );
    await waitFor(() =>
      expect(requestsTo('/api/members').at(-1)!.url.search).toBe(
        `?page=1&pageSize=25&search=${encodeURIComponent('Protecția')}`
      )
    );
    expect(
      requestsTo('/api/members').filter((request) =>
        request.url.searchParams.get('search')?.startsWith('Pro')
      )
    ).toHaveLength(1);
  });

  it('says so when nothing matches', async () => {
    membersAnswer = () => Response.json({ items: [], page: 1, pageSize: 25, total: 0 });
    mountAdmin('/members?search=nobody');
    await screen.findByText('No member matches this search.');
  });

  it('offers to try again when the API does not answer', async () => {
    membersAnswer = () =>
      Response.json({ error: 'internal_error', message: 'Down.' }, { status: 500 });
    mountAdmin('/members');
    expect(await screen.findByTestId('load-error', {}, { timeout: 10_000 })).toBeTruthy();
  });

  it('is reached from the home page and the top bar', async () => {
    const runtime = mountAdmin('/');
    await userEvent.setup().click(await screen.findByTestId('home-members'));
    await screen.findAllByTestId('member-row');
    expect(runtime.router.state.location.pathname).toBe('/members');
    expect(screen.getByTestId('nav-members').getAttribute('aria-current')).toBe('page');
  });
});

describe('starting an impersonation', () => {
  it('names the member and asks for a reason before anything is sent', async () => {
    mountAdmin('/members');
    const { user, dialog } = await openDialogFor('Ion Popescu');

    const who = within(dialog).getByTestId('start-impersonation-member').textContent;
    expect(who).toContain('Ion Popescu');
    expect(who).toContain('ion.popescu@example.ro');
    expect(who).toContain('Protecția Muncii SRL');
    expect(who).toContain('Specialist');
    expect(dialog.textContent).toContain('ends by itself after two hours');
    expect(dialog.textContent).toContain('audit log');
    expect(within(dialog).queryByTestId('start-impersonation-replaces')).toBeNull();

    await user.type(within(dialog).getByTestId('impersonation-reason'), '   ');
    await user.click(within(dialog).getByTestId('start-impersonation-submit'));

    expect(within(dialog).getByTestId('impersonation-reason-error').textContent).toBe(
      'Give the reason for acting as this member.'
    );
    expect(requestsTo('/api/impersonation', 'POST')).toHaveLength(0);
  });

  it('starts it with the trimmed reason, opens the member app and shows the strip', async () => {
    mountAdmin('/members');
    const { user, dialog } = await openDialogFor('Ion Popescu');

    await user.type(
      within(dialog).getByTestId('impersonation-reason'),
      '  The client list stays empty after the import '
    );
    await user.click(within(dialog).getByTestId('start-impersonation-submit'));

    await waitFor(() => expect(screen.queryByTestId('start-impersonation')).toBeNull());
    expect(requestsTo('/api/impersonation', 'POST').map((request) => request.body)).toEqual([
      { targetUserId: ionId, reason: 'The client list stays empty after the import' },
    ]);
    expect(open).toHaveBeenCalledWith('http://localhost:5199/', '_blank', 'noopener');
    const strip = await screen.findByTestId('impersonation-strip');
    expect(strip.textContent).toContain('Acting as Ion Popescu · Protecția Muncii SRL');
    const row = await screen.findByTestId('impersonation-row');
    expect(row.textContent).toContain('The client list stays empty after the import');
    expect(within(row).getByText('Active')).toBeTruthy();
  });

  it('says which impersonation in progress it replaces', async () => {
    active = impersonationOf(ion, 'Checking the documents tab');
    mountAdmin('/members');
    await screen.findByTestId('impersonation-strip');
    const { dialog } = await openDialogFor('ana@example.ro');

    expect(within(dialog).getByTestId('start-impersonation-replaces').textContent).toContain(
      'It replaces the impersonation of Ion Popescu in progress.'
    );
  });

  it('shows the reason the API refused as the field’s error', async () => {
    startAnswer = () =>
      Response.json(
        {
          error: 'validation_error',
          message: 'Invalid.',
          issues: [{ path: 'reason', message: 'Too big' }],
        } satisfies ApiErrorResponse,
        { status: 400 }
      );
    mountAdmin('/members');
    const { user, dialog } = await openDialogFor('Ion Popescu');
    await user.type(within(dialog).getByTestId('impersonation-reason'), 'Why');
    await user.click(within(dialog).getByTestId('start-impersonation-submit'));

    expect((await within(dialog).findByTestId('impersonation-reason-error')).textContent).toBe(
      'A reason of 1 to 500 characters is required.'
    );
    expect(within(dialog).queryByTestId('start-impersonation-error')).toBeNull();
    expect(open).not.toHaveBeenCalled();
  });

  it.each([
    ['target_not_member', 'no longer belongs to an organization'],
    ['target_is_self', 'This is your own account'],
  ])('words a refusal for %s', async (reason, words) => {
    startAnswer = () =>
      Response.json(
        { error: 'unprocessable', message: 'Refused.', reason } satisfies ApiErrorResponse,
        { status: 422 }
      );
    mountAdmin('/members');
    const { user, dialog } = await openDialogFor('Ion Popescu');
    await user.type(within(dialog).getByTestId('impersonation-reason'), 'Why');
    await user.click(within(dialog).getByTestId('start-impersonation-submit'));

    expect((await within(dialog).findByTestId('start-impersonation-error')).textContent).toContain(
      words
    );
    expect(screen.getByTestId('start-impersonation')).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
  });
});

describe('the active impersonation strip', () => {
  it('shows on every page, with a link to the member app, and ends', async () => {
    active = impersonationOf(ion, 'Checking the documents tab');
    mountAdmin('/imports');

    const strip = await screen.findByTestId('impersonation-strip');
    expect(strip.textContent).toContain('Acting as Ion Popescu · Protecția Muncii SRL · ends');
    const link = within(strip).getByTestId('impersonation-open-app') as HTMLAnchorElement;
    expect(link.href).toBe('http://localhost:5199/');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener');

    await userEvent.setup().click(within(strip).getByTestId('impersonation-end'));

    await waitFor(() => expect(screen.queryByTestId('impersonation-strip')).toBeNull());
    expect(requestsTo('/api/impersonation', 'DELETE')).toHaveLength(1);
    expect(requestsTo('/api/impersonation').length).toBeGreaterThanOrEqual(2);
  });

  it('names a member without a name by their email, and counts the minutes left', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-11T10:00:00Z'), shouldAdvanceTime: true });
    active = impersonationOf(ana, 'Signing codes', {
      startedAt: '2026-11-11T08:05:00Z',
      expiresAt: '2026-11-11T10:05:00Z',
    });
    mountAdmin('/members');

    const summary = await screen.findByTestId('impersonation-summary');
    expect(summary.textContent).toBe(
      'Acting as ana@example.ro · Protecția Muncii SRL · ends 12:05 (5 min left)'
    );
  });

  it('goes by itself when the impersonation expires', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-11T10:00:00Z'), shouldAdvanceTime: true });
    active = impersonationOf(ion, 'Checking the documents tab', {
      startedAt: '2026-11-11T08:05:00Z',
      expiresAt: '2026-11-11T10:05:00Z',
    });
    mountAdmin('/members');
    await screen.findByTestId('impersonation-strip');
    const before = requestsTo('/api/impersonation').length;

    act(() => vi.advanceTimersByTime(4 * minute));
    expect(screen.getByTestId('impersonation-summary').textContent).toContain('(1 min left)');

    act(() => vi.advanceTimersByTime(minute));

    expect(screen.queryByTestId('impersonation-strip')).toBeNull();
    await waitFor(() => expect(requestsTo('/api/impersonation').length).toBeGreaterThan(before));
    expect(screen.queryByTestId('impersonation-strip')).toBeNull();
  });
});

describe('recent impersonations', () => {
  it('lists the admin’s own with their member, reason and how each ended', async () => {
    history = {
      items: [
        impersonationOf(ion, 'Checking the documents tab'),
        impersonationOf(ana, 'Signing codes', {
          startedAt: '2026-11-10T08:00:00Z',
          expiresAt: '2026-11-10T10:00:00Z',
          endedAt: '2026-11-10T08:30:00Z',
        }),
        impersonationOf(
          { ...ion, organization: { id: organization.id, name: 'Protecția Muncii SRL' } },
          'Import review',
          { startedAt: '2026-11-09T08:00:00Z', expiresAt: '2026-11-09T10:00:00Z' }
        ),
      ],
      page: 1,
      pageSize: 10,
      total: 12,
    };
    history.items[2]!.target.organization = null;
    mountAdmin('/members');

    const rows = await screen.findAllByTestId('impersonation-row');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText('Active')).toBeTruthy();
    expect(rows[0]!.textContent).toContain('Checking the documents tab');
    expect(rows[1]!.textContent).toContain('ana@example.ro');
    expect(rows[1]!.textContent).toContain('Ended 10 Nov 2026, 10:30');
    expect(rows[2]!.textContent).toContain('Expired 9 Nov 2026, 12:00');
    expect(rows[2]!.textContent).toContain('No longer a member');
    expect(screen.getByTestId('impersonations-pager-summary').textContent).toBe(
      '1–10 of 12 impersonations'
    );
    expect(requestsTo('/api/impersonations')[0]!.url.search).toBe('?page=1&pageSize=10');

    await userEvent.setup().click(screen.getByTestId('impersonations-pager-next'));
    await waitFor(() =>
      expect(requestsTo('/api/impersonations').at(-1)!.url.searchParams.get('page')).toBe('2')
    );
  });
});
