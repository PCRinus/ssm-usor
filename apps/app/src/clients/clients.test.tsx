import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '../test/auth-fixture';
import { disposeRuntimes, mountApp } from '../test/mount';

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
    Record<'me' | 'list' | 'create' | 'lookup' | 'get' | 'update' | 'archive' | 'restore', Route>
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
    expect(within(row).getByText('120')).toBeTruthy();
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
      expect(runtime.router.state.location.pathname).toBe(`/clients/${sampleClient.id}/employees`)
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
    await user.click(screen.getByTestId('sort-declaredEmployeeCount'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ sort: 'declaredEmployeeCount' })
    );
    expect(screen.getByRole('columnheader', { name: /Angajați/ }).getAttribute('aria-sort')).toBe(
      'ascending'
    );
    const last = requests('/clients').at(-1)!;
    const query = new URL(String(last[0])).searchParams;
    expect(query.get('sort')).toBe('declaredEmployeeCount');
    expect(query.get('page')).toBe('1');
  });

  it('shows an empty state that leads to the creation page', async () => {
    mockApi();
    const runtime = mountApp(authFixture(makeSession()).client, '/clients');
    await screen.findByTestId('clients-empty');
    expect(screen.getByTestId('clients-count').textContent).toBe('0 clienți');
    await userEvent.setup().click(screen.getByRole('link', { name: 'Adaugă primul client' }));
    await screen.findByTestId('new-client-page');
    expect(runtime.router.state.location.pathname).toBe('/clients/new');
    const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(within(breadcrumb).getByRole('link', { name: 'Clienți' })).toBeTruthy();
    expect(within(breadcrumb).getByText('Client nou')).toBeTruthy();
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
    await user.type(screen.getByTestId('client-employees'), '12a');
    await user.click(screen.getByTestId('client-submit'));
    expect((await screen.findByTestId('cui-error')).textContent).toContain('CUI invalid');
    expect(screen.getByTestId('declaredEmployeeCount-error')).toBeTruthy();
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
    await user.type(screen.getByTestId('client-employees'), '120');
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
      declaredEmployeeCount: 120,
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
      declaredEmployeeCount: null,
    });
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
  const editPath = `/clients/${sampleClient.id}/edit`;
  const clientPath = `/clients/${sampleClient.id}`;

  it('opens from the list menu with the saved data and without the representative', async () => {
    mockApi({ list: () => Response.json(page([sampleClient])) });
    const runtime = mountApp(authFixture(makeSession()).client, '/clients');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('clients-row-menu'));
    await user.click(await screen.findByTestId('clients-edit'));
    await screen.findByTestId('edit-client-page');
    expect(runtime.router.state.location.pathname).toBe(editPath);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Modifică: OMV PETROM SA');
    expect((screen.getByTestId('client-cui') as HTMLInputElement).value).toBe('1590082');
    expect((screen.getByTestId('client-employees') as HTMLInputElement).value).toBe('120');
    expect(screen.getByTestId('client-vat-payer').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByTestId('client-representative')).toBeNull();
  });

  it('saves the correction and shows it on the client page', async () => {
    let saved = { ...sampleClient, legalRepresentativeName: 'Ion Popescu' };
    mockApi({
      get: () => Response.json({ client: saved }),
      update: (init) => {
        saved = { ...saved, legalName: 'Petrom Nou SA' };
        expect(JSON.parse(String(init?.body))).toEqual({
          legalName: 'Petrom Nou SA',
          cui: '1590082',
          vatPayer: true,
          caenCode: '0610',
          tradeRegisterNumber: 'J1997008302407',
          countyCode: 'B',
          locality: 'Sector 1 Mun. București',
          addressLine: 'Str. Coralilor, nr. 22',
          declaredEmployeeCount: 120,
          contactName: null,
          contactEmail: null,
          contactPhone: null,
        });
        return Response.json({ client: saved });
      },
    });
    const runtime = mountApp(authFixture(makeSession()).client, editPath);
    const user = userEvent.setup();
    await screen.findByTestId('edit-client-page');
    await user.clear(screen.getByTestId('client-legal-name'));
    await user.type(screen.getByTestId('client-legal-name'), 'Petrom Nou SA');
    await user.click(screen.getByTestId('client-submit'));
    const header = await screen.findByTestId('client-page');
    expect(runtime.router.state.location.pathname).toBe(`${clientPath}/employees`);
    expect(within(header).getByRole('heading', { level: 1 }).textContent).toBe('Petrom Nou SA');
    expect(requests(clientPath, 'PUT')).toHaveLength(1);
    expect(await screen.findByText('Datele clientului au fost salvate.')).toBeTruthy();
  });

  it('puts a taken CUI on its field and an archived client above the buttons', async () => {
    let message = 'A client with this CUI already exists in your organization.';
    let reason = 'cui_taken';
    mockApi({
      update: () => Response.json({ error: 'conflict', message, reason }, { status: 409 }),
    });
    mountApp(authFixture(makeSession()).client, editPath);
    const user = userEvent.setup();
    await screen.findByTestId('edit-client-page');
    await user.click(screen.getByTestId('client-submit'));
    expect((await screen.findByTestId('cui-error')).textContent).toContain('Există deja');
    message = 'An archived client is not edited.';
    reason = 'client_archived';
    await user.click(screen.getByTestId('client-submit'));
    expect((await screen.findByTestId('client-form-error')).textContent).toContain('arhivat');
  });

  it('leads to the form from the client page', async () => {
    mockApi();
    const runtime = mountApp(authFixture(makeSession()).client, `${clientPath}/employees`);
    await userEvent.setup().click(await screen.findByTestId('client-edit'));
    await screen.findByTestId('edit-client-page');
    expect(runtime.router.state.location.pathname).toBe(editPath);
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
    expect(screen.queryByTestId('client-edit')).toBeNull();
    expect(screen.queryByTestId('employees-add')).toBeNull();
    await user.click(await screen.findByTestId('client-restore'));
    await user.click(await screen.findByTestId('client-archive-confirm'));
    await screen.findByTestId('client-edit');
    expect(screen.queryByTestId('client-archived-banner')).toBeNull();
    expect(screen.getByTestId('employees-add')).toBeTruthy();
  });

  it('tells a specialist who can restore, and keeps the edit page closed', async () => {
    mockApi({ me: meAs('specialist'), get: () => Response.json({ client: archivedClient }) });
    const runtime = mountApp(authFixture(makeSession()).client, `${clientPath}/edit`);
    const banner = await screen.findByTestId('client-archived-banner');
    expect(banner.textContent).toContain('Un administrator al organizației îl poate restaura.');
    expect(screen.queryByTestId('client-restore')).toBeNull();
    expect(runtime.router.state.location.pathname).toBe(`${clientPath}/employees`);
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
