import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

const sampleClient = {
  id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  legalName: 'OMV PETROM SA',
  cui: '1590082',
  vatPayer: true,
  caenCode: '0610',
  tradeRegisterNumber: 'J1997008302407',
  countyCode: 'B',
  locality: 'Sector 1 Mun. București',
  addressLine: 'Str. Coralilor, nr. 22',
  legalRepresentativeName: null,
  declaredEmployeeCount: 120,
  currentEmployeeCount: 8,
  stage: 'client',
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  promotedAt: null,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null,
};

const archivedClient = { ...sampleClient, archivedAt: '2026-09-21T08:00:00+00:00' };

const meAs = (role: 'owner' | 'specialist') => () =>
  Response.json({
    user: { id: 'user-one', email: 'review@example.test' },
    profile: { fullName: 'Ana Ionescu', professionalTitle: null },
    membership: { organization: { id: '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10', name: 'S' }, role },
  });

const sampleCompany = {
  cui: '1590082',
  legalName: 'OMV PETROM SA',
  vatPayer: true,
  caenCode: '0610',
  tradeRegisterNumber: 'J1997008302407',
  countyCode: 'B',
  locality: 'Sector 1 Mun. București',
  addressLine: 'Str. Coralilor, nr. 22',
  registrationStatus: 'INREGISTRAT din data 23.10.1997',
  inactive: false,
};

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

const page = (items: unknown[], meta: Partial<{ page: number; total: number }> = {}) => ({
  items,
  page: meta.page ?? 1,
  pageSize: 25,
  total: meta.total ?? items.length,
});

type Route = (init: RequestInit | undefined, url: URL) => Response | Promise<Response>;

const fetchMock = vi.fn<typeof fetch>();

function mockApi(
  routes: Partial<
    Record<
      | 'me'
      | 'list'
      | 'create'
      | 'lookup'
      | 'get'
      | 'update'
      | 'archive'
      | 'restore'
      | 'details'
      | 'saveDetails',
      Route
    >
  > = {}
) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname === '/me') {
      return (
        routes.me?.(init, url) ??
        Response.json({ user: { id: 'user-one', email: 'review@example.test' } })
      );
    }
    if (url.pathname === '/clients' && method === 'GET') {
      return routes.list?.(init, url) ?? Response.json(page([]));
    }
    if (url.pathname === '/clients' && method === 'POST') {
      return routes.create?.(init, url) ?? Response.json({ client: sampleClient }, { status: 201 });
    }
    if (url.pathname === `/clients/${sampleClient.id}` && method === 'GET') {
      return routes.get?.(init, url) ?? Response.json({ client: sampleClient });
    }
    if (url.pathname === `/clients/${sampleClient.id}` && method === 'PUT') {
      return routes.update?.(init, url) ?? Response.json({ client: sampleClient });
    }
    if (url.pathname === `/clients/${sampleClient.id}/archive` && method === 'POST') {
      return routes.archive?.(init, url) ?? Response.json({ client: archivedClient });
    }
    if (url.pathname === `/clients/${sampleClient.id}/restore` && method === 'POST') {
      return routes.restore?.(init, url) ?? Response.json({ client: sampleClient });
    }
    if (url.pathname === `/clients/${sampleClient.id}/documents` && method === 'GET') {
      return Response.json({
        items: [{ draft: { id: 'r1' } }, { draft: null }, { draft: { id: 'r2' } }],
        lastGeneration: null,
      });
    }
    if (url.pathname === `/clients/${sampleClient.id}/employees` && method === 'GET') {
      return Response.json(page([]));
    }
    if (url.pathname === `/clients/${sampleClient.id}/document-details`) {
      return method === 'PUT'
        ? (routes.saveDetails?.(init, url) ??
            Response.json({ documentDetails: JSON.parse(String(init?.body)) }))
        : (routes.details?.(init, url) ?? Response.json({ documentDetails: emptyDetails }));
    }
    if (url.pathname === `/clients/${sampleClient.id}/workplaces` && method === 'GET') {
      return Response.json({ items: [] });
    }
    if (url.pathname === `/clients/${sampleClient.id}/owner-notes` && method === 'GET') {
      return Response.json({ notes: { body: '', updatedAt: null } });
    }
    if (url.pathname === '/companies/lookup') {
      return routes.lookup?.(init, url) ?? Response.json({ company: sampleCompany });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  });
}

