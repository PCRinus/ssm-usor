import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

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

const occupationalDetails = {
  legalRepresentativeName: 'Maria Popescu',
  legalRepresentativeRole: 'Administrator',
  periodicTrainingMinutes: 120,
  administrativeTrainingIntervalMonths: 12,
  administrativeTrainingNotApplicable: false,
  workerTrainingIntervalMonths: 6,
  workerTrainingNotApplicable: false,
  trainingFirstMonth: 2 as number | null,
  trainingDayFrom: 2 as number | null,
  trainingDayTo: 7 as number | null,
};

const emptyFireSafety = {
  periodicTrainingHours: null as number | null,
  administrativeTrainingIntervalMonths: null as number | null,
  workerTrainingIntervalMonths: null as number | null,
  trainingFirstMonth: null as number | null,
  trainingDayFrom: null as number | null,
  trainingDayTo: null as number | null,
  smokingPolicy: null as string | null,
  smokingPlace: null as string | null,
  wasteKinds: [] as string[],
  wasteContractor: null as string | null,
  wasteCollectors: null as string | null,
  hasThirdParties: false,
};

const savedFireSafety = {
  periodicTrainingHours: 2,
  administrativeTrainingIntervalMonths: 6,
  workerTrainingIntervalMonths: 3,
  trainingFirstMonth: 1,
  trainingDayFrom: 10,
  trainingDayTo: 15,
  smokingPolicy: 'designated_places',
  smokingPlace: 'în curtea interioară, lângă poarta de acces auto',
  wasteKinds: ['deșeuri de carton', 'uleiuri uzate'],
  wasteContractor: 'Salubris SA',
  wasteCollectors: null as string | null,
  hasThirdParties: false,
};

const firePath = `/clients/${clientId}/fire-safety`;

const fetchMock = vi.fn<typeof fetch>();

const position = (name: string, staffCategory: string) => ({
  id: `00000000-0000-4000-8000-${name.length.toString().padStart(12, '0')}`,
  clientId,
  name,
  staffCategory,
  workZone: null,
  activities: null,
  trainingIntervalMonths: null,
  employeeCount: 2,
  createdAt: '2026-09-20T10:00:00+00:00',
  updatedAt: '2026-09-20T10:00:00+00:00',
});
const cook = position('Bucătar', 'execution');
const manager = position('Manager restaurant', 'technical_administrative');

