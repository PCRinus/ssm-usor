import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type {
  ClientDocumentDetailsResponse,
  ClientOwnerNotesResponse,
  ClientResponse,
  FireEquipmentListResponse,
  FireInstallationListResponse,
  ImportListResponse,
  WorkplaceListResponse,
} from '@/api/generated/api';
import { fetchMock, installFetchMock, mockApi as mockRoutes } from '@/test/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { mountApp } from '@/test/mount';
import {
  clientRecord,
  documentDetailsRecord,
  employeeListItem,
  employeeRecord,
  pageOf,
} from '@/test/records';

const petromId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const navalId = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

const client = (id: string, legalName: string) =>
  clientRecord({
    id,
    legalName,
    vatPayer: true,
    caenCode: '0610',
    locality: null,
    legalRepresentativeName: null,
    declaredEmployeeCount: null,
  });

const employee = (
  id: string,
  lastName: string,
  firstName: string,
  clientId: string,
  clientName: string
) => ({
  ...employeeListItem({
    id,
    clientId,
    lastName,
    firstName,
    employeeNumber: 'A-17',
    jobTitle: 'Sudor',
    jobPosition: { id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f', name: 'Sudor' },
    hiredAt: '2020-03-01',
    workplace: null,
  }),
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

const page = (items: unknown[], total = items.length, unfilteredTotal = total) => ({
  ...pageOf(items, { total }),
  unfilteredTotal,
});

function mockApi(list: (url: URL) => Response = () => Response.json(page([popescu, taranu]))) {
  mockRoutes((_init, url) => {
    if (url.pathname === '/employees') return list(url);
    switch (`${url.pathname}${url.search}`) {
      case `/clients/${navalId}`:
        return Response.json({
          client: client(navalId, 'Șantierul Naval SA'),
          canDelete: false,
        } satisfies ClientResponse);
      case `/clients/${navalId}/document-details`:
        return Response.json({
          documentDetails: documentDetailsRecord(),
        } satisfies ClientDocumentDetailsResponse);
      case `/clients/${navalId}/owner-notes`:
        return Response.json({
          notes: { body: '', updatedAt: null },
        } satisfies ClientOwnerNotesResponse);
      case `/clients/${navalId}/workplaces`:
        return Response.json({
          items: [],
          unassignedEmployeeCount: 0,
        } satisfies WorkplaceListResponse);
      case `/clients/${navalId}/fire-equipment`:
        return Response.json({ items: [] } satisfies FireEquipmentListResponse);
      case `/clients/${navalId}/fire-installations`:
        return Response.json({ items: [] } satisfies FireInstallationListResponse);
      case `/imports?clientId=${navalId}&kind=client&status=confirmed`:
        return Response.json({ items: [] } satisfies ImportListResponse);
    }
    if (url.pathname === '/clients') {
      return Response.json(
        page([client(petromId, 'OMV PETROM SA'), client(navalId, 'Șantierul Naval SA')])
      );
    }
  });
}

const listRequests = () =>
  fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname === '/employees');

installFetchMock();

describe("the organization's employees", () => {
  it('opens from the sidebar and lists every client’s employees with their client', async () => {
    mockApi();
    const runtime = mountApp(authFixture(makeSession()).client, '/dashboard');
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('nav-employees'));
    await screen.findByTestId('organization-employees-page');
    expect(runtime.router.state.location.pathname).toBe('/angajati');
    expect(screen.getByRole('heading', { level: 1, name: 'Lucrători' })).toBeTruthy();
    expect(screen.queryByTestId('page-back')).toBeNull();

    const rows = await screen.findAllByTestId('organization-employees-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Popescu Ion')).toBeTruthy();
    expect(within(rows[0]!).getByText('OMV PETROM SA')).toBeTruthy();
    expect(within(rows[1]!).getByText('Șantierul Naval SA')).toBeTruthy();
    expect(within(rows[1]!).getByText('Marca A-17')).toBeTruthy();
    expect(screen.getByTestId('organization-employees-count').textContent).toBe('2 lucrători');
    const query = listRequests()[0]!.searchParams;
    expect(query.get('sort')).toBe('name');
    expect(query.has('q')).toBe(false);
    expect(query.has('status')).toBe(false);

    await user.click(within(rows[1]!).getByTestId('organization-employees-client'));
    expect(runtime.router.state.location.pathname).toBe(`/clienti/${navalId}/detalii`);
  });

  it('links each name to the employee’s page under their client', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, '/angajati');
    const [first] = await screen.findAllByTestId('organization-employees-open');
    expect(first!.getAttribute('href')).toBe(`/clienti/${petromId}/angajati/${popescu.id}`);
  });

  it('keeps Lucrători highlighted in the sidebar on a worker opened from it, across the worker’s tabs', async () => {
    const workerPath = `/clienti/${petromId}/angajati/${popescu.id}`;
    mockRoutes((_init, url) => {
      if (url.pathname === '/employees') return Response.json(page([popescu, taranu]));
      if (url.pathname === '/clients')
        return Response.json(page([client(petromId, 'OMV PETROM SA')]));
      if (url.pathname === '/imports') return Response.json({ items: [] });
      if (url.pathname === `/clients/${petromId}`) {
        return Response.json({ client: client(petromId, 'OMV PETROM SA') });
      }
      if (url.pathname === `/clients/${petromId}/employees/${popescu.id}`) {
        return Response.json({
          employee: employeeRecord({
            id: popescu.id,
            clientId: petromId,
            lastName: 'Popescu',
            firstName: 'Ion',
          }),
        });
      }
      if (url.pathname.startsWith(`/clients/${petromId}/`)) {
        return Response.json({}, { status: 404 });
      }
    });
    const runtime = mountApp(authFixture(makeSession()).client, '/angajati');
    const user = userEvent.setup();
    const [first] = await screen.findAllByTestId('organization-employees-open');
    await user.click(first!);
    await screen.findByTestId('employee-layout');
    expect(runtime.router.state.location.pathname).toBe(workerPath);
    expect(screen.getByTestId('nav-employees').getAttribute('aria-current')).toBe('true');
    expect(screen.getByTestId('nav-clients').getAttribute('aria-current')).toBeNull();

    await user.click(await screen.findByTestId('employee-identity-edit'));
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(`${workerPath}/editare`)
    );
    expect(screen.getByTestId('nav-employees').getAttribute('aria-current')).toBe('true');
    runtime.router.history.back();
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe(workerPath));
    expect(screen.getByTestId('nav-employees').getAttribute('aria-current')).toBe('true');

    const tabs = screen.getAllByTestId('employee-section');
    await user.click(tabs[1]!);
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(`${workerPath}/instruire/ssm`)
    );
    expect(screen.getByTestId('nav-employees').getAttribute('aria-current')).toBe('true');

    await user.click(screen.getAllByTestId('employee-section')[4]!);
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(`${workerPath}/portal`)
    );
    expect(screen.getByTestId('nav-employees').getAttribute('aria-current')).toBe('true');

    await user.click(await screen.findByTestId('employee-header-client'));
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(`/clienti/${petromId}/angajati`)
    );
    expect(screen.getByTestId('nav-clients').getAttribute('aria-current')).toBe('true');
    expect(screen.getByTestId('nav-employees').getAttribute('aria-current')).toBeNull();
  });

  it('puts the search in the URL once typing pauses and starts again from the first page', async () => {
    mockApi((url) =>
      Response.json(url.searchParams.get('q') ? page([taranu]) : page([popescu, taranu], 30))
    );
    const runtime = mountApp(authFixture(makeSession()).client, '/angajati?page=2&sort=client');
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

  it('fills the search box from the URL, reads an earlier single client, and keeps it on the other tab', async () => {
    mockApi();
    const runtime = mountApp(
      authFixture(makeSession()).client,
      `/angajati?q=popescu&clientId=${petromId}`
    );
    const user = userEvent.setup();
    await screen.findAllByTestId('organization-employees-row');
    expect((screen.getByTestId('organization-employees-search') as HTMLInputElement).value).toBe(
      'popescu'
    );
    const query = listRequests()[0]!.searchParams;
    expect(query.get('q')).toBe('popescu');
    expect(query.getAll('client')).toEqual([petromId]);
    expect(query.has('clientId')).toBe(false);
    const applied = await screen.findByTestId('organization-employees-applied-filters-client');
    await waitFor(() => expect(applied.textContent).toContain('OMV PETROM SA'));

    await user.click(screen.getByTestId('organization-employees-filter-terminated'));
    expect(runtime.router.state.location.search).toEqual({
      status: 'terminated',
      client: petromId,
      q: 'popescu',
    });
    await waitFor(() =>
      expect(listRequests().at(-1)!.searchParams.get('status')).toBe('terminated')
    );
  });

  it('says under the post when the SSM duties wait for a signature, and filters by them', async () => {
    mockApi(() =>
      Response.json(page([{ ...popescu, dutiesAcknowledgement: 'sign_again' }, taranu]))
    );
    const runtime = mountApp(authFixture(makeSession()).client, '/angajati');
    const user = userEvent.setup();
    const rows = await screen.findAllByTestId('organization-employees-row');
    expect(
      rows.map(
        (row) => within(row).queryByTestId('organization-employees-duties')?.textContent ?? null
      )
    ).toEqual(['Atribuții SSM noi, nesemnate', null]);
    await user.click(screen.getByTestId('organization-employees-filters'));
    const panel = await screen.findByTestId('organization-employees-filters-panel');
    await user.click(
      within(panel).getByTestId('organization-employees-filters-dutiesAcknowledgement-no_annex')
    );
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ dutiesAcknowledgement: 'no_annex' })
    );
    await waitFor(() =>
      expect(listRequests().at(-1)!.searchParams.getAll('dutiesAcknowledgement')).toEqual([
        'no_annex',
      ])
    );
  });

  it('chooses clients from the filters, searching them by name, and clears them', async () => {
    mockApi();
    const runtime = mountApp(authFixture(makeSession()).client, '/angajati');
    const user = userEvent.setup();
    await screen.findAllByTestId('organization-employees-row');
    await user.click(screen.getByTestId('organization-employees-filters'));
    const panel = await screen.findByTestId('organization-employees-filters-panel');
    expect(within(panel).getByRole('heading', { name: 'Instruire SSM' })).toBeTruthy();
    expect(within(panel).queryByRole('heading', { name: 'Post de lucru' })).toBeNull();
    await user.click(within(panel).getByTestId('organization-employees-filters-client-add'));
    await user.type(
      await screen.findByTestId('organization-employees-filters-client-search'),
      'santier'
    );
    expect(screen.queryByTestId(`organization-employees-filters-client-${petromId}`)).toBeNull();
    await user.click(screen.getByTestId(`organization-employees-filters-client-${navalId}`));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ client: navalId }));
    await waitFor(() =>
      expect(listRequests().at(-1)!.searchParams.getAll('client')).toEqual([navalId])
    );
    expect(runtime.router.state.location.href).toBe(`/angajati?client=${navalId}`);

    await user.keyboard('{Escape}');
    await user.keyboard('{Escape}');
    await user.click(
      await screen.findByTestId('organization-employees-applied-filters-client-remove')
    );
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
  });

  it('keeps a chosen client while the clients load, and drops one that is not among them', async () => {
    mockApi();
    const gone = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f';
    mountApp(authFixture(makeSession()).client, `/angajati?client=${navalId}&client=${gone}`);
    await screen.findAllByTestId('organization-employees-row');
    expect(listRequests()[0]!.searchParams.getAll('client')).toEqual([navalId, gone]);
    await waitFor(() =>
      expect(listRequests().at(-1)!.searchParams.getAll('client')).toEqual([navalId])
    );
    expect(
      screen.getByTestId('organization-employees-applied-filters-client').textContent
    ).toContain('Șantierul Naval SA');
  });

  it('drops words still waiting to be searched when the search is cleared', async () => {
    mockApi((url) =>
      Response.json(url.searchParams.get('q') ? page([], 0, 2) : page([popescu, taranu]))
    );
    const runtime = mountApp(authFixture(makeSession()).client, '/angajati?q=zzz');
    const user = userEvent.setup();
    const search = await screen.findByTestId('organization-employees-search');
    await screen.findByText('Niciun lucrător nu se potrivește');
    await user.clear(search);
    await user.type(search, 'nimeni');
    await user.click(screen.getByTestId('organization-employees-empty-filtered-clear'));
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(runtime.router.state.location.search).toEqual({});
    expect((search as HTMLInputElement).value).toBe('');
    expect(screen.getAllByTestId('organization-employees-row')).toHaveLength(2);
  });

  it('tells an empty organization from a search that matches no one', async () => {
    mockApi((url) => Response.json(page([], 0, url.searchParams.get('q') ? 2 : 0)));
    const runtime = mountApp(authFixture(makeSession()).client, '/angajati?q=zzz');
    const user = userEvent.setup();
    expect(await screen.findByText('Niciun lucrător nu se potrivește')).toBeTruthy();
    expect(screen.getByTestId('organization-employees-count').textContent).toBe(
      '0 din 2 lucrători'
    );
    await user.click(screen.getByTestId('organization-employees-empty-filtered-clear'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
    expect(await screen.findByText('Niciun lucrător încă')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mergi la clienți' })).toBeTruthy();
    expect(screen.queryByTestId('organization-employees-search')).toBeNull();
  });
});
