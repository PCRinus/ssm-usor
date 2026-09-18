import { screen, waitFor } from '@testing-library/react';
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
  tradeRegisterNumber: 'J40/1234/2019',
  countyCode: 'B',
  locality: 'București',
  addressLine: 'Calea Victoriei 122A',
  legalRepresentativeName: 'Maria Popescu',
  declaredEmployeeCount: 6,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null as string | null,
};

const emptyDetails = {
  legalRepresentativeRole: null,
  periodicTrainingHours: null,
  administrativeTrainingIntervalMonths: null,
  workerTrainingIntervalMonths: null,
  trainingFirstMonth: null,
  trainingDayFrom: null,
  trainingDayTo: null,
};

const savedDetails = {
  legalRepresentativeRole: 'Administrator',
  periodicTrainingHours: 2,
  administrativeTrainingIntervalMonths: 6,
  workerTrainingIntervalMonths: 3,
  trainingFirstMonth: 2,
  trainingDayFrom: 2,
  trainingDayTo: 7,
};

const detailsPath = `/clients/${clientId}/document-details`;

type Route = (init: RequestInit | undefined) => Response;

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  client = sampleClient,
  details = emptyDetails as typeof emptyDetails | typeof savedDetails,
  save = ((init) => Response.json({ documentDetails: JSON.parse(String(init?.body)) })) as Route,
} = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({ user: { id: 'user-one', email: 'review@example.test' } });
    }
    if (pathname === `/clients/${clientId}`) return Response.json({ client });
    if (pathname === detailsPath) {
      return method === 'PUT' ? save(init) : Response.json({ documentDetails: details });
    }
    throw new Error(`Unexpected request: ${method} ${pathname}`);
  });
}

const saves = () =>
  fetchMock.mock.calls
    .filter(([input, init]) => String(input).endsWith(detailsPath) && init?.method === 'PUT')
    .map(([, init]) => JSON.parse(String(init?.body)) as unknown);

const mount = () =>
  mountApp(authFixture(makeSession()).client, `/clients/${clientId}/document-data`);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('client document data', () => {
  it('is a section of the client, next to the employees', async () => {
    mockApi();
    mount();

    expect(await screen.findByTestId('document-data-page')).toBeTruthy();
    const sections = screen.getAllByTestId('client-section').map((link) => link.textContent);
    expect(sections).toEqual(['Angajați', 'Date pentru documente']);
    const name = await screen.findByTestId<HTMLInputElement>('details-representative-name');
    expect(name.value).toBe('Maria Popescu');
  });

  it('previews the training months as the first month and the intervals are chosen', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByTestId('details-first-month'), '2');
    await user.selectOptions(screen.getByTestId('details-administrative-interval'), '6');
    await user.selectOptions(screen.getByTestId('details-worker-interval'), '3');

    expect(screen.getByText('Instruiri în: Februarie, August.')).toBeTruthy();
    expect(screen.getByText('Instruiri în: Februarie, Mai, August, Noiembrie.')).toBeTruthy();
  });

  it('offers workers no interval above six months', async () => {
    mockApi();
    mount();

    const workers = await screen.findByTestId<HTMLSelectElement>('details-worker-interval');
    const values = [...workers.options].map((option) => option.value);
    expect(values).toEqual(['', '1', '2', '3', '4', '6']);
  });

  it('saves numbers, not text, and confirms with a toast', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('details-representative-role'), ' Administrator ');
    await user.selectOptions(screen.getByTestId('details-training-hours'), '2');
    await user.selectOptions(screen.getByTestId('details-first-month'), '2');
    await user.selectOptions(screen.getByTestId('details-administrative-interval'), '6');
    await user.selectOptions(screen.getByTestId('details-worker-interval'), '3');
    await user.type(screen.getByTestId('details-day-from'), '2');
    await user.type(screen.getByTestId('details-day-to'), '7');
    await user.click(screen.getByTestId('document-details-save'));

    await waitFor(() => expect(saves()).toEqual([savedDetails]));
    expect(await screen.findByText('Datele pentru documente au fost salvate.')).toBeTruthy();
  });

  it('shows what is saved, and clears a field that is emptied', async () => {
    mockApi({ details: savedDetails });
    mount();
    const user = userEvent.setup();

    const role = await screen.findByTestId<HTMLInputElement>('details-representative-role');
    expect(role.value).toBe('Administrator');
    expect(screen.getByTestId<HTMLButtonElement>('document-details-save').disabled).toBe(true);

    await user.clear(role);
    await user.selectOptions(screen.getByTestId('details-training-hours'), '');
    await user.click(screen.getByTestId('document-details-save'));

    await waitFor(() =>
      expect(saves()).toEqual([
        { ...savedDetails, legalRepresentativeRole: null, periodicTrainingHours: null },
      ])
    );
  });

  it('refuses days out of order and a day that is not a number, without calling the API', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('details-day-from'), '12');
    await user.type(screen.getByTestId('details-day-to'), '7');
    await user.click(screen.getByTestId('document-details-save'));
    expect((await screen.findByTestId('details-day-to-error')).textContent).toContain(
      'Ultima zi nu poate fi înaintea primei zile.'
    );

    await user.clear(screen.getByTestId('details-day-from'));
    await user.type(screen.getByTestId('details-day-from'), '40');
    await user.click(screen.getByTestId('document-details-save'));
    expect((await screen.findByTestId('details-day-from-error')).textContent).toContain(
      'între 1 și 31'
    );
    expect(saves()).toEqual([]);
  });

  it('reports a failed save inline and keeps what was typed', async () => {
    mockApi({ save: () => new Response(null, { status: 500 }) });
    mount();
    const user = userEvent.setup();

    const role = await screen.findByTestId<HTMLInputElement>('details-representative-role');
    await user.type(role, 'Administrator');
    await user.click(screen.getByTestId('document-details-save'));

    expect((await screen.findByTestId('document-details-error')).textContent).toContain(
      'Nu am putut salva'
    );
    expect(role.value).toBe('Administrator');
  });

  it('shows an archived client read-only', async () => {
    mockApi({
      client: { ...sampleClient, archivedAt: '2026-09-18T10:00:00+00:00' },
      details: savedDetails,
    });
    mount();

    const role = await screen.findByTestId<HTMLInputElement>('details-representative-role');
    expect(role.disabled).toBe(true);
    expect(screen.queryByTestId('document-details-save')).toBeNull();
    expect(screen.getByText(/Clientul este arhivat/)).toBeTruthy();
  });
});