const requests = (pathname: string, method = 'GET') =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === pathname && (init?.method ?? 'GET') === method
  );

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('clients list', () => {
  it('lists clients from the API with the VAT prefix and registered office', async () => {
    mockApi({ list: () => Response.json(page([sampleClient])) });
    mountApp(authFixture(makeSession()).client, '/clients');
    const row = await screen.findByTestId('clients-row');
    expect(within(row).getByText('OMV PETROM SA')).toBeTruthy();
    expect(within(row).getByText('CAEN 0610')).toBeTruthy();
    expect(within(row).getByText('RO1590082')).toBeTruthy();
    expect(within(row).getByText('Sector 1 Mun. București, București')).toBeTruthy();
    // The list count, not what was declared.
    expect(within(row).getByText('8')).toBeTruthy();
    expect(within(row).queryByText('120')).toBeNull();
    expect(screen.getByTestId('clients-count').textContent).toBe('1 client');
    const [url, init] = requests('/clients')[0]!;
    const query = new URL(String(url)).searchParams;
    expect(query.get('page')).toBe('1');
    expect(query.get('pageSize')).toBe('25');
    expect(query.get('sort')).toBe('legalName');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-access-token');
  });

  it('opens a client from anywhere on its row', async () => {
    mockApi({ list: () => Response.json(page([sampleClient])) });
    const runtime = mountApp(authFixture(makeSession()).client, '/clients');
    const row = await screen.findByTestId('clients-row');
    await userEvent.setup().click(within(row).getByText('RO1590082'));
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(`/clients/${sampleClient.id}/details`)
    );
  });

  it('pages and sorts through the URL', async () => {
    mockApi({
      list: (_, url) =>
        Response.json(
          page(
            url.searchParams.get('page') === '2'
              ? [{ ...sampleClient, id: 'b2', legalName: 'ZETA SRL' }]
              : [sampleClient],
            { page: Number(url.searchParams.get('page') ?? 1), total: 26 }
          )
        ),
    });
    const runtime = mountApp(authFixture(makeSession()).client, '/clients');
    const user = userEvent.setup();
    await screen.findByTestId('clients-row');
    expect(screen.getByTestId('pager-summary').textContent).toBe('1–25 din 26 clienți');
    await user.click(screen.getByTestId('pager-next'));
    await screen.findByText('ZETA SRL');
    expect(runtime.router.state.location.search).toEqual({ page: 2 });
    // A sort change replaces the entry and returns to the first page.
    await user.click(screen.getByTestId('sort-currentEmployeeCount'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ sort: 'currentEmployeeCount' })
    );
    expect(screen.getByRole('columnheader', { name: /Angajați/ }).getAttribute('aria-sort')).toBe(
      'ascending'
    );
    const last = requests('/clients').at(-1)!;
    const query = new URL(String(last[0])).searchParams;
    expect(query.get('sort')).toBe('currentEmployeeCount');
    expect(query.get('page')).toBe('1');
  });

  it('shows an empty state that leads to the creation page', async () => {
    mockApi();
    const runtime = mountApp(authFixture(makeSession()).client, '/clients');
    await screen.findByTestId('clients-empty');
    expect(screen.getByTestId('clients-count').textContent).toBe('0 clienți');
    await userEvent.setup().click(screen.getByRole('link', { name: 'Adaugă primul client' }));
    await screen.findByTestId('new-client-page');
    await waitFor(() => expect(document.title).toBe('Client nou — Clienți — SSM Ușor'));
    expect(runtime.router.state.location.pathname).toBe('/clients/new');
    const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(within(breadcrumb).getByRole('link', { name: 'Clienți' })).toBeTruthy();
    expect(within(breadcrumb).getByText('Client nou')).toBeTruthy();
  });

  it('uses the loaded client name and active section in the browser title', async () => {
    mockApi({ me: meAs('owner') });
    mountApp(authFixture(makeSession()).client, `/clients/${sampleClient.id}/employees`);
    await screen.findByTestId('client-page');
    await waitFor(() => expect(document.title).toBe('Angajați — OMV PETROM SA — SSM Ușor'));
  });

  it('explains a missing membership and can retry', async () => {
    let attempts = 0;
    mockApi({
      list: () => {
        attempts += 1;
        return attempts === 1
          ? Response.json({ error: 'forbidden', message: 'No membership' }, { status: 403 })
          : Response.json(page([sampleClient]));
      },
    });
    mountApp(authFixture(makeSession()).client, '/clients');
    const error = await screen.findByTestId('clients-error');
    expect(error.textContent).toContain('nu face parte dintr-o organizație');
    await userEvent.setup().click(screen.getByTestId('clients-retry'));
    await screen.findByTestId('clients-row');
  });

  it('protects the creation page', async () => {
    mockApi();
    const runtime = mountApp(authFixture().client, '/clients/new');
    await screen.findByTestId('login-page');
    expect(runtime.router.state.location.pathname).toBe('/login');
  });
});

