import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';
import { untrained } from '@/test/training-fixture';

const petromId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const navalId = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

const client = (id: string, legalName: string) => ({
  id,
  legalName,
  cui: '1590082',
  vatPayer: true,
  caenCode: '0610',
  tradeRegisterNumber: null,
  countyCode: 'B',
  locality: null,
  addressLine: null,
  legalRepresentativeName: null,
  declaredEmployeeCount: null,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null,
});

const employee = (
  id: string,
  lastName: string,
  firstName: string,
  clientId: string,
  clientName: string
) => ({
  id,
  clientId,
  lastName,
  firstName,
  employeeNumber: 'A-17',
  email: null,
  phone: null,
  jobTitle: 'Sudor',
  jobPosition: { id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f', name: 'Sudor' },
  hiredAt: '2020-03-01',
  status: 'active',
  terminatedAt: null,
  training: untrained,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  client: { id: clientId, name: clientName },
});

const popescu = employee(
  '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  'Popescu',
  'Ion',
  petromId,
  'OMV PETROM SA'
);
const taranu = employee(
  '8d0f7780-8536-41ef-a55c-f18fd2fa1bf8',
  'Țăranu',
  'Ștefan',
  navalId,
  'Șantierul Naval SA'
);

const page = (items: unknown[], total = items.length) => ({ items, page: 1, pageSize: 25, total });

const fetchMock = vi.fn<typeof fetch>();

function mockApi(list: (url: URL) => Response = () => Response.json(page([popescu, taranu]))) {
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/me') {
      return Response.json({ user: { id: 'user-one', email: 'review@example.test' } });
    }
    if (url.pathname === '/employees') return list(url);
    if (url.pathname === '/clients') {
      return Response.json(
        page([client(petromId, 'OMV PETROM SA'), client(navalId, 'Șantierul Naval SA')])
      );
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

const listRequests = () =>
  fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname === '/employees');

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe("the organization's employees", () => {
  it('opens from the sidebar and lists every client’s employees with their client', async () => {
    mockApi();
    const runtime = mountApp(authFixture(makeSession()).client, '/dashboard');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('nav-employees'));
    await screen.findByTestId('organization-employees-page');
    expect(runtime.router.state.location.pathname).toBe('/employees');
    expect(screen.getByRole('heading', { level: 1, name: 'Angajați' })).toBeTruthy();
    const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(within(breadcrumb).getByText('Angajați')).toBeTruthy();

    const rows = await screen.findAllByTestId('organization-employees-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Popescu Ion')).toBeTruthy();
    expect(within(rows[0]!).getByText('OMV PETROM SA')).toBeTruthy();
    expect(within(rows[1]!).getByText('Șantierul Naval SA')).toBeTruthy();
    expect(within(rows[1]!).getByText('Marca A-17')).toBeTruthy();
    expect(screen.getByTestId('organization-employees-count').textContent).toBe('2 angajați');
    const query = listRequests()[0]!.searchParams;
    expect(query.get('sort')).toBe('name');
    expect(query.has('q')).toBe(false);
    expect(query.has('status')).toBe(false);

    await user.click(within(rows[1]!).getByTestId('organization-employees-client'));
    expect(runtime.router.state.location.pathname).toBe(`/clients/${navalId}/details`);
  });

  it('links each name to the employee’s page under their client', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, '/employees');
    const [first] = await screen.findAllByTestId('organization-employees-open');
    expect(first!.getAttribute('href')).toBe(`/clients/${petromId}/employees/${popescu.id}`);
  });

  it('puts the search in the URL once typing pauses and starts again from the first page', async () => {
    mockApi((url) =>
      Response.json(url.searchParams.get('q') ? page([taranu]) : page([popescu, taranu], 30))
    );
    const runtime = mountApp(authFixture(makeSession()).client, '/employees?page=2&sort=client');
    const user = userEvent.setup();
    await screen.findAllByTestId('organization-employees-row');
    const historyLength = runtime.router.history.length;
    await user.type(screen.getByTestId('organization-employees-search'), 'stefan naval');
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ sort: 'client', q: 'stefan naval' })
    );
    expect(runtime.router.history.length).toBe(historyLength);
    await waitFor(() =>
      expect(screen.getAllByTestId('organization-employees-row')).toHaveLength(1)
    );
    const searched = listRequests().filter((url) => url.searchParams.has('q'));
    expect(searched.map((url) => url.searchParams.get('q'))).toEqual(['stefan naval']);
    expect(searched[0]!.searchParams.get('page')).toBe('1');

    await user.click(screen.getByTestId('organization-employees-search-clear'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ sort: 'client' }));
    expect((screen.getByTestId('organization-employees-search') as HTMLInputElement).value).toBe(
      ''
    );
  });

  it('fills the search box from the URL and filters by client and status', async () => {
    mockApi();
    const runtime = mountApp(
      authFixture(makeSession()).client,
      `/employees?q=popescu&clientId=${petromId}`
    );
    const user = userEvent.setup();
    await screen.findAllByTestId('organization-employees-row');
    expect((screen.getByTestId('organization-employees-search') as HTMLInputElement).value).toBe(
      'popescu'
    );
    const query = listRequests()[0]!.searchParams;
    expect(query.get('q')).toBe('popescu');
    expect(query.get('clientId')).toBe(petromId);
    expect(await screen.findByText('OMV PETROM SA', { selector: 'span' })).toBeTruthy();

    await user.click(screen.getByTestId('organization-employees-filter-terminated'));
    expect(runtime.router.state.location.search).toEqual({
      status: 'terminated',
      clientId: petromId,
      q: 'popescu',
    });
    await waitFor(() =>
      expect(listRequests().at(-1)!.searchParams.get('status')).toBe('terminated')
    );
  });

  it('chooses a client from the filter and clears it', async () => {
    mockApi();
    const runtime = mountApp(authFixture(makeSession()).client, '/employees');
    const user = userEvent.setup();
    await screen.findAllByTestId('organization-employees-row');
    const filter = screen.getByTestId('organization-employees-client-filter');
    await waitFor(() => expect((filter as HTMLButtonElement).disabled).toBe(false));
    await user.click(filter);
    await user.type(screen.getByTestId('organization-employees-client-filter-search'), 'santier');
    await user.click(
      await within(await screen.findByRole('listbox')).findByRole('option', {
        name: /Șantierul Naval SA/,
      })
    );
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ clientId: navalId })
    );
    await waitFor(() => expect(listRequests().at(-1)!.searchParams.get('clientId')).toBe(navalId));

    await user.click(screen.getByTestId('organization-employees-client-filter'));
    await user.click(await screen.findByTestId('organization-employees-client-filter-clear'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
  });

  it('tells an empty organization from a search that matches no one', async () => {
    mockApi(() => Response.json(page([])));
    const runtime = mountApp(authFixture(makeSession()).client, '/employees');
    const user = userEvent.setup();
    expect(await screen.findByText('Niciun angajat încă')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mergi la clienți' })).toBeTruthy();

    await user.type(screen.getByTestId('organization-employees-search'), 'zzz');
    expect(await screen.findByText('Niciun angajat nu corespunde căutării')).toBeTruthy();
    await user.click(screen.getByTestId('organization-employees-empty-clear-search'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
    expect(await screen.findByText('Niciun angajat încă')).toBeTruthy();
    expect((screen.getByTestId('organization-employees-search') as HTMLInputElement).value).toBe(
      ''
    );
  });
});
