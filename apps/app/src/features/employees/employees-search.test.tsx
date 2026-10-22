import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';
import { noTests, untrained } from '@/test/training-fixture';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const employeesPath = `/clients/${clientId}/employees`;

const sampleClient = {
  id: clientId,
  legalName: 'OMV PETROM SA',
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
};

const employee = (id: string, lastName: string, firstName: string) => ({
  id,
  clientId,
  lastName,
  firstName,
  employeeNumber: null,
  email: null,
  phone: null,
  jobTitle: 'Sudor',
  jobPosition: { id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f', name: 'Sudor' },
  hiredAt: '2020-03-01',
  status: 'active',
  terminatedAt: null,
  training: untrained,
  tests: noTests,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
});

const popescu = employee('7c9e6679-7425-40de-944b-e07fc1f90ae7', 'Popescu', 'Ion');
const taranu = employee('8d0f7780-8536-41ef-a55c-f18fd2fa1bf8', 'Țăranu', 'Ștefan');

const page = (items: unknown[]) => ({ items, page: 1, pageSize: 25, total: items.length });

const fetchMock = vi.fn<typeof fetch>();

function mockApi(list: (url: URL) => Response) {
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/me') {
      return Response.json({ user: { id: 'user-one', email: 'review@example.test' } });
    }
    if (url.pathname === `/clients/${clientId}`) return Response.json({ client: sampleClient });
    if (url.pathname === employeesPath) return list(url);
    if (url.pathname === `/clients/${clientId}/workplaces`) return Response.json({ items: [] });
    throw new Error(`Unexpected request: ${url}`);
  });
}

const listQueries = () =>
  fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname === employeesPath)
    .map((url) => url.searchParams);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe("searching a client's employees", () => {
  it('sends the search once typing pauses, in the URL, without a history entry', async () => {
    mockApi((url) =>
      Response.json(url.searchParams.get('q') === 'stef' ? page([taranu]) : page([popescu, taranu]))
    );
    const runtime = mountApp(authFixture(makeSession()).client, `${employeesPath}?page=2`);
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
    const runtime = mountApp(authFixture(makeSession()).client, `${employeesPath}?q=popescu`);
    const user = userEvent.setup();
    await screen.findAllByTestId('employees-row');
    expect((screen.getByTestId('employees-search') as HTMLInputElement).value).toBe('popescu');
    expect(listQueries()[0]!.get('q')).toBe('popescu');
    await user.click(screen.getByTestId('employees-filter-terminated'));
    expect(runtime.router.state.location.search).toEqual({ status: 'terminated', q: 'popescu' });
  });

  it('follows the URL back to an earlier search', async () => {
    mockApi(() => Response.json(page([popescu])));
    const runtime = mountApp(authFixture(makeSession()).client, `${employeesPath}?q=ion`);
    await screen.findAllByTestId('employees-row');
    act(() => {
      void runtime.router.navigate({ to: '/clients/$clientId/employees', params: { clientId } });
    });
    await waitFor(() =>
      expect((screen.getByTestId('employees-search') as HTMLInputElement).value).toBe('')
    );
  });

  it('says when no one matches and clears the search', async () => {
    mockApi((url) => Response.json(url.searchParams.get('q') ? page([]) : page([popescu])));
    const runtime = mountApp(authFixture(makeSession()).client, `${employeesPath}?q=zzz`);
    const user = userEvent.setup();
    expect(await screen.findByText('Niciun angajat nu corespunde căutării')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Adaugă primul angajat' })).toBeNull();
    await user.click(screen.getByTestId('employees-empty-clear-search'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
    await screen.findByTestId('employees-row');
    expect((screen.getByTestId('employees-search') as HTMLInputElement).value).toBe('');
  });

  it('clears the box with Escape', async () => {
    mockApi(() => Response.json(page([popescu])));
    const runtime = mountApp(authFixture(makeSession()).client, `${employeesPath}?q=ion`);
    const user = userEvent.setup();
    await screen.findAllByTestId('employees-row');
    await user.click(screen.getByTestId('employees-search'));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
  });
});
