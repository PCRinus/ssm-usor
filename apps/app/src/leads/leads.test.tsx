import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '../test/auth-fixture';
import { disposeRuntimes, mountApp } from '../test/mount';

const leadId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const lead = {
  id: leadId,
  legalName: 'VELOCITA URBANA SRL',
  cui: '41760933',
  vatPayer: false,
  caenCode: '5630',
  tradeRegisterNumber: 'J40/13726/2019',
  countyCode: 'B',
  locality: 'București',
  addressLine: 'Calea Victoriei 122A',
  legalRepresentativeName: null,
  declaredEmployeeCount: 6,
  stage: 'lead',
  contactName: 'Andrei Pop' as string | null,
  contactEmail: 'andrei@velocita.example' as string | null,
  contactPhone: null as string | null,
  promotedAt: null as string | null,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null as string | null,
};
const promoted = { ...lead, stage: 'client', promotedAt: '2026-09-21T09:00:00+00:00' };

const page = (items: unknown[]) => ({ items, page: 1, pageSize: 25, total: items.length });

type Route = (init: RequestInit | undefined, url: URL) => Response;

const fetchMock = vi.fn<typeof fetch>();

function mockApi(
  routes: Partial<
    Record<'list' | 'get' | 'create' | 'promote' | 'archive' | 'notes' | 'saveNotes', Route>
  > & { role?: 'owner' | 'specialist' } = {}
) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const path = url.pathname;
    if (path === '/me') {
      return Response.json({
        user: { id: 'user-one', email: 'review@example.test' },
        profile: { fullName: 'Ana Ionescu', professionalTitle: null },
        membership: {
          organization: { id: '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10', name: 'Safety' },
          role: routes.role ?? 'owner',
        },
      });
    }
    if (path === '/clients' && method === 'GET') {
      return routes.list?.(init, url) ?? Response.json(page([lead]));
    }
    if (path === '/clients' && method === 'POST') {
      return routes.create?.(init, url) ?? Response.json({ client: lead }, { status: 201 });
    }
    if (path === `/clients/${leadId}` && method === 'GET') {
      return routes.get?.(init, url) ?? Response.json({ client: lead });
    }
    if (path === `/clients/${leadId}/promote`) {
      return routes.promote?.(init, url) ?? Response.json({ client: promoted });
    }
    if (path === `/clients/${leadId}/archive`) {
      return (
        routes.archive?.(init, url) ??
        Response.json({ client: { ...lead, archivedAt: '2026-09-21T08:00:00+00:00' } })
      );
    }
    if (path === `/clients/${leadId}/owner-notes`) {
      return method === 'PUT'
        ? (routes.saveNotes?.(init, url) ??
            Response.json({
              notes: {
                body: JSON.parse(String(init?.body)).body,
                updatedAt: '2026-09-21T09:00:00+00:00',
              },
            }))
        : (routes.notes?.(init, url) ?? Response.json({ notes: { body: '', updatedAt: null } }));
    }
    if (path === `/clients/${leadId}/employees`) return Response.json(page([]));
    throw new Error(`Unexpected request: ${method} ${url}`);
  });
}

const requests = (path: string, method: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === path && (init?.method ?? 'GET') === method
  );

