import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClientDocumentDetailsResponse } from '@/api/generated/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

type Details = ClientDocumentDetailsResponse['documentDetails'];
type DetailsInput = Omit<Details, 'legalRepresentativeEmployee'>;

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
  legalRepresentativeEmployeeId: null,
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
  legalRepresentativeEmployeeId: null,
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

const director = {
  ...welder,
  id: '6e1f2b0a-3b7c-4d4e-9f80-2b3c4d5e6f70',
  name: 'Director',
  staffCategory: 'technical_administrative',
  trainingIntervalMonths: null as number | null,
};

function mockApi({
  client = sampleClient,
  details = emptyDetails as DetailsInput,
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
      const read = () =>
        Response.json({
          documentDetails: { legalRepresentativeEmployee: null, ...(current as object) },
        });
      if (method !== 'PUT') return read();
      if (save) return save(init);
      current = JSON.parse(String(init?.body));
      return read();
    }
    throw new Error(`Unexpected request: ${method} ${pathname}`);
  });
}

const saves = () =>
  fetchMock.mock.calls
    .filter(([input, init]) => String(input).endsWith(detailsPath) && init?.method === 'PUT')
    .map(([, init]) => JSON.parse(String(init?.body)) as unknown);

const mount = () => mountApp(authFixture(makeSession()).client, `/clienti/${clientId}/instruire`);

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

    expect(await screen.findByTestId('training-page')).toBeTruthy();
    const sections = screen.getAllByTestId('client-section').map((link) => link.textContent);
    expect(sections).toEqual([
      'Detalii',
      'Lucrători',
      'Posturi de lucru',
      'Mijloace de apărare',
      'Instruire și responsabili',
      'Instruiri ținute',
      'Documente SSM',
      'Documente SU',
      'Alte documente',
      'Portal',
    ]);
    expect(await screen.findByTestId('training-program-form')).toBeTruthy();
    expect(screen.queryByTestId('legal-representative-card')).toBeNull();
    expect(screen.queryByTestId('workplaces-card')).toBeNull();
  });

  it('shows a block for each category the client has posts in, at the legal maximum', async () => {
    mockApi({ positions: [welder, director] });
    mount();
    const user = userEvent.setup();

    const execution = await screen.findByTestId('details-category-execution');
    expect(screen.getByTestId<HTMLInputElement>('details-worker-interval-6').checked).toBe(true);
    expect(screen.getByTestId<HTMLInputElement>('details-administrative-interval-12').checked).toBe(
      true
    );
    expect(execution.textContent).toContain('1 post, 1 lucrător: Sudor');
    expect(screen.queryByTestId('details-absent-execution')).toBeNull();

    await user.selectOptions(screen.getByTestId('details-first-month'), '2');
    await user.click(screen.getByTestId('details-worker-interval-3'));
    expect(screen.getByTestId('details-category-execution-interval').textContent).toBe('La 3 luni');
    expect(screen.getByTestId('details-category-execution-months').textContent).toBe(
      'Februarie, mai, august, noiembrie'
    );
  });

  it('offers execution personnel no interval above six months', async () => {
    mockApi({ positions: [welder, director] });
    mount();

    await screen.findByTestId('details-category-execution');
    expect(screen.queryByTestId('details-worker-interval-12')).toBeNull();
    expect(screen.getByTestId('details-administrative-interval-12')).toBeTruthy();
  });

  it('offers execution personnel every month from one to six', async () => {
    mockApi({ positions: [welder] });
    mount();

    await screen.findByTestId('details-category-execution');
    for (const months of [1, 2, 3, 4, 5, 6]) {
      expect(screen.getByTestId(`details-worker-interval-${months}`)).toBeTruthy();
    }
  });

  it('loads a saved interval outside the list, and asks for one from the list before saving', async () => {
    mockApi({
      details: { ...savedDetails, administrativeTrainingIntervalMonths: 9 },
      positions: [welder, director],
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('training-program-edit'));
    const administrative = screen.getByTestId('details-category-technical_administrative');
    expect(administrative.textContent).toContain(
      'Intervalul salvat, la 9 luni, nu mai e în listă. Alege unul din listă.'
    );
    await user.click(screen.getByTestId('training-program-save'));
    expect(saves()).toEqual([]);

    await user.click(screen.getByTestId('details-administrative-interval-6'));
    await user.click(screen.getByTestId('training-program-save'));
    await waitFor(() =>
      expect(saves()).toEqual([{ ...savedDetails, administrativeTrainingIntervalMonths: 6 }])
    );
  });

  it('picks no duration or interval when the member clicks their label', async () => {
    mockApi({ positions: [welder] });
    mount();
    const user = userEvent.setup();

    await screen.findByTestId('details-category-execution');
    await user.click(screen.getByText('Durata unei instruiri, în minute'));
    await user.click(screen.getByText('La câte luni'));
    expect(screen.getByTestId<HTMLInputElement>('details-training-duration-60').checked).toBe(
      false
    );
    expect(screen.getByTestId<HTMLInputElement>('details-worker-interval-1').checked).toBe(false);
    expect(screen.getByTestId<HTMLInputElement>('details-worker-interval-6').checked).toBe(true);
  });

  it('saves the representative and the program apart, each over what the other saved', async () => {
    mockApi({ positions: [welder, director] });
    mountApp(authFixture(makeSession()).client, `/clienti/${clientId}/detalii`);
    const user = userEvent.setup();

    // A client created without a representative gets one on its details.
    await user.click(await screen.findByTestId('legal-representative-edit'));
    await user.type(screen.getByTestId('details-representative-name'), ' Maria Popescu ');
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

    await user.click(screen.getByRole('link', { name: 'Instruire și responsabili' }));
    await user.click(await screen.findByTestId('details-training-duration-120'));
    await user.selectOptions(screen.getByTestId('details-first-month'), '2');
    await user.click(screen.getByTestId('details-administrative-interval-6'));
    await user.click(screen.getByTestId('details-worker-interval-3'));
    await user.type(screen.getByTestId('details-day-from'), '2');
    await user.type(screen.getByTestId('details-day-to'), '7');
    await user.click(screen.getByTestId('training-program-save'));

    // Numbers, not text, and the representative saved a moment ago is sent back unchanged.
    await waitFor(() => expect(saves()[1]).toEqual(savedDetails));
    expect(await screen.findByText('Programul de instruire a fost salvat.')).toBeTruthy();
  });

  it('shows a complete program as blocks, with the posts that differ from their category', async () => {
    mockApi({
      details: savedDetails,
      positions: [welder, { ...director, name: 'Contabil' }],
    });
    mount();

    const execution = await screen.findByTestId('training-program-execution');
    expect(execution.textContent).toContain('La 3 luni');
    expect(execution.textContent).toContain('Februarie, mai, august, noiembrie');
    expect(screen.getByTestId('training-program-administrative').textContent).toContain(
      'La 6 luni'
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

  it('leaves out a category without posts and keeps what was saved for it', async () => {
    mockApi({ details: savedDetails, positions: [welder] });
    mount();
    const user = userEvent.setup();

    expect(await screen.findByTestId('training-program-execution')).toBeTruthy();
    expect(screen.queryByTestId('training-program-administrative')).toBeNull();

    await user.click(screen.getByTestId('training-program-edit'));
    expect(screen.getByTestId('details-absent-technical_administrative').textContent).toContain(
      'Personalul tehnico-administrativ nu apare'
    );
    await user.clear(screen.getByTestId('details-day-to'));
    await user.type(screen.getByTestId('details-day-to'), '9');
    await user.click(screen.getByTestId('training-program-save'));
    await waitFor(() => expect(saves()).toEqual([{ ...savedDetails, trainingDayTo: 9 }]));
  });

  it('asks for the interval of a category marked as not applicable that has posts', async () => {
    mockApi({
      details: {
        ...savedDetails,
        workerTrainingIntervalMonths: null,
        workerTrainingNotApplicable: true,
      },
      positions: [welder, director],
    });
    mount();
    const user = userEvent.setup();

    expect(await screen.findByTestId('training-program-form')).toBeTruthy();
    expect(screen.getByTestId('training-program-was-not-applicable-execution')).toBeTruthy();
    expect(screen.getByTestId<HTMLInputElement>('details-worker-interval-6').checked).toBe(true);
    await user.click(screen.getByTestId('training-program-save'));

    await waitFor(() =>
      expect(saves()[0]).toMatchObject({
        workerTrainingIntervalMonths: 6,
        workerTrainingNotApplicable: false,
      })
    );
    expect(await screen.findByTestId('training-program-execution')).toBeTruthy();
  });

  it('takes the calendar of a client with no posts and points to the posts', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    expect(await screen.findByTestId('training-no-positions')).toBeTruthy();
    expect(screen.queryByTestId('details-absent-execution')).toBeNull();
    await user.selectOptions(screen.getByTestId('details-first-month'), '3');
    await user.type(screen.getByTestId('details-day-from'), '5');
    await user.type(screen.getByTestId('details-day-to'), '5');
    await user.click(screen.getByTestId('details-training-duration-60'));
    await user.click(screen.getByTestId('training-program-save'));

    await waitFor(() =>
      expect(saves()[0]).toEqual({
        ...emptyDetails,
        periodicTrainingMinutes: 60,
        trainingFirstMonth: 3,
        trainingDayFrom: 5,
        trainingDayTo: 5,
      })
    );
    expect(await screen.findByTestId('training-program-session')).toBeTruthy();
    expect(screen.getByTestId('training-no-positions')).toBeTruthy();
  });

  it('edits a saved program from the blocks, and clears a field that is emptied', async () => {
    mockApi({ details: savedDetails, positions: [welder, director] });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('training-program-edit'));
    await user.selectOptions(screen.getByTestId('details-first-month'), '');
    await user.click(screen.getByTestId('training-program-save'));

    await waitFor(() => expect(saves()).toEqual([{ ...savedDetails, trainingFirstMonth: null }]));
    // An incomplete program has no summary to show, so the form stays.
    expect(await screen.findByTestId('training-program-form')).toBeTruthy();
  });

  it('says which days to write when they are out of order or not a day, without calling the API', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.type(await screen.findByTestId('details-day-from'), '12');
    await user.type(screen.getByTestId('details-day-to'), '7');
    await user.click(screen.getByTestId('training-program-save'));
    expect((await screen.findByTestId('details-day-to-error')).textContent).toBe(
      'Ultima zi vine după prima. Scrie o zi între 12 și 31.'
    );
    const described = [
      screen.getByRole('group', { name: 'Zilele lunii' }),
      screen.getByTestId('details-day-from'),
    ].map((element) => element.getAttribute('aria-describedby'));
    expect(described).toEqual([null, null]);

    await user.clear(screen.getByTestId('details-day-from'));
    await user.type(screen.getByTestId('details-day-from'), '40');
    await user.click(screen.getByTestId('training-program-save'));
    expect((await screen.findByTestId('details-day-from-error')).textContent).toBe(
      'Scrie o zi între 1 și 31.'
    );
    expect(saves()).toEqual([]);
  });

  it('reports a failed save inline and keeps what was typed', async () => {
    mockApi({
      details: savedDetails,
      positions: [welder, director],
      save: () => new Response(null, { status: 500 }),
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('training-program-edit'));
    const dayTo = screen.getByTestId<HTMLInputElement>('details-day-to');
    await user.clear(dayTo);
    await user.type(dayTo, '9');
    await user.click(screen.getByTestId('training-program-save'));

    expect((await screen.findByTestId('training-program-error')).textContent).toContain(
      'Nu am putut salva'
    );
    expect(dayTo.value).toBe('9');
  });

  it('shows an archived client read-only', async () => {
    mockApi({
      client: { ...sampleClient, archivedAt: '2026-09-18T10:00:00+00:00' },
      details: savedDetails,
      positions: [welder],
    });
    mount();

    expect(await screen.findByTestId('training-program-execution')).toBeTruthy();
    expect(screen.queryByTestId('training-program-edit')).toBeNull();
    expect(screen.getByTestId('client-archived-banner')).toBeTruthy();
  });

  it.each([
    [
      'a schedule missing an interval',
      { administrativeTrainingIntervalMonths: null },
      'details-administrative-interval',
    ],
    ['a complete schedule', {}, 'details-worker-interval'],
  ])('opens %s at the first choice to make when a row asks for it', async (_, change, field) => {
    mockApi({
      details: { ...savedDetails, ...change } as DetailsInput,
      positions: [welder, director],
    });
    const runtime = mountApp(
      authFixture(makeSession()).client,
      `/clienti/${clientId}/instruire?focus=training-schedule`
    );
    expect(await screen.findByTestId('training-program-form')).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.id).toBe(field));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
  });

  it("opens the legal representative's card at the field a row asks for", async () => {
    mockApi({ details: savedDetails as DetailsInput });
    const runtime = mountApp(
      authFixture(makeSession()).client,
      `/clienti/${clientId}/detalii?focus=legal-representative-name`
    );
    const name = await screen.findByTestId('details-representative-name');
    await waitFor(() => expect(document.activeElement).toBe(name));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
    expect(runtime.router.history.length).toBe(1);
  });
});
