import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '../test/auth-fixture';
import { disposeRuntimes, mountApp } from '../test/mount';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const sampleClient = {
  id: clientId,
  legalName: 'VELOCE CAFE SRL',
  cui: '1590082',
  vatPayer: false,
  caenCode: '5630',
  tradeRegisterNumber: null,
  countyCode: 'B',
  locality: 'București',
  addressLine: null,
  legalRepresentativeName: 'Maria Popescu',
  declaredEmployeeCount: 6,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null as string | null,
};

const emptyDetails = {
  legalRepresentativeName: null,
  legalRepresentativeRole: null,
  periodicTrainingMinutes: null,
  administrativeTrainingIntervalMonths: null,
  workerTrainingIntervalMonths: null,
  trainingFirstMonth: null,
  trainingDayFrom: null,
  trainingDayTo: null,
};

const office = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  clientId,
  name: 'Sediu social',
  isRegisteredOffice: true,
  countyCode: 'B',
  locality: 'București',
  addressLine: 'Calea Victoriei 122A',
  createdAt: '2026-09-18T10:00:00.000Z',
  updatedAt: '2026-09-18T10:00:00.000Z',
};

const shop = {
  ...office,
  id: '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d',
  name: 'Magazin Timișoara',
  isRegisteredOffice: false,
  countyCode: 'TM',
  locality: 'Timișoara',
  addressLine: 'Str. Goethe 2',
};

const listPath = `/clients/${clientId}/workplaces`;

type Route = (init: RequestInit | undefined) => Response;

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  client = sampleClient,
  items = [office, shop] as unknown[],
  create = ((init) =>
    Response.json(
      { workplace: { ...shop, ...JSON.parse(String(init?.body)) } },
      { status: 201 }
    )) as Route,
  update = ((init) =>
    Response.json({ workplace: { ...shop, ...JSON.parse(String(init?.body)) } })) as Route,
  archive = (() => new Response(null, { status: 204 })) as Route,
} = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({ user: { id: 'user-one', email: 'review@example.test' } });
    }
    if (pathname === `/clients/${clientId}`) return Response.json({ client });
    if (pathname === `/clients/${clientId}/responsible-persons`)
      return Response.json({ items: [] });
    if (pathname === `/clients/${clientId}/document-details`) {
      return Response.json({ documentDetails: emptyDetails });
    }
    if (pathname === listPath) return method === 'POST' ? create(init) : Response.json({ items });
    if (pathname === `${listPath}/${shop.id}`) {
      return method === 'DELETE' ? archive(init) : update(init);
    }
    throw new Error(`Unexpected request: ${method} ${pathname}`);
  });
}

const requests = (pathname: string, method: string) =>
  fetchMock.mock.calls
    .filter(
      ([input, init]) =>
        new URL(String(input)).pathname === pathname && (init?.method ?? 'GET') === method
    )
    .map(([, init]) => (init?.body ? (JSON.parse(String(init.body)) as unknown) : null));