const mount = (path: string) => mountApp(authFixture(makeSession()).client, path);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('leads', () => {
  it('lists the leads with their contact, asking the API for that stage', async () => {
    mockApi();
    mount('/leads');
    const row = await screen.findByTestId('leads-row');
    expect(row.textContent).toContain('VELOCITA URBANA SRL');
    expect(row.textContent).toContain('Andrei Pop');
    expect(row.textContent).toContain('andrei@velocita.example');
    expect(row.textContent).toContain('17.09.2026');
    expect(screen.getByTestId('leads-count').textContent).toBe('1 client potențial');
    const [input] = requests('/clients', 'GET')[0]!;
    expect(new URL(String(input)).searchParams.get('stage')).toBe('lead');
    expect(await screen.findByTestId('nav-leads')).toBeTruthy();
  });

  it('is not in the navigation of a specialist, and says why the list is refused', async () => {
    mockApi({
      role: 'specialist',
      list: () => Response.json({ error: 'forbidden', message: 'owners' }, { status: 403 }),
    });
    mount('/leads');
    expect((await screen.findByTestId('leads-error')).textContent).toContain(
      'Doar administratorii organizației'
    );
    expect(screen.queryByTestId('leads-retry')).toBeNull();
    expect(screen.getByTestId('nav-clients')).toBeTruthy();
    expect(screen.queryByTestId('nav-leads')).toBeNull();
  });

  it('adds a lead with its contact and opens its page', async () => {
    mockApi();
    const runtime = mount('/leads/new');
    const user = userEvent.setup();
    await screen.findByTestId('new-lead-page');
    await user.type(screen.getByTestId('client-cui'), '41760933');
    await user.type(screen.getByTestId('client-legal-name'), 'Velocita Urbana SRL');
    await user.type(screen.getByTestId('client-contact-name'), 'Andrei Pop');
    await user.type(screen.getByTestId('client-employees'), '25');
    await user.type(screen.getByTestId('client-contact-email'), 'andrei');
    await user.click(screen.getByTestId('client-submit'));
    expect((await screen.findByTestId('contactEmail-error')).textContent).toContain(
      'adresă de email validă'
    );
    await user.type(screen.getByTestId('client-contact-email'), '@velocita.example');
    await user.click(screen.getByTestId('client-submit'));

    await screen.findByTestId('lead-page');
    expect(runtime.router.state.location.pathname).toBe(`/leads/${leadId}`);
    expect(JSON.parse(String(requests('/clients', 'POST')[0]![1]?.body))).toMatchObject({
      stage: 'lead',
      cui: '41760933',
      contactName: 'Andrei Pop',
      contactEmail: 'andrei@velocita.example',
      contactPhone: null,
      declaredEmployeeCount: 25,
    });
  });

  it('shows the contact and keeps the notes of the owners', async () => {
    mockApi({ notes: () => Response.json({ notes: { body: 'Sunat 12.09.', updatedAt: 'x' } }) });
    mount(`/leads/${leadId}`);
    const user = userEvent.setup();
    const contact = await screen.findByTestId('contact-card');
    expect(within(contact).getByTestId('contact-name').textContent).toBe('Andrei Pop');
    expect(within(contact).getByTestId('contact-phone').textContent).toBe('—');

    const notes = await screen.findByTestId('owner-notes-body');
    expect(screen.getByRole('heading', { name: 'Notițe' })).toBeTruthy();
    expect(notes.getAttribute('aria-label')).toBe('Notițe');
    await waitFor(() => expect((notes as HTMLTextAreaElement).value).toBe('Sunat 12.09.'));
    expect(screen.getByTestId('owner-notes-save')).toHaveProperty('disabled', true);
    await user.type(notes, ' Revine luni.');
    expect(screen.getByTestId('owner-notes-state').textContent).toBe('Modificări nesalvate');
    await user.click(screen.getByTestId('owner-notes-save'));
    expect(await screen.findByText('Notițele au fost salvate.')).toBeTruthy();
    expect(
      JSON.parse(String(requests(`/clients/${leadId}/owner-notes`, 'PUT')[0]![1]?.body))
    ).toEqual({ body: 'Sunat 12.09. Revine luni.' });
    await waitFor(() =>
      expect(screen.getByTestId('owner-notes-save')).toHaveProperty('disabled', true)
    );
  });

  it('promotes a lead after saying what that means, and lands on the client', async () => {
    let current: typeof lead | typeof promoted = lead;
    mockApi({
      get: () => Response.json({ client: current }),
      promote: () => {
        current = promoted;
        return Response.json({ client: promoted });
      },
    });
    const runtime = mount(`/leads/${leadId}`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('lead-promote'));
    const dialog = await screen.findByTestId('promote-lead-dialog');
    expect(dialog.textContent).toContain('îl vede toată echipa');
    expect(dialog.textContent).toContain('nu poate fi anulată');
    await user.click(screen.getByTestId('promote-lead-confirm'));

    await screen.findByTestId('client-page');
    expect(runtime.router.state.location.pathname).toBe(`/clients/${leadId}/employees`);
    expect(await screen.findByText('VELOCITA URBANA SRL este acum client.')).toBeTruthy();
  });

  it('says so when the promotion is refused, and stays on the lead', async () => {
    mockApi({
      promote: () =>
        Response.json(
          { error: 'conflict', message: 'archived', reason: 'client_archived' },
          { status: 409 }
        ),
    });
    mount(`/leads/${leadId}`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('lead-promote'));
    await user.click(await screen.findByTestId('promote-lead-confirm'));
    expect((await screen.findByTestId('promote-lead-error')).textContent).toContain(
      'Restaurează-l mai întâi'
    );
    expect(screen.getByTestId('lead-page')).toBeTruthy();
  });

  it('archives a lead in words about leads, without asking for its documents', async () => {
    mockApi();
    mount(`/leads/${leadId}`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('lead-archive'));
    const dialog = await screen.findByTestId('client-archive-dialog');
    expect(dialog.textContent).toContain('Arhivezi clientul potențial?');
    expect(dialog.textContent).toContain('lista clienților potențiali activi');
    await user.click(screen.getByTestId('client-archive-confirm'));
    expect(await screen.findByText('VELOCITA URBANA SRL a fost arhivat.')).toBeTruthy();
    expect(requests(`/clients/${leadId}/documents`, 'GET')).toHaveLength(0);
  });

  it('offers only the restore for an archived lead, with read-only notes', async () => {
    mockApi({
      get: () => Response.json({ client: { ...lead, archivedAt: '2026-09-21T08:00:00+00:00' } }),
    });
    mount(`/leads/${leadId}`);
    expect(await screen.findByTestId('lead-archived-banner')).toBeTruthy();
    expect(screen.getByTestId('lead-restore')).toBeTruthy();
    expect(screen.queryByTestId('lead-promote')).toBeNull();
    expect(screen.queryByTestId('lead-edit')).toBeNull();
    expect(await screen.findByTestId('owner-notes-body')).toHaveProperty('readOnly', true);
    expect(screen.queryByTestId('owner-notes-save')).toBeNull();
  });

  it('sends the address of a lead under /clients to its own page', async () => {
    mockApi();
    const runtime = mount(`/clients/${leadId}/employees`);
    await screen.findByTestId('lead-page');
    expect(runtime.router.state.location.pathname).toBe(`/leads/${leadId}`);
  });

  it('sends the address of a promoted lead to the client', async () => {
    mockApi({ get: () => Response.json({ client: promoted }) });
    const runtime = mount(`/leads/${leadId}`);
    await screen.findByTestId('client-page');
    expect(runtime.router.state.location.pathname).toBe(`/clients/${leadId}/employees`);
  });

  it.each([
    ['owner', true],
    ['specialist', false],
  ] as const)(
    'shows the contact of a client to the team, and the notes to an owner: %s',
    async (role, seesNotes) => {
      mockApi({ role, get: () => Response.json({ client: promoted }) });
      mount(`/clients/${leadId}/contact`);
      await screen.findByTestId('client-contact-page');
      expect(screen.getByTestId('contact-name').textContent).toBe('Andrei Pop');
      if (seesNotes) {
        expect(await screen.findByTestId('owner-notes-card')).toBeTruthy();
      } else {
        // The role arrives with /me; by then the contact is on screen.
        await waitFor(() => expect(requests('/me', 'GET').length).toBeGreaterThan(0));
        expect(screen.queryByTestId('owner-notes-card')).toBeNull();
        expect(requests(`/clients/${leadId}/owner-notes`, 'GET')).toHaveLength(0);
      }
    }
  );

  it('does not exist for a specialist', async () => {
    mockApi({
      role: 'specialist',
      get: () => Response.json({ error: 'not_found', message: 'none' }, { status: 404 }),
    });
    mount(`/leads/${leadId}`);
    expect(await screen.findByTestId('lead-not-found')).toBeTruthy();
  });
});