describe('client section navigation', () => {
  it('shows directional controls only when more sections are offscreen', async () => {
    mockApi({ me: meAs('owner') });
    mountApp(authFixture(makeSession()).client, `/clients/${sampleClient.id}/employees`);
    const nav = await screen.findByRole('navigation', { name: 'Secțiunile clientului' });
    const viewport = nav.querySelector<HTMLDivElement>('[data-slot="section-nav-viewport"]')!;
    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 320 },
      scrollWidth: { configurable: true, value: 900 },
    });
    viewport.scrollBy = vi.fn();

    fireEvent.scroll(viewport);
    expect(within(nav).queryByRole('button', { name: /spre stânga/ })).toBeNull();
    await userEvent.setup().click(within(nav).getByRole('button', { name: /spre dreapta/ }));
    expect(viewport.scrollBy).toHaveBeenCalledWith({ left: 240, behavior: 'smooth' });

    viewport.scrollLeft = 300;
    fireEvent.scroll(viewport);
    expect(within(nav).getByRole('button', { name: /spre stânga/ })).toBeTruthy();
    expect(within(nav).getByRole('button', { name: /spre dreapta/ })).toBeTruthy();

    viewport.scrollLeft = 580;
    fireEvent.scroll(viewport);
    expect(within(nav).queryByRole('button', { name: /spre dreapta/ })).toBeNull();
  });
});

