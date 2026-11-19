import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installFetchMock, mockApi as mockRoutes, requestsTo } from '@/test/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';
import { clientId as leadId, clientRecord, meRecord, meResponse } from '@/test/records';

const lead = clientRecord({
  legalName: 'VELOCITA URBANA SRL',
  cui: '41760933',
  tradeRegisterNumber: 'J40/13726/2019',
  addressLine: 'Calea Victoriei 122A',
  legalRepresentativeName: null,
  stage: 'lead',
  contactName: 'Andrei Pop',
  contactEmail: 'andrei@velocita.example',
});
const promoted = clientRecord({
  ...lead,
  stage: 'client',
  promotedAt: '2026-09-21T09:00:00+00:00',
});

const emptyDetails = {
  legalRepresentativeName: null,
  legalRepresentativeRole: null,
  periodicTrainingMinutes: null,
  administrativeTrainingIntervalMonths: null,
  administrativeTrainingNotApplicable: false,
  workerTrainingIntervalMonths: null,
  workerTrainingNotApplicable: false,
  trainingFirstMonth: null,
  trainingDayFrom: null,
  trainingDayTo: null,
};

const page = (items: unknown[], counts: { total?: number; unfilteredTotal?: number } = {}) => ({
  items,
  page: 1,
  pageSize: 25,
  total: counts.total ?? items.length,
  unfilteredTotal: counts.unfilteredTotal ?? counts.total ?? items.length,
});

const listed = (overrides: Record<string, unknown> = {}) => ({
  ...lead,
  currentEmployeeCount: 0,
  serviceContractState: 'none',
  serviceContractStateAt: null,
  serviceContractReturnExpiresAt: null,
  clientSince: null,
  documentation: null,
  fireSafetyDocumentation: null,
  training: null,
  canDelete: false,
  ...overrides,
});

type Route = (init: RequestInit | undefined, url: URL) => Response;

