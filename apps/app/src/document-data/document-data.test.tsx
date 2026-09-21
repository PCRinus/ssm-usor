import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClientDocumentDetailsResponse } from '../api/generated/api';
import { authFixture, makeSession } from '../test/auth-fixture';
import { disposeRuntimes, mountApp } from '../test/mount';

type Details = ClientDocumentDetailsResponse['documentDetails'];

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
  legalRepresentativeName: null as string | null,
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

const savedDetails = {
  legalRepresentativeName: 'Maria Popescu',
  legalRepresentativeRole: 'Administrator',
  periodicTrainingMinutes: 120,
  administrativeTrainingIntervalMonths: 6,
  administrativeTrainingNotApplicable: false,
  workerTrainingIntervalMonths: 3,
  workerTrainingNotApplicable: false,
  trainingFirstMonth: 2,
  trainingDayFrom: 2,
  trainingDayTo: 7,
};

const detailsPath = `/clients/${clientId}/document-details`;

type Route = (init: RequestInit | undefined) => Response;

const fetchMock = vi.fn<typeof fetch>();

const welder = {
  id: '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f',
  clientId,
  name: 'Sudor',
  staffCategory: 'execution',
  workZone: null,
  activities: null,
  trainingIntervalMonths: 2 as number | null,
  employeeCount: 1,
  createdAt: '2026-09-20T10:00:00+00:00',
  updatedAt: '2026-09-20T10:00:00+00:00',
};