describe('client creation', () => {
  it('validates required fields and formats before contacting the API', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, '/clients/new');
    const user = userEvent.setup();
    await screen.findByTestId('new-client-page');
    await user.click(screen.getByTestId('client-submit'));
    expect((await screen.findByTestId('cui-error')).textContent).toBe('Introdu codul CUI.');
    expect(screen.getByTestId('legalName-error')).toBeTruthy();
    expect(screen.getByTestId('client-cui').getAttribute('aria-invalid')).toBe('true');
    await user.type(screen.getByTestId('client-cui'), '1590083');
    await user.type(screen.getByTestId('client-legal-name'), 'Firma');
    await user.click(screen.getByTestId('client-submit'));
    expect((await screen.findByTestId('cui-error')).textContent).toContain('CUI invalid');
    // A client's headcount is its employee list; only a lead declares one.
    expect(screen.queryByTestId('client-employees')).toBeNull();
    expect(requests('/clients', 'POST')).toHaveLength(0);
  });

  it('requires a valid CUI before looking it up', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, '/clients/new');
    const user = userEvent.setup();
    await screen.findByTestId('new-client-page');
    await user.click(screen.getByTestId('client-lookup'));
    expect((await screen.findByTestId('cui-error')).textContent).toContain('CUI valid');
    expect(requests('/companies/lookup')).toHaveLength(0);
  });

  it('prefills from ANAF, sends the normalized request, and returns to the list', async () => {
    mockApi({ list: () => Response.json(page([sampleClient])) });
    const runtime = mountApp(authFixture(makeSession()).client, '/clients/new');
    const user = userEvent.setup();
    await screen.findByTestId('new-client-page');
    await user.type(screen.getByTestId('client-cui'), 'RO 1590082');
    await user.click(screen.getByTestId('client-lookup'));
    const status = await screen.findByTestId('client-lookup-status');
    expect(status.textContent).toContain('OMV PETROM SA');
    const [lookupUrl, lookupInit] = requests('/companies/lookup')[0]!;
    expect(new URL(String(lookupUrl)).searchParams.get('cui')).toBe('1590082');
    expect(new Headers(lookupInit?.headers).get('Authorization')).toBe('Bearer test-access-token');
    expect((screen.getByTestId('client-legal-name') as HTMLInputElement).value).toBe(
      'OMV PETROM SA'
    );
    expect(screen.getByTestId('client-vat-payer').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('client-caen').textContent).toContain('0610');
    expect(screen.getByTestId('client-caen').textContent).toContain('Extracția petrolului brut');
    expect(screen.getByTestId('client-county').textContent).toContain('București');
    expect((screen.getByTestId('client-locality') as HTMLInputElement).value).toBe(
      'Sector 1 Mun. București'
    );
    await user.type(screen.getByTestId('client-representative'), 'Ion Popescu');
    await user.type(screen.getByTestId('client-contact-name'), 'Ana Contact');
    await user.click(screen.getByTestId('client-submit'));
    await screen.findByTestId('clients-page');
    expect(runtime.router.state.location.pathname).toBe('/clients');
    await screen.findByTestId('clients-row');
    const [, init] = requests('/clients', 'POST')[0]!;
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-access-token');
    expect(JSON.parse(String(init?.body))).toEqual({
      legalName: 'OMV PETROM SA',
      cui: '1590082',
      vatPayer: true,
      caenCode: '0610',
      tradeRegisterNumber: 'J1997008302407',
      countyCode: 'B',
      locality: 'Sector 1 Mun. București',
      addressLine: 'Str. Coralilor, nr. 22',
      legalRepresentativeName: 'Ion Popescu',
      contactName: 'Ana Contact',
      contactEmail: null,
      contactPhone: null,
      stage: 'client',
    });
    expect(await screen.findByText('OMV PETROM SA a fost adăugat.')).toBeTruthy();
  });

  it('keeps manual entry when ANAF has no record', async () => {
    mockApi({
      lookup: () => Response.json({ error: 'not_found', message: 'none' }, { status: 404 }),
    });
    mountApp(authFixture(makeSession()).client, '/clients/new');
    const user = userEvent.setup();
    await screen.findByTestId('new-client-page');
    await user.type(screen.getByTestId('client-cui'), '1590082');
    await user.click(screen.getByTestId('client-lookup'));
    const status = await screen.findByTestId('client-lookup-status');
    expect(status.getAttribute('role')).toBe('alert');
    expect(status.textContent).toContain('Nu am găsit');
    await user.type(screen.getByTestId('client-legal-name'), 'Firma Mea SRL');
    await user.click(screen.getByTestId('client-county'));
    await user.type(screen.getByTestId('client-county-search'), 'clu');
    await user.click(
      await within(await screen.findByRole('listbox')).findByRole('option', { name: /Cluj/ })
    );
    expect(screen.getByTestId('client-county').textContent).toContain('Cluj');
    await user.click(screen.getByTestId('client-vat-payer'));
    await user.click(screen.getByTestId('client-caen'));
    // Pasted, not typed: each keystroke filters and renders the 600 classes again.
    await user.click(screen.getByTestId('client-caen-search'));
    await user.paste('soft-ului la comanda');
    const listbox = await screen.findByRole('listbox');
    await user.click(await within(listbox).findByRole('option', { name: /6210/ }));
    expect(screen.getByTestId('client-caen').textContent).toContain('6210');
    expect(screen.getByTestId('client-caen').textContent).toContain('soft-ului la comandă');
    await user.click(screen.getByTestId('client-submit'));
    await screen.findByTestId('clients-page');
    expect(JSON.parse(String(requests('/clients', 'POST')[0]![1]?.body))).toMatchObject({
      legalName: 'Firma Mea SRL',
      cui: '1590082',
      vatPayer: true,
      countyCode: 'CJ',
      caenCode: '6210',
    });
    expect(JSON.parse(String(requests('/clients', 'POST')[0]![1]?.body))).not.toHaveProperty(
      'declaredEmployeeCount'
    );
  });

  it('finds CAEN classes by code prefix and accepts an unclassified four-digit code', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, '/clients/new');
    const user = userEvent.setup();
    await screen.findByTestId('new-client-page');
    await user.click(screen.getByTestId('client-caen'));
    await user.type(screen.getByTestId('client-caen-search'), '62');
    const listbox = await screen.findByRole('listbox');
    const options = await within(listbox).findAllByRole('option');
    expect(options[0]?.textContent).toContain('6210');
    expect(options.every((option) => /^62/.test(option.textContent ?? ''))).toBe(true);
    await user.clear(screen.getByTestId('client-caen-search'));
    await user.type(screen.getByTestId('client-caen-search'), '9999');
    await user.click(await within(listbox).findByRole('option', { name: /Folosește/ }));
    expect(screen.getByTestId('client-caen').textContent).toContain('9999');
    expect(screen.getByTestId('client-caen').textContent).toContain('nu apare');
    await user.click(screen.getByTestId('client-caen'));
    // By test id: with the whole list open, a role query names each of the 600 options.
    await user.click(await screen.findByTestId('client-caen-clear'));
    expect(screen.getByTestId('client-caen').textContent).toContain('Caută după cod');
  });

  it('reports an ANAF outage without blocking the form', async () => {
    mockApi({ lookup: () => new Response('Service Unavailable', { status: 503 }) });
    mountApp(authFixture(makeSession()).client, '/clients/new');
    const user = userEvent.setup();
    await screen.findByTestId('new-client-page');
    await user.type(screen.getByTestId('client-cui'), '1590082');
    await user.click(screen.getByTestId('client-lookup'));
    expect((await screen.findByTestId('client-lookup-status')).textContent).toContain(
      'nu este disponibil'
    );
    expect((screen.getByTestId('client-submit') as HTMLButtonElement).disabled).toBe(false);
  });

  it('maps a duplicate CUI to the field', async () => {
    mockApi({
      create: () => Response.json({ error: 'conflict', message: 'duplicate' }, { status: 409 }),
    });
    const runtime = mountApp(authFixture(makeSession()).client, '/clients/new');
    const user = userEvent.setup();
    await screen.findByTestId('new-client-page');
    await user.type(screen.getByTestId('client-cui'), '1590082');
    await user.type(screen.getByTestId('client-legal-name'), 'Firma Mea SRL');
    await user.click(screen.getByTestId('client-submit'));
    expect((await screen.findByTestId('cui-error')).textContent).toContain('Există deja');
    expect(runtime.router.state.location.pathname).toBe('/clients/new');
    const cui = screen.getByTestId('client-cui');
    await waitFor(() => expect(document.activeElement).toBe(cui));
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts).toContain(cui);
  });

  it('maps server validation issues to fields and other failures to the form', async () => {
    let attempts = 0;
    mockApi({
      create: () => {
        attempts += 1;
        return attempts === 1
          ? Response.json(
              {
                error: 'validation_error',
                message: 'invalid',
                issues: [{ path: 'caenCode', message: 'CAEN code must have four digits.' }],
              },
              { status: 400 }
            )
          : Response.json({ error: 'internal_error', message: 'boom' }, { status: 500 });
      },
    });
    mountApp(authFixture(makeSession()).client, '/clients/new');
    const user = userEvent.setup();
    await screen.findByTestId('new-client-page');
    await user.type(screen.getByTestId('client-cui'), '1590082');
    await user.type(screen.getByTestId('client-legal-name'), 'Firma Mea SRL');
    await user.click(screen.getByTestId('client-submit'));
    expect((await screen.findByTestId('caenCode-error')).textContent).toBe(
      'CAEN code must have four digits.'
    );
    await user.click(screen.getByTestId('client-submit'));
    await waitFor(() => expect(screen.getByTestId('client-form-error')).toBeTruthy());
    expect(screen.getByTestId('client-form-error').textContent).toContain('Nu am putut salva');
  });
});