function mockApi(
  routes: Partial<
    Record<
      'list' | 'get' | 'create' | 'update' | 'promote' | 'archive' | 'notes' | 'saveNotes',
      Route
    >
  > & { role?: 'owner' | 'specialist'; offers?: boolean } = {}
) {
  const me = meRecord({
    profile: { ...meResponse.profile, fullName: 'Ana Ionescu' },
    membership: {
      organization: { ...meResponse.membership.organization, name: 'Safety' },
      role: routes.role ?? 'owner',
    },
    features: { offers: routes.offers ?? true },
  });
  mockRoutes(
    (init, url) => {
      const method = init?.method ?? 'GET';
      const path = url.pathname;
      if (path === '/clients' && method === 'GET') {
        return routes.list?.(init, url) ?? Response.json(page([listed()]));
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
      if (path === `/clients/${leadId}` && method === 'PUT') {
        return routes.update?.(init, url) ?? Response.json({ client: lead });
      }
      if (path === `/clients/${leadId}/employees`) return Response.json(page([]));
      if (path === `/clients/${leadId}/document-details`) {
        return Response.json({ documentDetails: emptyDetails });
      }
      if (path === `/clients/${leadId}/workplaces`) return Response.json({ items: [] });
      if (path === `/clients/${leadId}/files`) return Response.json({ items: [] });
    },
    { me }
  );
}

const mount = (path: string) => mountApp(authFixture(makeSession()).client, path);

afterEach(() => {
  vi.restoreAllMocks();
});

installFetchMock();

describe('leads', () => {
  it('lists the leads with their CUI, contact, workers and contract, asking the API for that stage', async () => {
    mockApi({
      list: () =>
        Response.json(
          page([
            listed({
              vatPayer: true,
              serviceContractState: 'sent',
              serviceContractStateAt: '2026-10-28T09:00:00+00:00',
              serviceContractReturnExpiresAt: '2099-01-01T00:00:00+00:00',
            }),
          ])
        ),
    });
    mount('/oferte');
    const row = await screen.findByTestId('leads-row');
    expect(within(row).getByTestId('leads-open').textContent).toBe('VELOCITA URBANA SRL');
    expect(within(row).getByTestId('leads-cui').textContent).toBe('RO41760933');
    expect(row.textContent).toContain('Andrei Pop');
    expect(row.textContent).toContain('andrei@velocita.example');
    expect(row.textContent).toContain('17.09.2026');
    expect(within(row).getByTestId('leads-contract').textContent).toBe('Trimis');
    expect(within(row).getByTestId('leads-contract-date').textContent).toBe('28.10.2026');
    const headers = within(screen.getByTestId('leads-table'))
      .getAllByRole('columnheader')
      .map((header) => header.textContent?.replace('\u2060', ''));
    expect(headers).toEqual([
      'Companie',
      'Persoană de contact',
      'Lucrători',
      'Contract',
      'Adăugat',
      'Acțiuni',
    ]);
    expect(row.querySelectorAll('td')[2]!.textContent).toBe('6');
    expect(screen.getByTestId('leads-count').textContent).toBe('1 ofertă');
    const [input] = requestsTo('/clients', 'GET')[0]!;
    expect(new URL(String(input)).searchParams.get('stage')).toBe('lead');
    expect(await screen.findByTestId('nav-leads')).toBeTruthy();
  });

  it.each([
    ['draft', null, null, 'Ciornă', null],
    ['issued', '2026-11-10T09:00:00+00:00', null, 'Emis', '10.11.2026'],
    ['received', '2026-11-13T09:00:00+00:00', null, 'Primit', '13.11.2026'],
    ['signed', '2026-11-07T09:00:00+00:00', null, 'Semnat', '07.11.2026'],
    [
      'sent',
      '2026-09-12T09:00:00+00:00',
      '2026-11-11T09:00:00+00:00',
      'Trimis',
      '12.09.2026, link expirat',
    ],
  ])(
    'says where the contract stands and since when: %s',
    async (state, stateAt, expiresAt, label, date) => {
      mockApi({
        list: () =>
          Response.json(
            page([
              listed({
                serviceContractState: state,
                serviceContractStateAt: stateAt,
                serviceContractReturnExpiresAt: expiresAt,
              }),
            ])
          ),
      });
      mount('/oferte');
      const row = await screen.findByTestId('leads-row');
      const badge = within(row).getByTestId('leads-contract');
      expect(badge.textContent).toBe(label);
      expect(badge.className.includes('bg-warning')).toBe(state === 'received');
      expect(within(row).queryByTestId('leads-contract-date')?.textContent ?? null).toBe(date);
    }
  );

  it('dates the contract and the offer by the local day, just after midnight too', async () => {
    const justAfterMidnight = (day: number) => new Date(2026, 9, day, 0, 30).toISOString();
    mockApi({
      list: () =>
        Response.json(
          page([
            listed({
              createdAt: justAfterMidnight(14),
              serviceContractState: 'issued',
              serviceContractStateAt: justAfterMidnight(28),
            }),
          ])
        ),
    });
    mount('/oferte');
    const row = await screen.findByTestId('leads-row');
    expect(within(row).getByTestId('leads-contract-date').textContent).toBe('28.10.2026');
    expect(row.textContent).toContain('14.10.2026');
  });

  it('shows a dash for a lead without a contact or a declared headcount', async () => {
    mockApi({
      list: () =>
        Response.json(
          page([listed({ contactName: null, contactEmail: null, declaredEmployeeCount: null })])
        ),
    });
    mount('/oferte');
    const row = await screen.findByTestId('leads-row');
    const cells = row.querySelectorAll('td');
    expect(cells[1]!.textContent).toBe('—');
    expect(cells[2]!.textContent).toBe('—');
    expect(within(row).getByTestId('leads-contract').textContent).toBe('Fără contract');
  });

  it('searches through the URL, never the contact, and counts the matches out of every offer', async () => {
    mockApi({
      list: (_, url) =>
        Response.json(
          url.searchParams.get('q')
            ? page([listed()], { total: 1, unfilteredTotal: 18 })
            : page([listed()], { total: 18 })
        ),
    });
    const runtime = mount('/oferte');
    await screen.findByTestId('leads-row');
    expect(screen.getByTestId('leads-count').textContent).toBe('18 oferte');
    const search = screen.getByTestId('leads-search');
    expect(search.getAttribute('placeholder')).toBe('Caută după nume, CUI sau localitate');
    await userEvent.setup().type(search, 'Sibiu');
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ q: 'Sibiu' }));
    await waitFor(() =>
      expect(screen.getByTestId('leads-count').textContent).toBe('1 din 18 oferte')
    );
    const query = new URL(String(requestsTo('/clients', 'GET').at(-1)![0])).searchParams;
    expect(query.get('q')).toBe('Sibiu');
    expect(query.get('stage')).toBe('lead');
  });

  it('filters by the contract from the panel, names the filter in the strip, and removes it there', async () => {
    mockApi({
      list: (_, url) =>
        Response.json(
          url.searchParams.has('contractState')
            ? page([listed({ serviceContractState: 'sent' })], { total: 6, unfilteredTotal: 18 })
            : page([listed()], { total: 18 })
        ),
    });
    const runtime = mount('/oferte');
    const user = userEvent.setup();
    await screen.findByTestId('leads-row');
    await user.click(screen.getByTestId('leads-filters'));
    const panel = await screen.findByTestId('leads-filters-panel');
    expect(
      within(panel)
        .getAllByRole('checkbox')
        .map((option) => option.closest('label')?.textContent)
    ).toEqual(['Fără contract', 'Ciornă', 'Emis', 'Trimis', 'Primit', 'Semnat']);
    await user.click(within(panel).getByTestId('leads-filters-contractState-sent'));
    await user.click(within(panel).getByTestId('leads-filters-contractState-received'));
    await waitFor(() =>
      expect(runtime.router.state.location.searchStr).toBe(
        '?contractState=sent&contractState=received'
      )
    );
    const query = new URL(String(requestsTo('/clients', 'GET').at(-1)![0])).searchParams;
    expect(query.getAll('contractState')).toEqual(['sent', 'received']);
    expect(query.has('contract')).toBe(false);
    await waitFor(() =>
      expect(screen.getByTestId('leads-count').textContent).toBe('6 din 18 oferte')
    );
    expect(within(panel).getByTestId('leads-filters-show').textContent).toBe('Arată 6 oferte');
    await user.click(within(panel).getByTestId('leads-filters-show'));
    const strip = screen.getByTestId('leads-applied-filters');
    expect(within(strip).getByTestId('leads-applied-filters-contractState').textContent).toContain(
      'Trimis, Primit'
    );
    await user.click(within(strip).getByRole('button', { name: 'Scoate filtrul Contract' }));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
  });

  it('sorts by the workers, the contract and the date added through the URL, not by the contact', async () => {
    mockApi();
    const runtime = mount('/oferte');
    const user = userEvent.setup();
    await screen.findByTestId('leads-row');
    expect(screen.queryByTestId('sort-contact')).toBeNull();
    await user.click(screen.getByTestId('sort-declaredEmployeeCount'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ sort: 'declaredEmployeeCount' })
    );
    await user.click(screen.getByTestId('sort-serviceContractState'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ sort: 'serviceContractState' })
    );
    await user.click(screen.getByTestId('sort-createdAt'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ sort: 'createdAt', order: 'desc' })
    );
    const sorts = requestsTo('/clients', 'GET').map(([url]) =>
      new URL(String(url)).searchParams.get('sort')
    );
    expect(sorts).toEqual(
      expect.arrayContaining(['declaredEmployeeCount', 'serviceContractState', 'createdAt'])
    );
  });

  it('says when no offer matches, and clears the filters only, keeping the search', async () => {
    mockApi({
      list: (_, url) =>
        Response.json(
          url.searchParams.has('contractState')
            ? page([], { total: 0, unfilteredTotal: 18 })
            : page([listed()], { total: 1, unfilteredTotal: 18 })
        ),
    });
    const runtime = mount('/oferte?contractState=received&q=Sibiu');
    const empty = await screen.findByTestId('leads-empty-filtered');
    expect(empty.textContent).toContain('filtrelor alese și căutării');
    expect(screen.getByTestId('leads-count').textContent).toBe('0 din 18 oferte');
    expect(screen.getByTestId('leads-add')).toBeTruthy();
    expect(screen.getByTestId('leads-search')).toBeTruthy();
    const clear = within(empty).getByTestId('leads-empty-clear');
    expect(clear.textContent).toBe('Șterge filtrele');
    await userEvent.setup().click(clear);
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ q: 'Sibiu' }));
    await screen.findByTestId('leads-row');
  });

  it('clears a search that finds nothing from the empty state', async () => {
    mockApi({
      list: (_, url) =>
        Response.json(
          url.searchParams.get('q') ? page([], { total: 0, unfilteredTotal: 18 }) : page([listed()])
        ),
    });
    const runtime = mount('/oferte?q=nimic');
    const empty = await screen.findByTestId('leads-empty-filtered');
    const clear = within(empty).getByTestId('leads-empty-clear');
    expect(clear.textContent).toBe('Șterge căutarea');
    await userEvent.setup().click(clear);
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
  });

  it('offers the first offer and no search or filter while there is none', async () => {
    mockApi({ list: () => Response.json(page([])) });
    mount('/oferte');
    const empty = await screen.findByTestId('leads-empty');
    expect(empty.textContent).toContain('Nicio ofertă încă');
    expect(within(empty).getByTestId('leads-add').textContent).toBe('Adaugă prima ofertă');
    expect(screen.getAllByTestId('leads-add')).toHaveLength(1);
    expect(screen.queryByTestId('leads-search')).toBeNull();
    expect(screen.queryByTestId('leads-filters')).toBeNull();
    expect(screen.getByTestId('leads-filter-archived')).toBeTruthy();
  });

  it('searches the archived offers but offers no filter there', async () => {
    mockApi({
      list: () => Response.json(page([listed({ archivedAt: '2026-10-01T08:00:00+00:00' })])),
    });
    mount('/oferte?status=archived&contractState=sent');
    await screen.findByTestId('leads-row');
    expect(screen.getByTestId('leads-search')).toBeTruthy();
    expect(screen.queryByTestId('leads-filters')).toBeNull();
    const query = new URL(String(requestsTo('/clients', 'GET').at(-1)![0])).searchParams;
    expect(query.get('status')).toBe('archived');
    expect(query.has('contractState')).toBe(false);
  });

  it('is not in the navigation of a specialist, and says why the list is refused', async () => {
    mockApi({
      role: 'specialist',
      list: () => Response.json({ error: 'forbidden', message: 'owners' }, { status: 403 }),
    });
    mount('/oferte');
    expect((await screen.findByTestId('leads-error')).textContent).toContain(
      'Doar adminii organizației'
    );
    expect(screen.queryByTestId('leads-retry')).toBeNull();
    expect(screen.getByTestId('nav-clients')).toBeTruthy();
    expect(screen.queryByTestId('nav-leads')).toBeNull();
  });

  it('adds a lead with its contact and opens its page', async () => {
    mockApi();
    const runtime = mount('/oferte/nou');
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
    expect(runtime.router.state.location.pathname).toBe(`/oferte/${leadId}`);
    expect(JSON.parse(String(requestsTo('/clients', 'POST')[0]![1]?.body))).toMatchObject({
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
    mount(`/oferte/${leadId}`);
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
      JSON.parse(String(requestsTo(`/clients/${leadId}/owner-notes`, 'PUT')[0]![1]?.body))
    ).toEqual({ body: 'Sunat 12.09. Revine luni.' });
    await waitFor(() =>
      expect(screen.getByTestId('owner-notes-save')).toHaveProperty('disabled', true)
    );
  });

  it('heads the page with the name, the CUI and the declared headcount, and the company below', async () => {
    mockApi();
    mount(`/oferte/${leadId}`);
    const page = await screen.findByTestId('lead-page');
    const header = page.querySelector('header')!;
    expect(within(header).getByRole('heading', { level: 1 }).textContent).toBe(
      'VELOCITA URBANA SRL'
    );
    expect(header.textContent).toContain('41760933');
    expect(within(header).getByTestId('lead-declared-employees').textContent).toBe('6');
    expect(header.textContent).not.toContain('CAEN');
    expect(header.textContent).not.toContain('Sediu');
    expect(within(header).getByTestId('lead-edit').textContent).toBe('Modifică');
    expect(within(header).getByTestId('lead-archive').textContent).toBe('Arhivează…');
    expect(within(header).getByTestId('lead-promote').textContent).toBe('Transformă în client…');

    const cards = Array.from(page.querySelectorAll('[data-testid$="-card"]'))
      .map((card) => card.getAttribute('data-testid'))
      .filter((id) => !id!.startsWith('contract-'));
    expect(cards).toEqual([
      'company-card',
      'contact-card',
      'service-contract-card',
      'client-files-card',
      'owner-notes-card',
    ]);
    const company = screen.getByTestId('company-card');
    expect(within(company).getByTestId('company-caen').textContent).toBe(
      '5630Baruri și alte activități de servire a băuturilor'
    );
    expect(within(company).getByTestId('company-locality').textContent).toBe('București');
  });

  it("keeps its own cards when the client's details read as one summary", async () => {
    mockApi();
    mount(`/oferte/${leadId}`);
    const company = await screen.findByTestId('company-card');
    expect(within(company).getByRole('heading', { level: 2 }).textContent).toBe('Date firmă');
    expect(within(company).getByTestId('company-legal-name').textContent).toBe(
      'VELOCITA URBANA SRL'
    );
    expect(within(company).getByTestId('company-cui').textContent).toBe('41760933');
    expect(within(company).getByTestId('company-edit').getAttribute('data-variant')).toBe(
      'secondary'
    );
    expect(screen.queryByTestId('company-people-panel')).toBeNull();
    expect(within(screen.getByTestId('contact-card')).getByRole('heading').textContent).toBe(
      'Persoană de contact'
    );
    expect(await screen.findByTestId('owner-notes-body')).toBeTruthy();
    expect(screen.getByTestId('owner-notes-save').textContent).toBe('Salvează notițele');
    expect(screen.queryByTestId('owner-notes-edit')).toBeNull();
  });

  it('corrects the company data of a lead in place, keeping its declared headcount', async () => {
    let saved = lead;
    mockApi({
      get: () => Response.json({ client: saved }),
      update: (init) => {
        saved = { ...saved, ...JSON.parse(String(init?.body)) };
        return Response.json({ client: saved });
      },
    });
    mount(`/oferte/${leadId}`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('company-edit'));
    const address = screen.getByTestId<HTMLInputElement>('client-address');
    await user.clear(address);
    await user.type(address, 'Str. Nouă 1');
    await user.click(screen.getByTestId('company-save'));

    expect(await screen.findByText('Datele firmei au fost salvate.')).toBeTruthy();
    const body = JSON.parse(String(requestsTo(`/clients/${leadId}`, 'PUT')[0]![1]?.body));
    expect(body).toMatchObject({ addressLine: 'Str. Nouă 1', declaredEmployeeCount: 6 });
    expect(body).not.toHaveProperty('contactName');
    expect((await screen.findByTestId('company-address')).textContent).toBe('Str. Nouă 1');
  });

  it('edits the contact on the lead page, keeping what the lead declared', async () => {
    let saved = lead;
    mockApi({
      get: () => Response.json({ client: saved }),
      update: (init) => {
        saved = { ...saved, ...JSON.parse(String(init?.body)) };
        return Response.json({ client: saved });
      },
    });
    const runtime = mount(`/oferte/${leadId}`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('contact-edit'));
    await user.type(screen.getByTestId('client-contact-phone'), '0722 000 111');
    await user.click(screen.getByTestId('contact-save'));

    expect(await screen.findByText('Persoana de contact a fost salvată.')).toBeTruthy();
    expect(JSON.parse(String(requestsTo(`/clients/${leadId}`, 'PUT')[0]![1]?.body))).toEqual({
      legalName: 'VELOCITA URBANA SRL',
      cui: '41760933',
      vatPayer: false,
      caenCode: '5630',
      tradeRegisterNumber: 'J40/13726/2019',
      countyCode: 'B',
      locality: 'București',
      addressLine: 'Calea Victoriei 122A',
      declaredEmployeeCount: 6,
      contactName: 'Andrei Pop',
      contactEmail: 'andrei@velocita.example',
      contactPhone: '0722 000 111',
    });
    expect((await screen.findByTestId('contact-phone')).textContent).toBe('0722 000 111');
    expect(runtime.router.state.location.pathname).toBe(`/oferte/${leadId}`);
    expect(screen.getByTestId('lead-edit')).toBeTruthy();
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
    const runtime = mount(`/oferte/${leadId}`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('lead-promote'));
    const dialog = await screen.findByTestId('promote-lead-dialog');
    expect(dialog.textContent).toContain('îl vede toată echipa');
    expect(dialog.textContent).toContain('nu poate fi anulată');
    await user.click(screen.getByTestId('promote-lead-confirm'));

    await screen.findByTestId('client-details-page');
    expect(runtime.router.state.location.pathname).toBe(`/clienti/${leadId}/detalii`);
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
    mount(`/oferte/${leadId}`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('lead-promote'));
    await user.click(await screen.findByTestId('promote-lead-confirm'));
    expect((await screen.findByTestId('promote-lead-error')).textContent).toContain(
      'Reactivează-o mai întâi'
    );
    expect(screen.getByTestId('lead-page')).toBeTruthy();
  });

  it('archives a lead in words about leads, without asking for its documents', async () => {
    mockApi();
    mount(`/oferte/${leadId}`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('lead-archive'));
    const dialog = await screen.findByTestId('client-archive-dialog');
    expect(dialog.textContent).toContain('Arhivezi oferta?');
    expect(dialog.textContent).toContain('lista ofertelor active');
    await user.click(screen.getByTestId('client-archive-confirm'));
    expect(await screen.findByText('VELOCITA URBANA SRL a fost arhivat.')).toBeTruthy();
    expect(requestsTo(`/clients/${leadId}/documents`, 'GET')).toHaveLength(0);
  });

  it('offers only the restore for an archived lead, with read-only notes', async () => {
    mockApi({
      get: () => Response.json({ client: { ...lead, archivedAt: '2026-09-21T08:00:00+00:00' } }),
    });
    mount(`/oferte/${leadId}`);
    expect(await screen.findByTestId('lead-archived-banner')).toBeTruthy();
    expect(screen.getByTestId('lead-restore')).toBeTruthy();
    expect(screen.queryByTestId('lead-promote')).toBeNull();
    expect(screen.queryByTestId('lead-edit')).toBeNull();
    expect(screen.queryByTestId('contact-edit')).toBeNull();
    expect(await screen.findByTestId('owner-notes-body')).toHaveProperty('readOnly', true);
    expect(screen.queryByTestId('owner-notes-save')).toBeNull();
  });

  it('sends the address of a lead under /clienti to its own page', async () => {
    mockApi();
    const runtime = mount(`/clienti/${leadId}/angajati`);
    await screen.findByTestId('lead-page');
    expect(runtime.router.state.location.pathname).toBe(`/oferte/${leadId}`);
  });

  it('sends the address of a promoted lead to the client', async () => {
    mockApi({ get: () => Response.json({ client: promoted }) });
    const runtime = mount(`/oferte/${leadId}`);
    await screen.findByTestId('client-details-page');
    expect(runtime.router.state.location.pathname).toBe(`/clienti/${leadId}/detalii`);
  });

  it.each([
    ['owner', true],
    ['specialist', false],
  ] as const)(
    'shows the contact of a client to the team, and the notes to an owner: %s',
    async (role, seesNotes) => {
      mockApi({ role, get: () => Response.json({ client: promoted }) });
      mount(`/clienti/${leadId}/detalii`);
      await screen.findByTestId('client-details-page');
      expect(screen.getByTestId('contact-name').textContent).toBe('Andrei Pop');
      if (seesNotes) {
        expect(await screen.findByTestId('owner-notes-card')).toBeTruthy();
      } else {
        // The role arrives with /me; by then the contact is on screen.
        await waitFor(() => expect(requestsTo('/me', 'GET').length).toBeGreaterThan(0));
        expect(screen.queryByTestId('owner-notes-card')).toBeNull();
        expect(requestsTo(`/clients/${leadId}/owner-notes`, 'GET')).toHaveLength(0);
      }
    }
  );

  it('does not exist for a specialist', async () => {
    mockApi({
      role: 'specialist',
      get: () => Response.json({ error: 'not_found', message: 'none' }, { status: 404 }),
    });
    mount(`/oferte/${leadId}`);
    expect(await screen.findByTestId('lead-not-found')).toBeTruthy();
  });
});