function mockApi({
  client = sampleClient,
  details = emptyDetails as Details,
  positions = [] as (typeof welder)[],
  save = undefined as Route | undefined,
} = {}) {
  let current: unknown = details;
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({ user: { id: 'user-one', email: 'review@example.test' } });
    }
    if (pathname === `/clients/${clientId}`) return Response.json({ client });
    if (pathname === `/clients/${clientId}/responsible-persons`)
      return Response.json({ items: [] });
    if (pathname === `/clients/${clientId}/workplaces`) return Response.json({ items: [] });
    if (pathname === `/clients/${clientId}/job-positions`) {
      return Response.json({ items: positions });
    }
    if (pathname === detailsPath) {
      if (method !== 'PUT') return Response.json({ documentDetails: current });
      if (save) return save(init);
      current = JSON.parse(String(init?.body));
      return Response.json({ documentDetails: current });
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

async function chooseOption(
  user: ReturnType<typeof userEvent.setup>,
  testId: string,
  option: string
) {
  await user.click(screen.getByTestId(testId));
  await user.click(await screen.findByRole('option', { name: option }));
}

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
    expect(sections).toEqual([
      'Angajați',
      'Posturi de lucru',
      'Date pentru documente',
      'Documente',
      'Contact',
    ]);
    expect(await screen.findByTestId('details-representative-name')).toBeTruthy();
  });

  it('previews the training months as the first month and the intervals are chosen', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await screen.findByTestId('details-first-month');
    await chooseOption(user, 'details-first-month', 'Februarie');
    await chooseOption(user, 'details-administrative-interval', 'Semestrial (la 6 luni)');
    await chooseOption(user, 'details-worker-interval', 'Trimestrial (la 3 luni)');

    expect(screen.getByText('Lunile: Februarie, August')).toBeTruthy();
    expect(screen.getByText('Lunile: Februarie, Mai, August, Noiembrie')).toBeTruthy();
  });

  it('offers workers no interval above six months', async () => {
    mockApi();
    mount();

    const user = userEvent.setup();
    const trigger = await screen.findByTestId('details-worker-interval');
    expect(trigger.textContent).toContain('Alege intervalul');
    await user.click(trigger);
    expect(screen.queryByRole('option', { name: 'Alege intervalul' })).toBeNull();
    expect(screen.getByRole('option', { name: 'Nu se aplică' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Anual (la 12 luni)' })).toBeNull();
    await user.click(screen.getByRole('option', { name: 'Trimestrial (la 3 luni)' }));
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: 'Șterge alegerea' }));
    expect(trigger.textContent).toContain('Alege intervalul');
  });

  it('saves the representative and the program apart, each over what the other saved', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    // A client created without a representative gets one here.
    const name = await screen.findByTestId<HTMLInputElement>('details-representative-name');
    expect(name.value).toBe('');
    await user.type(name, ' Maria Popescu ');
    await user.type(screen.getByTestId('details-representative-role'), ' Administrator ');
    await user.click(screen.getByTestId('legal-representative-save'));
    await waitFor(() =>
      expect(saves()).toEqual([
        {
          ...emptyDetails,
          legalRepresentativeName: 'Maria Popescu',
          legalRepresentativeRole: 'Administrator',
        },
      ])
    );
    expect(await screen.findByText('Reprezentantul legal a fost salvat.')).toBeTruthy();

    await chooseOption(user, 'details-training-duration', '2 ore');
    await chooseOption(user, 'details-first-month', 'Februarie');
    await chooseOption(user, 'details-administrative-interval', 'Semestrial (la 6 luni)');
    await chooseOption(user, 'details-worker-interval', 'Trimestrial (la 3 luni)');
    await user.type(screen.getByTestId('details-day-from'), '2');
    await user.type(screen.getByTestId('details-day-to'), '7');
    await user.click(screen.getByTestId('training-program-save'));

    // Numbers, not text, and the representative saved a moment ago is sent back unchanged.
    await waitFor(() => expect(saves()[1]).toEqual(savedDetails));
    expect(await screen.findByText('Programul de instruire a fost salvat.')).toBeTruthy();
  });

  it('shows a complete program as a summary, with the posts that differ from their category', async () => {
    mockApi({
      details: savedDetails,
      positions: [welder, { ...welder, id: 'x', name: 'Contabil', trainingIntervalMonths: null }],
    });
    mount();

    const execution = await screen.findByTestId('training-program-execution');
    expect(execution.textContent).toContain('la 3 luni');
    expect(execution.textContent).toContain('Februarie, Mai, August, Noiembrie');
    expect(screen.getByTestId('training-program-administrative').textContent).toContain(
      'la 6 luni'
    );
    expect(screen.getByTestId('training-program-session').textContent).toContain(
      'durează 2 ore și are loc între zilele 2 și 7 ale lunii'
    );
    const exceptions = await screen.findByTestId('training-program-exceptions');
    expect(exceptions.textContent).toContain('Sudor');
    expect(exceptions.textContent).toContain('la 2 luni');
    expect(exceptions.textContent).not.toContain('Contabil');
    expect(screen.queryByTestId('training-program-form')).toBeNull();
  });

  it('keeps a blank category undecided until the specialist excludes it', async () => {
    mockApi({
      details: {
        ...savedDetails,
        workerTrainingIntervalMonths: null,
      },
    });
    mount();
    const user = userEvent.setup();

    expect(await screen.findByTestId('training-program-form')).toBeTruthy();
    await chooseOption(user, 'details-worker-interval', 'Nu se aplică');
    await user.click(screen.getByTestId('training-program-save'));

    await waitFor(() =>
      expect(saves()[0]).toMatchObject({
        administrativeTrainingIntervalMonths: 6,
        administrativeTrainingNotApplicable: false,
        workerTrainingIntervalMonths: null,
        workerTrainingNotApplicable: true,
      })
    );
    expect(await screen.findByTestId('training-program-administrative')).toBeTruthy();
    expect(screen.queryByTestId('training-program-execution')).toBeNull();
  });

  it('warns when an employee holds an excluded category', async () => {
    mockApi({
      details: {
        ...savedDetails,
        workerTrainingIntervalMonths: null,
        workerTrainingNotApplicable: true,
      },
      positions: [welder],
    });
    mount();

    expect(await screen.findByTestId('training-program-category-warning')).toBeTruthy();
    expect(screen.getByTestId('training-program-administrative')).toBeTruthy();
  });

  it('edits a saved program from the summary, and clears a field that is emptied', async () => {
    mockApi({ details: savedDetails });
    mount();
    const user = userEvent.setup();

    const role = await screen.findByTestId<HTMLInputElement>('details-representative-role');
    expect(role.value).toBe('Administrator');
    expect(screen.getByTestId<HTMLButtonElement>('legal-representative-save').disabled).toBe(true);

    await user.click(await screen.findByTestId('training-program-edit'));
    await chooseOption(user, 'details-training-duration', 'Șterge alegerea');
    await user.click(screen.getByTestId('training-program-save'));

    await waitFor(() =>
      expect(saves()).toEqual([{ ...savedDetails, periodicTrainingMinutes: null }])
    );
    // An incomplete program has no summary to show, so the form stays.
    expect(await screen.findByTestId('training-program-form')).toBeTruthy();
  });

  it('refuses days out of order and a day that is not a number, without calling the API', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('details-day-from'), '12');
    await user.type(screen.getByTestId('details-day-to'), '7');
    await user.click(screen.getByTestId('training-program-save'));
    expect((await screen.findByTestId('details-day-to-error')).textContent).toContain(
      'Ultima zi nu poate fi înaintea primei zile.'
    );

    await user.clear(screen.getByTestId('details-day-from'));
    await user.type(screen.getByTestId('details-day-from'), '40');
    await user.click(screen.getByTestId('training-program-save'));
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
    await user.click(screen.getByTestId('legal-representative-save'));

    expect((await screen.findByTestId('legal-representative-error')).textContent).toContain(
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
    expect(screen.queryByTestId('legal-representative-save')).toBeNull();
    expect(await screen.findByTestId('training-program-execution')).toBeTruthy();
    expect(screen.queryByTestId('training-program-edit')).toBeNull();
    expect(screen.getByTestId('client-archived-banner')).toBeTruthy();
  });
});