describe('client editing', () => {
  it('opens the details from the list menu, where each card edits its own data', async () => {
    mockApi({ list: () => Response.json(page([sampleClient])) });
    const runtime = mountApp(authFixture(makeSession()).client, '/clients');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('clients-row-menu'));
    await user.click(await screen.findByTestId('clients-edit'));
    await screen.findByTestId('client-details-page');
    expect(runtime.router.state.location.pathname).toBe(`/clients/${sampleClient.id}/details`);
    expect(screen.getByTestId('company-edit')).toBeTruthy();
  });

  it.each(['edit', 'contact'])('sends the old /%s address to the details', async (old) => {
    mockApi();
    const runtime = mountApp(
      authFixture(makeSession()).client,
      `/clients/${sampleClient.id}/${old}`
    );
    await screen.findByTestId('client-details-page');
    expect(runtime.router.state.location.pathname).toBe(`/clients/${sampleClient.id}/details`);
  });
});

describe('client details', () => {
  const clientPath = `/clients/${sampleClient.id}`;
  const detailsPath = `${clientPath}/details`;
  const withContact = {
    ...sampleClient,
    contactName: 'Andrei Pop',
    contactEmail: 'andrei@petrom.example',
    contactPhone: '0722 000 111',
  };
  const registration = {
    legalName: 'OMV PETROM SA',
    cui: '1590082',
    vatPayer: true,
    caenCode: '0610',
    tradeRegisterNumber: 'J1997008302407',
    countyCode: 'B',
    locality: 'Sector 1 Mun. București',
    addressLine: 'Str. Coralilor, nr. 22',
  };

  it('is where a client opens, first among its sections, under a header of name, CUI and headcount', async () => {
    mockApi({ me: meAs('owner') });
    const runtime = mountApp(authFixture(makeSession()).client, clientPath);
    const page = await screen.findByTestId('client-details-page');
    expect(runtime.router.state.location.pathname).toBe(detailsPath);
    await waitFor(() => expect(document.title).toBe('Detalii — OMV PETROM SA — SSM Ușor'));
    await screen.findByTestId('owner-notes-card');
    expect(screen.getAllByTestId('client-section').map((link) => link.textContent)).toEqual([
      'Detalii',
      'Angajați',
      'Posturi de lucru',
      'Instruire și responsabili',
      'Documente SSM',
      'Contract',
      'Alte documente',
    ]);
    const cards = Array.from(page.querySelectorAll(':scope > [data-testid]')).map((card) =>
      card.getAttribute('data-testid')
    );
    expect(cards).toEqual([
      'company-card',
      'legal-representative-card',
      'workplaces-card',
      'contact-card',
      'owner-notes-card',
    ]);
    const header = screen.getByTestId('client-page').querySelector('header')!;
    expect(header.textContent).toContain('RO1590082');
    expect(header.textContent).not.toContain('CAEN');
    expect(header.textContent).not.toContain('Sediu');
    expect(within(header).queryByText('Modifică')).toBeNull();
    const company = screen.getByTestId('company-card');
    expect(within(company).getByTestId('company-cui').textContent).toBe('RO1590082');
    expect(within(company).getByTestId('company-caen').textContent).toBe(
      '0610Extracția petrolului brut'
    );
    expect(within(company).getByTestId('company-county').textContent).toBe('București');
  });

  it('corrects the registration data in place, leaving the contact alone', async () => {
    let saved = withContact;
    mockApi({
      get: () => Response.json({ client: saved }),
      update: () => {
        saved = { ...saved, legalName: 'Petrom Nou SA' };
        return Response.json({ client: saved });
      },
    });
    mountApp(authFixture(makeSession()).client, detailsPath);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('company-edit'));
    const name = screen.getByTestId<HTMLInputElement>('client-legal-name');
    expect(name.value).toBe('OMV PETROM SA');
    expect(screen.getByTestId('client-vat-payer').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByTestId('client-contact-name')).toBeNull();
    await user.clear(name);
    await user.type(name, 'Petrom Nou SA');
    await user.click(screen.getByTestId('company-save'));

    expect(await screen.findByText('Datele firmei au fost salvate.')).toBeTruthy();
    expect(JSON.parse(String(requests(clientPath, 'PUT')[0]![1]?.body))).toEqual({
      ...registration,
      legalName: 'Petrom Nou SA',
    });
    expect((await screen.findByTestId('company-legal-name')).textContent).toBe('Petrom Nou SA');
    expect(screen.queryByTestId('company-form')).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Petrom Nou SA')
    );
  });

  it('puts a taken CUI on its field and an archived client above the buttons', async () => {
    let message = 'A client with this CUI already exists in your organization.';
    let reason = 'cui_taken';
    mockApi({
      update: () => Response.json({ error: 'conflict', message, reason }, { status: 409 }),
    });
    mountApp(authFixture(makeSession()).client, detailsPath);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('company-edit'));
    await user.type(screen.getByTestId('client-locality'), ' Nord');
    await user.click(screen.getByTestId('company-save'));
    expect((await screen.findByTestId('cui-error')).textContent).toContain('Există deja');
    message = 'An archived client is not edited.';
    reason = 'client_archived';
    await user.click(screen.getByTestId('company-save'));
    expect((await screen.findByTestId('company-error')).textContent).toContain('arhivat');
  });

  it('fills the card from ANAF', async () => {
    mockApi({
      lookup: () => Response.json({ company: { ...sampleCompany, locality: 'Ploiești' } }),
    });
    mountApp(authFixture(makeSession()).client, detailsPath);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('company-edit'));
    await user.click(screen.getByTestId('client-lookup'));
    expect((await screen.findByTestId('client-lookup-status')).textContent).toContain(
      'Date preluate de la ANAF'
    );
    expect(screen.getByTestId<HTMLInputElement>('client-locality').value).toBe('Ploiești');
    expect(screen.getByTestId<HTMLButtonElement>('company-save').disabled).toBe(false);
  });

  it('gives up an edit without saving and returns to the edit button', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, detailsPath);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('company-edit'));
    await user.type(screen.getByTestId('client-legal-name'), ' X');
    await user.click(screen.getByTestId('company-cancel'));
    expect(screen.getByTestId('company-legal-name').textContent).toBe('OMV PETROM SA');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('company-edit')));
    expect(requests(clientPath, 'PUT')).toHaveLength(0);
  });

  it('adds a contact in place, sending the registration data as it is', async () => {
    let saved = sampleClient;
    mockApi({
      get: () => Response.json({ client: saved }),
      update: (init) => {
        saved = { ...saved, ...JSON.parse(String(init?.body)) };
        return Response.json({ client: saved });
      },
    });
    mountApp(authFixture(makeSession()).client, detailsPath);
    const user = userEvent.setup();
    expect(await screen.findByTestId('contact-empty')).toBeTruthy();
    expect(screen.getByTestId('contact-edit').textContent).toBe('Adaugă');
    await user.click(screen.getByTestId('contact-edit'));
    await user.type(screen.getByTestId('client-contact-name'), 'Andrei Pop');
    await user.type(screen.getByTestId('client-contact-email'), 'andrei@');
    await user.click(screen.getByTestId('contact-save'));
    expect((await screen.findByTestId('contactEmail-error')).textContent).toContain('validă');
    expect(requests(clientPath, 'PUT')).toHaveLength(0);

    await user.type(screen.getByTestId('client-contact-email'), 'petrom.example');
    await user.click(screen.getByTestId('contact-save'));
    expect(await screen.findByText('Persoana de contact a fost salvată.')).toBeTruthy();
    expect(JSON.parse(String(requests(clientPath, 'PUT')[0]![1]?.body))).toEqual({
      ...registration,
      contactName: 'Andrei Pop',
      contactEmail: 'andrei@petrom.example',
      contactPhone: null,
    });
    expect((await screen.findByTestId('contact-name')).textContent).toBe('Andrei Pop');
    expect(screen.getByTestId('contact-phone').textContent).toBe('—');
    expect(screen.getByTestId('contact-edit').textContent).toBe('Modifică');
  });

  it('shows the legal representative and corrects it in place', async () => {
    mockApi({
      details: () =>
        Response.json({
          documentDetails: {
            ...emptyDetails,
            legalRepresentativeName: 'Maria Popescu',
            legalRepresentativeRole: 'Administrator',
          },
        }),
    });
    mountApp(authFixture(makeSession()).client, detailsPath);
    const user = userEvent.setup();
    expect((await screen.findByTestId('legal-representative-name')).textContent).toBe(
      'Maria Popescu'
    );
    await user.click(screen.getByTestId('legal-representative-edit'));
    const role = screen.getByTestId<HTMLInputElement>('details-representative-role');
    expect(screen.getByTestId<HTMLButtonElement>('legal-representative-save').disabled).toBe(true);
    await user.clear(role);
    await user.type(role, 'Director general');
    await user.click(screen.getByTestId('legal-representative-save'));
    expect(await screen.findByText('Reprezentantul legal a fost salvat.')).toBeTruthy();
    expect(
      JSON.parse(String(requests(`${clientPath}/document-details`, 'PUT')[0]![1]?.body))
    ).toMatchObject({
      legalRepresentativeName: 'Maria Popescu',
      legalRepresentativeRole: 'Director general',
    });
    await waitFor(() => expect(screen.queryByTestId('legal-representative-form')).toBeNull());
  });

  it('keeps an archived client read-only on every card', async () => {
    mockApi({ me: meAs('owner'), get: () => Response.json({ client: archivedClient }) });
    mountApp(authFixture(makeSession()).client, detailsPath);
    expect(await screen.findByTestId('client-archived-banner')).toBeTruthy();
    expect(await screen.findByTestId('owner-notes-body')).toHaveProperty('readOnly', true);
    expect(await screen.findByTestId('legal-representative-empty')).toBeTruthy();
    expect(await screen.findByTestId('workplaces-empty')).toBeTruthy();
    for (const testId of [
      'company-edit',
      'legal-representative-edit',
      'workplace-add',
      'contact-edit',
      'owner-notes-save',
    ]) {
      expect(screen.queryByTestId(testId)).toBeNull();
    }
  });

  it('keeps the notes away from a specialist', async () => {
    mockApi({ me: meAs('specialist') });
    mountApp(authFixture(makeSession()).client, detailsPath);
    await screen.findByTestId('contact-card');
    await waitFor(() => expect(requests('/me').length).toBeGreaterThan(0));
    expect(screen.queryByTestId('owner-notes-card')).toBeNull();
    expect(requests(`${clientPath}/owner-notes`)).toHaveLength(0);
  });
});