const mount = () =>
  mountApp(authFixture(makeSession()).client, `/clients/${clientId}/document-data`);

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  const rows = await screen.findAllByTestId('workplace-row');
  const row = rows.find((item) => item.textContent?.includes(name))!;
  await user.click(within(row).getByTestId('workplace-actions'));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('client workplaces', () => {
  it('lists the workplaces with their address and marks the registered office', async () => {
    mockApi();
    mount();

    const rows = await screen.findAllByTestId('workplace-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('Sediu social');
    expect(rows[0]!.textContent).toContain('Calea Victoriei 122A, București, București');
    expect(rows[1]!.textContent).toContain('Str. Goethe 2, Timișoara, Timiș');
    expect(within(rows[1]!).queryByText('Sediu social')).toBeNull();
  });

  it('says where to start when there are none', async () => {
    mockApi({ items: [] });
    mount();

    expect((await screen.findByTestId('workplaces-empty')).textContent).toContain('sediul social');
  });

  it('adds a workplace, confirms with a toast, and refreshes the list', async () => {
    mockApi({ items: [] });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('workplace-add'));
    const dialog = await screen.findByTestId('workplace-dialog');
    await user.type(within(dialog).getByTestId('workplace-name'), ' Sediu social ');
    await user.click(within(dialog).getByTestId('workplace-registered-office'));
    expect(within(dialog).getByTestId<HTMLButtonElement>('workplace-locality').disabled).toBe(true);
    await user.click(within(dialog).getByTestId('workplace-county'));
    await user.type(screen.getByTestId('workplace-county-search'), 'alba');
    await user.click(await screen.findByRole('option', { name: /Alba/ }));
    await user.click(within(dialog).getByTestId('workplace-locality'));
    await user.type(screen.getByTestId('workplace-locality-search'), 'barab');
    await user.click(await screen.findByRole('option', { name: /Bărăbanț/ }));
    await user.click(within(dialog).getByTestId('workplace-save'));

    await waitFor(() =>
      expect(requests(listPath, 'POST')).toEqual([
        {
          name: 'Sediu social',
          isRegisteredOffice: true,
          countyCode: 'AB',
          locality: 'Bărăbanț',
          addressLine: null,
        },
      ])
    );
    expect(await screen.findByText('Punctul de lucru a fost adăugat.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('workplace-dialog')).toBeNull());
    expect(requests(listPath, 'GET').length).toBeGreaterThan(1);
  });

  it('keeps a locality the register does not list, and drops it when the county changes', async () => {
    mockApi({ items: [] });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('workplace-add'));
    const dialog = await screen.findByTestId('workplace-dialog');
    await user.click(within(dialog).getByTestId('workplace-county'));
    await user.type(screen.getByTestId('workplace-county-search'), 'bucu');
    await user.click(await screen.findByRole('option', { name: /București/ }));
    await user.click(within(dialog).getByTestId('workplace-locality'));
    await user.type(screen.getByTestId('workplace-locality-search'), 'București');
    await user.click(await screen.findByRole('option', { name: /Folosește „București”/ }));
    expect(within(dialog).getByTestId('workplace-locality').textContent).toContain('București');

    await user.click(within(dialog).getByTestId('workplace-county'));
    await user.type(screen.getByTestId('workplace-county-search'), 'cluj');
    await user.click(await screen.findByRole('option', { name: /Cluj/ }));
    await waitFor(() =>
      expect(within(dialog).getByTestId('workplace-locality').textContent).toContain(
        'Alege localitatea'
      )
    );
  });

  it('needs a name before calling the API', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('workplace-add'));
    await user.click(await screen.findByTestId('workplace-save'));

    expect((await screen.findByTestId('workplace-name-error')).textContent).toContain(
      'Introdu denumirea'
    );
    expect(requests(listPath, 'POST')).toEqual([]);
  });

  it('reports a second registered office on the checkbox and keeps the dialog open', async () => {
    mockApi({
      create: () => Response.json({ error: 'conflict', message: 'Conflict' }, { status: 409 }),
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('workplace-add'));
    await user.type(await screen.findByTestId('workplace-name'), 'Alt sediu');
    await user.click(screen.getByTestId('workplace-registered-office'));
    await user.click(screen.getByTestId('workplace-save'));

    expect((await screen.findByTestId('workplace-registered-office-error')).textContent).toContain(
      'are deja un sediu social'
    );
    expect(screen.getByTestId('workplace-dialog')).toBeTruthy();
  });

  it('edits a workplace starting from what is saved', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await openRowMenu(user, 'Magazin Timișoara');
    await user.click(await screen.findByTestId('workplace-edit'));
    const name = await screen.findByTestId<HTMLInputElement>('workplace-name');
    expect(name.value).toBe('Magazin Timișoara');
    await user.clear(name);
    await user.type(name, 'Gelaterie Timișoara');
    await user.click(screen.getByTestId('workplace-save'));

    await waitFor(() =>
      expect(requests(`${listPath}/${shop.id}`, 'PUT')).toEqual([
        {
          name: 'Gelaterie Timișoara',
          isRegisteredOffice: false,
          countyCode: 'TM',
          locality: 'Timișoara',
          addressLine: 'Str. Goethe 2',
        },
      ])
    );
    expect(await screen.findByText('Punctul de lucru a fost salvat.')).toBeTruthy();
  });

  it('opens the edit dialog from anywhere on the row, but not from the row menu', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await openRowMenu(user, 'Magazin Timișoara');
    await user.click(await screen.findByTestId('workplace-archive'));
    await screen.findByTestId('workplace-archive-dialog');
    expect(screen.queryByTestId('workplace-dialog')).toBeNull();
    await user.keyboard('{Escape}');

    await user.click(await screen.findByText('Str. Goethe 2', { exact: false }));
    const name = await screen.findByTestId<HTMLInputElement>('workplace-name');
    expect(name.value).toBe('Magazin Timișoara');
  });

  it('archives only after confirmation', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await openRowMenu(user, 'Magazin Timișoara');
    await user.click(await screen.findByTestId('workplace-archive'));
    const dialog = await screen.findByTestId('workplace-archive-dialog');
    expect(dialog.textContent).toContain('Magazin Timișoara');
    expect(requests(`${listPath}/${shop.id}`, 'DELETE')).toEqual([]);

    await user.click(within(dialog).getByTestId('workplace-archive-confirm'));
    await waitFor(() => expect(requests(`${listPath}/${shop.id}`, 'DELETE')).toHaveLength(1));
    expect(await screen.findByText('Magazin Timișoara a fost arhivat.')).toBeTruthy();
  });

  it('reports a workplace that is already gone and refreshes the list', async () => {
    mockApi({
      archive: () => Response.json({ error: 'not_found', message: 'x' }, { status: 404 }),
    });
    mount();
    const user = userEvent.setup();

    await openRowMenu(user, 'Magazin Timișoara');
    await user.click(await screen.findByTestId('workplace-archive'));
    await user.click(await screen.findByTestId('workplace-archive-confirm'));

    expect((await screen.findByTestId('workplaces-error')).textContent).toContain(
      'nu mai există la acest client'
    );
    expect(requests(listPath, 'GET').length).toBeGreaterThan(1);
  });

  it('shows an archived client the list without add or row actions', async () => {
    mockApi({ client: { ...sampleClient, archivedAt: '2026-09-18T10:00:00+00:00' } });
    mount();

    expect(await screen.findAllByTestId('workplace-row')).toHaveLength(2);
    expect(screen.queryByTestId('workplace-add')).toBeNull();
    expect(screen.queryByTestId('workplace-actions')).toBeNull();
  });
});