function mockApi({
  client = sampleClient,
  details = occupationalDetails,
  fireSafety = emptyFireSafety,
  exists = false,
  positions = [] as ReturnType<typeof position>[],
} = {}) {
  let current = { fireSafety, exists };
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({ user: { id: 'user-one', email: 'review@example.test' } });
    }
    if (pathname === `/clients/${clientId}`) return Response.json({ client });
    if (pathname === `/clients/${clientId}/document-details`) {
      return Response.json({ documentDetails: details });
    }
    if (pathname === `/clients/${clientId}/job-positions`) {
      return Response.json({ items: positions });
    }
    if (pathname === `/clients/${clientId}/responsible-persons`)
      return Response.json({ items: [] });
    if (pathname === `/clients/${clientId}/workplaces`) return Response.json({ items: [] });
    if (pathname === firePath) {
      if (method === 'PUT') {
        current = { fireSafety: JSON.parse(String(init?.body)) as typeof fireSafety, exists: true };
      }
      return Response.json(current);
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

const mount = (search = '') =>
  mountApp(authFixture(makeSession()).client, `/clienti/${clientId}/instruire${search}`);

const value = (testId: string) => screen.getByTestId<HTMLInputElement>(testId).value;
const checked = (testId: string) => screen.getByTestId<HTMLInputElement>(testId).checked;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('the fire-safety training card', () => {
  it('sits after the occupational safety schedule, before its own smoking and waste card', async () => {
    mockApi();
    mount();

    const card = await screen.findByTestId('fire-safety-card');
    const page = screen.getByTestId('training-page');
    const cards = [...page.querySelectorAll('[data-testid$="-card"]')].map((item) =>
      item.getAttribute('data-testid')
    );
    expect(cards.indexOf('fire-safety-card')).toBe(cards.indexOf('training-program-card') + 1);
    expect(cards.indexOf('fire-rules-card')).toBe(cards.indexOf('fire-safety-card') + 1);
    expect(within(card).getByTestId('fire-schedule-empty')).toBeTruthy();
    expect(within(card).getByTestId('fire-safety-edit').textContent).toBe('Adaugă');
    const rules = screen.getByTestId('fire-rules-card');
    expect(within(rules).getByTestId('fire-smoking').textContent).toBe('Nestabilit');
    expect(within(rules).getByTestId('fire-rules-edit').textContent).toBe('Adaugă');
  });

  it('opens on the law and the occupational calendar while nothing is saved, and saves only the schedule', async () => {
    mockApi({ positions: [cook, manager] });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('fire-safety-edit'));
    expect(await screen.findByTestId('fire-safety-starting')).toBeTruthy();
    expect(checked('fire-training-duration-2')).toBe(true);
    expect(checked('fire-administrative-interval-6')).toBe(true);
    expect(checked('fire-worker-interval-6')).toBe(true);
    expect(screen.queryByTestId('fire-worker-interval-12')).toBeNull();
    expect(value('fire-first-month')).toBe('2');
    expect(value('fire-day-from')).toBe('2');
    expect(value('fire-day-to')).toBe('7');

    await user.click(screen.getByTestId('fire-worker-interval-3'));
    await user.click(screen.getByTestId('fire-safety-save'));

    await waitFor(() =>
      expect(requests(firePath, 'PUT')).toEqual([
        {
          ...emptyFireSafety,
          periodicTrainingHours: 2,
          administrativeTrainingIntervalMonths: 6,
          workerTrainingIntervalMonths: 3,
          trainingFirstMonth: 2,
          trainingDayFrom: 2,
          trainingDayTo: 7,
        },
      ])
    );
    expect(await screen.findByText('Instruirea SU a fost salvată.')).toBeTruthy();
    expect((await screen.findByTestId('fire-schedule-session')).textContent).toBe(
      'Fiecare instruire durează 2 ore și are loc între zilele 2 și 7 ale lunii.'
    );
    expect(screen.getByTestId('fire-schedule-execution').textContent).toContain('La 3 luni');
  });

  it('leaves the calendar empty when the occupational schedule has none', async () => {
    mockApi({
      details: {
        ...occupationalDetails,
        trainingFirstMonth: null,
        trainingDayFrom: null,
        trainingDayTo: null,
      },
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('fire-safety-edit'));
    expect(checked('fire-training-duration-2')).toBe(true);
    expect(value('fire-first-month')).toBe('');
    expect(value('fire-day-from')).toBe('');
    expect(
      within(screen.getByTestId('fire-safety-card')).getByTestId('training-no-positions')
    ).toBeTruthy();
  });

  it('shows a saved schedule as saved, without starting values for what it left empty', async () => {
    mockApi({
      fireSafety: { ...savedFireSafety, periodicTrainingHours: null },
      exists: true,
      positions: [cook, manager],
    });
    mount();
    const user = userEvent.setup();

    const card = await screen.findByTestId('fire-safety-card');
    expect(within(card).getByTestId('fire-schedule-execution').textContent).toContain('La 3 luni');
    expect(within(card).getByTestId('fire-schedule-incomplete')).toBeTruthy();
    await user.click(within(card).getByTestId('fire-safety-edit'));
    expect(screen.queryByTestId('fire-safety-starting')).toBeNull();
    expect(checked('fire-training-duration-2')).toBe(false);
    expect(value('fire-first-month')).toBe('1');
    expect(screen.getByTestId<HTMLButtonElement>('fire-safety-save').disabled).toBe(true);
  });

  it('shows a complete schedule by category, with its months', async () => {
    mockApi({ fireSafety: savedFireSafety, exists: true, positions: [cook, manager] });
    mount();

    expect((await screen.findByTestId('fire-schedule-execution')).textContent).toContain(
      'Ianuarie, aprilie, iulie, octombrie'
    );
    expect(screen.getByTestId('fire-schedule-administrative').textContent).toContain(
      'Ianuarie, iulie'
    );
    expect(screen.getByTestId('fire-schedule-session').textContent).toContain('2 ore');
  });

  it('asks only the categories the client has posts in, and keeps what was saved for the other', async () => {
    mockApi({
      fireSafety: { ...savedFireSafety, administrativeTrainingIntervalMonths: null },
      exists: true,
      positions: [cook],
    });
    mount();
    const user = userEvent.setup();

    expect(await screen.findByTestId('fire-schedule-session')).toBeTruthy();
    expect(screen.queryByTestId('fire-schedule-administrative')).toBeNull();
    await user.click(screen.getByTestId('fire-safety-edit'));
    expect(screen.getByTestId('fire-absent-technical_administrative')).toBeTruthy();
    await user.click(screen.getByTestId('fire-worker-interval-1'));
    await user.click(screen.getByTestId('fire-safety-save'));

    await waitFor(() =>
      expect(requests(firePath, 'PUT')).toEqual([
        {
          ...savedFireSafety,
          administrativeTrainingIntervalMonths: null,
          workerTrainingIntervalMonths: 1,
        },
      ])
    );
  });

  it('picks the longest interval for a category that has posts and no interval yet', async () => {
    mockApi({
      fireSafety: { ...savedFireSafety, administrativeTrainingIntervalMonths: null },
      exists: true,
      positions: [cook, manager],
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('fire-safety-edit'));
    expect(checked('fire-administrative-interval-6')).toBe(true);
    expect(screen.getByTestId('fire-safety-new-category-technical_administrative')).toBeTruthy();
    await user.click(screen.getByTestId('fire-safety-save'));

    await waitFor(() =>
      expect(requests(firePath, 'PUT')).toEqual([
        { ...savedFireSafety, administrativeTrainingIntervalMonths: 6 },
      ])
    );
  });

  it('says which day to write when the last comes before the first', async () => {
    mockApi({ fireSafety: savedFireSafety, exists: true, positions: [cook] });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('fire-safety-edit'));
    await user.clear(screen.getByTestId('fire-day-to'));
    await user.type(screen.getByTestId('fire-day-to'), '3');
    await user.click(screen.getByTestId('fire-safety-save'));

    expect((await screen.findByTestId('fire-day-to-error')).textContent).toBe(
      'Ultima zi vine după prima. Scrie o zi între 10 și 31.'
    );
    expect(requests(firePath, 'PUT')).toEqual([]);
  });

  it('offers to load again instead of a calendar when the occupational schedule fails to load', async () => {
    mockApi();
    const answer = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (input, init) =>
      new URL(String(input)).pathname === `/clients/${clientId}/document-details`
        ? Response.json({ reason: 'internal' }, { status: 500 })
        : answer(input, init)
    );
    mount();

    const failed = await screen.findByTestId('fire-safety-unavailable');
    expect(failed.textContent).toContain('Nu am putut încărca instruirea SU.');
    expect(screen.queryByTestId('fire-safety-card')).toBeNull();
  });

  it('saves one card over what the other just saved, before the page reads the row again', async () => {
    mockApi({ fireSafety: savedFireSafety, exists: true, positions: [cook, manager] });
    const answer = fetchMock.getMockImplementation()!;
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    fetchMock.mockImplementation(async (input, init) => {
      const read =
        new URL(String(input)).pathname === firePath && (init?.method ?? 'GET') === 'GET';
      if (read && requests(firePath, 'PUT').length > 0) await held;
      return answer(input, init);
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('fire-safety-edit'));
    await user.click(screen.getByTestId('fire-rules-edit'));
    await user.click(screen.getByTestId('fire-worker-interval-1'));
    await user.click(screen.getByTestId('fire-safety-save'));
    await waitFor(() => expect(requests(firePath, 'PUT')).toHaveLength(1));
    await user.type(screen.getByTestId('fire-waste-input'), 'deșeuri menajere{Enter}');
    await user.click(screen.getByTestId('fire-rules-save'));

    await waitFor(() => expect(requests(firePath, 'PUT')).toHaveLength(2));
    expect(requests(firePath, 'PUT')[1]).toEqual({
      ...savedFireSafety,
      workerTrainingIntervalMonths: 1,
      wasteKinds: [...savedFireSafety.wasteKinds, 'deșeuri menajere'],
    });
    release();
  });

  it('waits for a save of the other card still on its way before saving over it', async () => {
    mockApi({ fireSafety: savedFireSafety, exists: true, positions: [cook, manager] });
    const answer = fetchMock.getMockImplementation()!;
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    fetchMock.mockImplementation(async (input, init) => {
      const write = new URL(String(input)).pathname === firePath && init?.method === 'PUT';
      if (write && requests(firePath, 'PUT').length === 1) await held;
      return answer(input, init);
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('fire-safety-edit'));
    await user.click(screen.getByTestId('fire-rules-edit'));
    await user.click(screen.getByTestId('fire-worker-interval-1'));
    await user.click(screen.getByTestId('fire-safety-save'));
    await waitFor(() => expect(requests(firePath, 'PUT')).toHaveLength(1));
    await user.type(screen.getByTestId('fire-waste-input'), 'deșeuri menajere{Enter}');
    await user.click(screen.getByTestId('fire-rules-save'));
    expect(requests(firePath, 'PUT')).toHaveLength(1);

    release();
    await waitFor(() => expect(requests(firePath, 'PUT')).toHaveLength(2));
    expect(requests(firePath, 'PUT')[1]).toEqual({
      ...savedFireSafety,
      workerTrainingIntervalMonths: 1,
      wasteKinds: [...savedFireSafety.wasteKinds, 'deșeuri menajere'],
    });
  });

  it('saves the smoking and waste of a client without a row, leaving the schedule empty', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('fire-rules-edit'));
    await user.type(screen.getByTestId('fire-waste-input'), 'deșeuri de carton{Enter}');
    await user.type(screen.getByTestId('fire-waste-input'), 'Deșeuri de carton{Enter}');
    expect(screen.getByTestId('fire-waste-input-error').textContent).toContain('deja în listă');
    await user.clear(screen.getByTestId('fire-waste-input'));
    await user.type(screen.getByTestId('fire-waste-input'), 'uleiuri uzate');
    await user.click(screen.getByTestId('fire-rules-save'));

    await waitFor(() =>
      expect(requests(firePath, 'PUT')).toEqual([
        { ...emptyFireSafety, wasteKinds: ['deșeuri de carton', 'uleiuri uzate'] },
      ])
    );
    expect(await screen.findByText('Fumatul și deșeurile au fost salvate.')).toBeTruthy();
    expect(screen.getByTestId('fire-safety-edit').textContent).toBe('Adaugă');
  });

  it('adds a kind of waste of up to 240 characters and refuses a longer one', async () => {
    mockApi({ fireSafety: savedFireSafety, exists: true });
    mount();
    const user = userEvent.setup();
    const long = `deșeuri din construcții și demolări ${'x'.repeat(240)}`.slice(0, 240);

    await user.click(await screen.findByTestId('fire-rules-edit'));
    await user.click(screen.getByTestId('fire-waste-input'));
    await user.paste(`${long}y`);
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('fire-waste-input-error').textContent).toBe(
      'Un tip de deșeu are cel mult 240 de caractere.'
    );
    await user.keyboard('{Backspace}{Enter}');
    expect(screen.queryByTestId('fire-waste-input-error')).toBeNull();
    expect(screen.getByRole('button', { name: `Scoate „${long}”` })).toBeTruthy();
  });

  it('names who collects the waste, and says the workers on duty do while it is empty', async () => {
    mockApi({ fireSafety: savedFireSafety, exists: true });
    mount();
    const user = userEvent.setup();

    expect((await screen.findByTestId('fire-waste-collectors')).textContent).toBe(
      'Lucrătorii aflați la program'
    );
    await user.click(screen.getByTestId('fire-rules-edit'));
    await user.type(screen.getByTestId('fire-waste-collectors-input'), 'x');
    await user.click(screen.getByTestId('fire-rules-save'));
    expect((await screen.findByTestId('fire-waste-collectors-input-error')).textContent).toBe(
      'Textul are cel puțin 2 caractere.'
    );
    await user.clear(screen.getByTestId('fire-waste-collectors-input'));
    await user.type(
      screen.getByTestId('fire-waste-collectors-input'),
      ' muncitorii necalificați și șeful de șantier '
    );
    await user.click(screen.getByTestId('fire-rules-save'));

    await waitFor(() =>
      expect(requests(firePath, 'PUT')).toEqual([
        { ...savedFireSafety, wasteCollectors: 'muncitorii necalificați și șeful de șantier' },
      ])
    );
    expect((await screen.findByTestId('fire-waste-collectors')).textContent).toBe(
      'muncitorii necalificați și șeful de șantier'
    );
  });

  it('says whether other firms work on the premises', async () => {
    mockApi({ fireSafety: savedFireSafety, exists: true });
    mount();
    const user = userEvent.setup();

    expect((await screen.findByTestId('fire-third-parties')).textContent).toBe('Nu');
    await user.click(screen.getByTestId('fire-rules-edit'));
    await user.click(
      screen.getByLabelText('În spațiile clientului lucrează și alte firme (chiriași, prestatori)')
    );
    await user.click(screen.getByTestId('fire-rules-save'));

    await waitFor(() =>
      expect(requests(firePath, 'PUT')).toEqual([{ ...savedFireSafety, hasThirdParties: true }])
    );
    expect((await screen.findByTestId('fire-third-parties')).textContent).toBe('Da');
  });

  it('takes a waste kind off the list and clears the rest of the card on save', async () => {
    mockApi({ fireSafety: savedFireSafety, exists: true });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('fire-rules-edit'));
    await user.click(screen.getByRole('button', { name: 'Scoate „deșeuri de carton”' }));
    await user.selectOptions(screen.getByTestId('fire-smoking-select'), '');
    await user.clear(screen.getByTestId('fire-waste-contractor-input'));
    await user.click(screen.getByTestId('fire-rules-save'));

    await waitFor(() =>
      expect(requests(firePath, 'PUT')).toEqual([
        {
          ...savedFireSafety,
          smokingPolicy: null,
          smokingPlace: null,
          wasteKinds: ['uleiuri uzate'],
          wasteContractor: null,
        },
      ])
    );
  });

  it('shows the smoking place under the designated-places rule and drops it when smoking is forbidden', async () => {
    mockApi({ fireSafety: savedFireSafety, exists: true });
    mount();
    const user = userEvent.setup();

    expect((await screen.findByTestId('fire-smoking-place')).textContent).toBe(
      'în curtea interioară, lângă poarta de acces auto'
    );
    await user.click(screen.getByTestId('fire-rules-edit'));
    expect(value('fire-smoking-place-input')).toBe(
      'în curtea interioară, lângă poarta de acces auto'
    );
    await user.selectOptions(screen.getByTestId('fire-smoking-select'), 'forbidden_everywhere');
    expect(screen.queryByTestId('fire-smoking-place-input')).toBeNull();
    await user.click(screen.getByTestId('fire-rules-save'));

    await waitFor(() =>
      expect(requests(firePath, 'PUT')).toEqual([
        { ...savedFireSafety, smokingPolicy: 'forbidden_everywhere', smokingPlace: null },
      ])
    );
    expect((await screen.findByTestId('fire-smoking')).textContent).toBe(
      'Interzis în toată unitatea'
    );
    expect(screen.queryByTestId('fire-smoking-place')).toBeNull();
  });

  it('asks where smoking is allowed only once designated places are picked', async () => {
    mockApi({
      fireSafety: { ...savedFireSafety, smokingPolicy: null, smokingPlace: null },
      exists: true,
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('fire-rules-edit'));
    expect(screen.queryByTestId('fire-smoking-place-input')).toBeNull();
    await user.selectOptions(screen.getByTestId('fire-smoking-select'), 'designated_places');
    await user.type(screen.getByTestId('fire-smoking-place-input'), 'x');
    await user.click(screen.getByTestId('fire-rules-save'));
    expect((await screen.findByTestId('fire-smoking-place-input-error')).textContent).toBe(
      'Locul are cel puțin 2 caractere.'
    );
    expect(requests(firePath, 'PUT')).toEqual([]);

    await user.type(screen.getByTestId('fire-smoking-place-input'), ' lângă rampa de descărcare ');
    await user.click(screen.getByTestId('fire-rules-save'));
    await waitFor(() =>
      expect(requests(firePath, 'PUT')).toEqual([
        {
          ...savedFireSafety,
          smokingPolicy: 'designated_places',
          smokingPlace: 'x lângă rampa de descărcare',
        },
      ])
    );
  });

  it.each([
    ['fire-waste', 'fire-rules-form', 'fire-waste-input'],
    ['fire-smoking', 'fire-rules-form', 'fire-smoking'],
    ['fire-training-schedule', 'fire-safety-form', 'fire-first-month'],
  ])('opens the form for ?focus=%s and focuses the field to fill', async (focus, form, field) => {
    mockApi({ details: { ...occupationalDetails, trainingFirstMonth: null } });
    mount(`?focus=${focus}`);

    await screen.findByTestId(form);
    await waitFor(() => expect(document.activeElement?.id).toBe(field));
  });

  it('shows an archived client the cards without the edit buttons', async () => {
    mockApi({
      client: { ...sampleClient, archivedAt: '2026-09-18T10:00:00+00:00' },
      fireSafety: savedFireSafety,
      exists: true,
      positions: [cook],
    });
    mount();

    await screen.findByTestId('fire-schedule-session');
    expect(screen.queryByTestId('fire-safety-edit')).toBeNull();
    expect(screen.queryByTestId('fire-rules-edit')).toBeNull();
  });
});