describe('client archiving', () => {
  const clientPath = `/clients/${sampleClient.id}`;

  it('lets an owner archive from the list, after saying what happens to the drafts', async () => {
    let archived = false;
    mockApi({
      me: meAs('owner'),
      list: () => Response.json(page(archived ? [] : [sampleClient])),
      archive: () => {
        archived = true;
        return Response.json({ client: archivedClient });
      },
    });
    mountApp(authFixture(makeSession()).client, '/clients');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('clients-row-menu'));
    await user.click(await screen.findByTestId('clients-archive'));
    const dialog = await screen.findByTestId('client-archive-dialog');
    expect(dialog.textContent).toContain('OMV PETROM SA');
    expect((await screen.findByTestId('client-archive-drafts')).textContent).toContain(
      '2 documente sunt încă ciorne'
    );
    await user.click(screen.getByTestId('client-archive-confirm'));
    expect(await screen.findByText('OMV PETROM SA a fost arhivat.')).toBeTruthy();
    await screen.findByTestId('clients-empty');
    expect(requests(`${clientPath}/archive`, 'POST')).toHaveLength(1);
  });

  it('keeps archiving away from a specialist', async () => {
    mockApi({ me: meAs('specialist'), list: () => Response.json(page([sampleClient])) });
    mountApp(authFixture(makeSession()).client, '/clients');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('clients-row-menu'));
    await screen.findByTestId('clients-edit');
    expect(screen.queryByTestId('clients-archive')).toBeNull();
  });

  it('lists the archived clients apart, where an owner restores one', async () => {
    mockApi({
      me: meAs('owner'),
      list: (_init, url) =>
        Response.json(page(url.searchParams.get('status') === 'archived' ? [archivedClient] : [])),
    });
    const runtime = mountApp(authFixture(makeSession()).client, '/clients');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('clients-filter-archived'));
    await user.click(await screen.findByTestId('clients-row-menu'));
    expect(runtime.router.state.location.search).toEqual({ status: 'archived' });
    expect(screen.queryByTestId('clients-edit')).toBeNull();
    await user.click(await screen.findByTestId('clients-restore'));
    await user.click(await screen.findByTestId('client-archive-confirm'));
    expect(await screen.findByText('OMV PETROM SA a fost restaurat.')).toBeTruthy();
    expect(requests(`${clientPath}/restore`, 'POST')).toHaveLength(1);
  });

  it('shows an archived client read-only, with the way back for an owner', async () => {
    let client: typeof sampleClient | typeof archivedClient = archivedClient;
    mockApi({
      me: meAs('owner'),
      get: () => Response.json({ client }),
      restore: () => {
        client = sampleClient;
        return Response.json({ client });
      },
    });
    mountApp(authFixture(makeSession()).client, `${clientPath}/employees`);
    const user = userEvent.setup();
    const banner = await screen.findByTestId('client-archived-banner');
    expect(banner.textContent).toContain('Client arhivat');
    expect(screen.queryByTestId('client-archive')).toBeNull();
    expect(screen.queryByTestId('employees-add')).toBeNull();
    await user.click(await screen.findByTestId('client-restore'));
    await user.click(await screen.findByTestId('client-archive-confirm'));
    await screen.findByTestId('client-archive');
    expect(screen.queryByTestId('client-archived-banner')).toBeNull();
    expect(screen.getByTestId('employees-add')).toBeTruthy();
  });

  it('tells a specialist who can restore', async () => {
    mockApi({ me: meAs('specialist'), get: () => Response.json({ client: archivedClient }) });
    mountApp(authFixture(makeSession()).client, `${clientPath}/employees`);
    const banner = await screen.findByTestId('client-archived-banner');
    expect(banner.textContent).toContain('Un administrator al organizației îl poate restaura.');
    expect(screen.queryByTestId('client-restore')).toBeNull();
  });

  it.each([
    ['cui_taken_by_archived', 'Un client arhivat'],
    ['cui_taken_by_lead', 'printre clienții potențiali'],
  ])('says where the company holding the CUI is: %s', async (reason, wording) => {
    mockApi({
      create: () => Response.json({ error: 'conflict', message: 'taken', reason }, { status: 409 }),
    });
    mountApp(authFixture(makeSession()).client, '/clients/new');
    const user = userEvent.setup();
    await screen.findByTestId('new-client-page');
    await user.type(screen.getByTestId('client-cui'), '1590082');
    await user.type(screen.getByTestId('client-legal-name'), 'Firma Mea SRL');
    await user.click(screen.getByTestId('client-submit'));
    expect((await screen.findByTestId('cui-error')).textContent).toContain(wording);
  });
});
