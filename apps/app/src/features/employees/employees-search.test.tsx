import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type {
  FoundSheetsResponse,
  ImportListResponse,
  JobPositionListResponse,
} from '@/api/generated/api';
import { fetchMock, installFetchMock, mockApi as mockRoutes } from '@/test/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { mountApp } from '@/test/mount';
import { clientId, clientRecord, employeeListItem, pageOf } from '@/test/records';

const employeesPath = `/clients/${clientId}/employees`;
const employeesPage = `/clienti/${clientId}/angajati`;

const sampleClient = clientRecord({
  legalName: 'OMV PETROM SA',
  vatPayer: true,
  caenCode: '0610',
  locality: null,
  legalRepresentativeName: null,
  declaredEmployeeCount: null,
});

const employee = (id: string, lastName: string, firstName: string) =>
  employeeListItem({
    id,
    lastName,
    firstName,
    jobTitle: 'Sudor',
    jobPosition: { id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f', name: 'Sudor' },
    hiredAt: '2020-03-01',
    workplace: null,
  });

const popescu = employee('7c9e6679-7425-40de-944b-e07fc1f90ae7', 'Popescu', 'Ion');
const taranu = employee('8d0f7780-8536-41ef-a55c-f18fd2fa1bf8', 'Țăranu', 'Ștefan');

const page = (items: unknown[], unfilteredTotal = items.length) => ({
  ...pageOf(items),
  unfilteredTotal,
});

function mockApi(list: (url: URL) => Response) {
  mockRoutes((_init, url) => {
    if (url.pathname === `/clients/${clientId}`) return Response.json({ client: sampleClient });
    if (url.pathname === employeesPath) return list(url);
    if (url.pathname === `/clients/${clientId}/workplaces`) return Response.json({ items: [] });
    if (url.pathname === `/clients/${clientId}/job-positions`) {
      return Response.json({ items: [] } satisfies JobPositionListResponse);
    }
    if (url.pathname === `/clients/${clientId}/found-sheets`) {
      return Response.json({ items: [], total: 0 } satisfies FoundSheetsResponse);
    }
    if (
      url.pathname === '/imports' &&
      url.searchParams.get('clientId') === clientId &&
      url.searchParams.get('kind') === 'employees'
    ) {
      return Response.json({ items: [] } satisfies ImportListResponse);
    }
  });
}

const listQueries = () =>
  fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname === employeesPath)
    .map((url) => url.searchParams);

installFetchMock();

describe("searching a client's employees", () => {
  it('sends the search once typing pauses, in the URL, without a history entry', async () => {
    mockApi((url) =>
      Response.json(url.searchParams.get('q') === 'stef' ? page([taranu]) : page([popescu, taranu]))
    );
    const runtime = mountApp(authFixture(makeSession()).client, `${employeesPage}?page=2`);
    const user = userEvent.setup();
    await screen.findAllByTestId('employees-row');
    const historyLength = runtime.router.history.length;
    await user.type(screen.getByTestId('employees-search'), 'stef');
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ q: 'stef' }));
    expect(runtime.router.history.length).toBe(historyLength);
    await waitFor(() => expect(screen.getAllByTestId('employees-row')).toHaveLength(1));
    expect(screen.getByText('Țăranu Ștefan')).toBeTruthy();
    expect(listQueries().map((query) => query.get('q'))).toEqual([null, 'stef']);
    expect(listQueries()[1]!.get('page')).toBe('1');
  });

  it('keeps the search when switching to former employees', async () => {
    mockApi(() => Response.json(page([popescu])));
    const runtime = mountApp(authFixture(makeSession()).client, `${employeesPage}?q=popescu`);
    const user = userEvent.setup();
    await screen.findAllByTestId('employees-row');
    expect((screen.getByTestId('employees-search') as HTMLInputElement).value).toBe('popescu');
    expect(listQueries()[0]!.get('q')).toBe('popescu');
    await user.click(screen.getByTestId('employees-filter-terminated'));
    expect(runtime.router.state.location.search).toEqual({ status: 'terminated', q: 'popescu' });
  });

  it('follows the URL back to an earlier search', async () => {
    mockApi(() => Response.json(page([popescu])));
    const runtime = mountApp(authFixture(makeSession()).client, `${employeesPage}?q=ion`);
    await screen.findAllByTestId('employees-row');
    act(() => {
      void runtime.router.navigate({ to: '/clienti/$clientId/angajati', params: { clientId } });
    });
    await waitFor(() =>
      expect((screen.getByTestId('employees-search') as HTMLInputElement).value).toBe('')
    );
  });

  it('says when no one matches and clears the search', async () => {
    mockApi((url) => Response.json(url.searchParams.get('q') ? page([], 1) : page([popescu])));
    const runtime = mountApp(authFixture(makeSession()).client, `${employeesPage}?q=zzz`);
    const user = userEvent.setup();
    expect(await screen.findByText('Niciun lucrător nu se potrivește')).toBeTruthy();
    expect(
      screen.getByText(
        'Niciun lucrător actual nu se potrivește căutării „zzz”. Caută după nume sau marcă.'
      )
    ).toBeTruthy();
    expect(screen.queryByTestId('employees-start-ways')).toBeNull();
    expect(screen.getByTestId('employees-count').textContent).toBe('0 din 1 lucrător');
    await user.click(screen.getByTestId('employees-empty-filtered-clear'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
    await screen.findByTestId('employees-row');
    expect((screen.getByTestId('employees-search') as HTMLInputElement).value).toBe('');
  });

  it('clears the box with Escape', async () => {
    mockApi(() => Response.json(page([popescu])));
    const runtime = mountApp(authFixture(makeSession()).client, `${employeesPage}?q=ion`);
    const user = userEvent.setup();
    await screen.findAllByTestId('employees-row');
    await user.click(screen.getByTestId('employees-search'));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
  });
});