describe('leads on a plan without offers', () => {
  it('lists them to read, with a note that leads to the subscription, and adds none', async () => {
    mockApi({ offers: false });
    mount('/oferte');
    const row = await screen.findByTestId('leads-row');
    const notice = await screen.findByTestId('offers-plan-notice');
    expect(notice.textContent).toContain('planul Profesional');
    expect(notice.textContent).toContain('transforma în clienți');
    expect(screen.getByTestId('offers-plan-subscription').getAttribute('href')).toBe(
      '/organizatie/abonament'
    );
    expect(screen.queryByTestId('leads-add')).toBeNull();

    const user = userEvent.setup();
    await user.click(within(row).getByTestId('leads-row-menu'));
    expect(await screen.findByTestId('leads-promote')).toBeTruthy();
    expect(screen.getByTestId('leads-archive')).toBeTruthy();
    expect(screen.queryByTestId('leads-edit')).toBeNull();
  });

  it('says what the plan includes where there is no lead yet', async () => {
    mockApi({ offers: false, list: () => Response.json(page([])) });
    mount('/oferte');
    expect((await screen.findByTestId('leads-empty')).textContent).toContain('planul Profesional');
    expect(screen.getByTestId('offers-plan-notice')).toBeTruthy();
    expect(screen.queryByTestId('leads-add')).toBeNull();
  });

  it('shows a lead to read and to promote, and nothing to change', async () => {
    mockApi({ offers: false });
    mount(`/oferte/${leadId}`);
    expect((await screen.findByTestId('offers-plan-notice')).textContent).toContain(
      'transformată în client'
    );
    expect(screen.getByTestId('lead-promote')).toBeTruthy();
    expect(screen.getByTestId('lead-archive')).toBeTruthy();
    expect(screen.queryByTestId('lead-edit')).toBeNull();
    expect(screen.queryByTestId('contact-edit')).toBeNull();
    expect(await screen.findByTestId('owner-notes-body')).toHaveProperty('readOnly', true);
    expect(screen.queryByTestId('owner-notes-save')).toBeNull();
  });

  it('opens no form for a new lead or for editing one', async () => {
    mockApi({ offers: false });
    mount('/oferte/nou');
    expect(await screen.findByTestId('offers-plan-notice')).toBeTruthy();
    expect(screen.queryByTestId('client-submit')).toBeNull();
    disposeRuntimes();

    const runtime = mount(`/oferte/${leadId}/editare`);
    await screen.findByTestId('lead-page');
    expect(runtime.router.state.location.pathname).toBe(`/oferte/${leadId}`);
  });

  it('keeps everything open on a plan with offers', async () => {
    mockApi({ offers: true });
    mount(`/oferte/${leadId}`);
    expect(await screen.findByTestId('lead-edit')).toBeTruthy();
    expect(screen.queryByTestId('offers-plan-notice')).toBeNull();
  });
});
