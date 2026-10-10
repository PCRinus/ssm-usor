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
  wasteKinds: [] as string[],
  wasteContractor: null as string | null,
};

const savedFireSafety = {
  periodicTrainingHours: 2,
  administrativeTrainingIntervalMonths: 6,
  workerTrainingIntervalMonths: 3,
  trainingFirstMonth: 1,
  trainingDayFrom: 10,
  trainingDayTo: 15,
  smokingPolicy: 'designated_places',
  wasteKinds: ['deșeuri de carton', 'uleiuri uzate'],
  wasteContractor: 'Salubris SA',
};

const firePath = `/clients/${clientId}/fire-safety`;

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  client = sampleClient,
  details = occupationalDetails,
  fireSafety = emptyFireSafety,
  exists = false,
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
      return Response.json({ items: [], page: 1, pageSize: 100, total: 0 });
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
  mountApp(authFixture(makeSession()).client, `/clients/${clientId}/training${search}`);

const value = (testId: string) => screen.getByTestId<HTMLInputElement>(testId).value;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('the fire-safety training card', () => {
  it('sits after the occupational safety schedule and shows nothing as filled in before a save', async () => {
    mockApi();
    mount();

    const card = await screen.findByTestId('fire-safety-card');
    const page = screen.getByTestId('training-page');
    const cards = [...page.querySelectorAll('[data-testid$="-card"]')].map((item) =>
      item.getAttribute('data-testid')
    );
    expect(cards.indexOf('fire-safety-card')).toBe(cards.indexOf('training-program-card') + 1);
    expect(within(card).getByTestId('fire-schedule-facts').textContent).toContain('Necompletat');
    expect(within(card).getByTestId('fire-smoking').textContent).toBe('Nestabilit');
    expect(within(card).getByTestId('fire-safety-edit').textContent).toBe('Adaugă');
  });

  it('opens on the starting values and the occupational calendar while nothing is saved', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('fire-safety-edit'));
    expect(await screen.findByTestId('fire-safety-starting')).toBeTruthy();
    expect(value('fire-training-hours')).toBe('2');
    expect(value('fire-administrative-interval')).toBe('3');
    expect(value('fire-worker-interval')).toBe('3');
    expect(value('fire-first-month')).toBe('2');
    expect(value('fire-day-from')).toBe('2');
    expect(value('fire-day-to')).toBe('7');

    await user.type(screen.getByTestId('fire-waste-input'), 'deșeuri de carton{Enter}');
    await user.type(screen.getByTestId('fire-waste-input'), 'Deșeuri de carton{Enter}');
    expect(screen.getByTestId('fire-waste-input-error').textContent).toContain('deja în listă');
    await user.clear(screen.getByTestId('fire-waste-input'));
    await user.type(screen.getByTestId('fire-waste-input'), 'uleiuri uzate');
    await user.click(screen.getByTestId('fire-safety-save'));

    await waitFor(() =>
      expect(requests(firePath, 'PUT')).toEqual([
        {
          periodicTrainingHours: 2,
          administrativeTrainingIntervalMonths: 3,
          workerTrainingIntervalMonths: 3,
          trainingFirstMonth: 2,
          trainingDayFrom: 2,
          trainingDayTo: 7,
          smokingPolicy: null,
          wasteKinds: ['deșeuri de carton', 'uleiuri uzate'],
          wasteContractor: null,
        },
      ])
    );
    expect(await screen.findByText('Instruirea PSI a fost salvată.')).toBeTruthy();
    expect((await screen.findByTestId('fire-schedule-session')).textContent).toBe(
      'Fiecare instruire durează 2 ore și are loc între zilele 2 și 7 ale lunii.'
    );
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
    expect(value('fire-training-hours')).toBe('2');
    expect(value('fire-first-month')).toBe('');
    expect(value('fire-day-from')).toBe('');
  });

  it('shows a saved row as saved, without starting values for what it left empty', async () => {
    mockApi({
      fireSafety: { ...savedFireSafety, periodicTrainingHours: null },
      exists: true,
    });
    mount();
    const user = userEvent.setup();

    const card = await screen.findByTestId('fire-safety-card');
    expect(within(card).getByTestId('fire-schedule-facts').textContent).toContain('La 3 luni');
    expect(within(card).getByTestId('fire-smoking').textContent).toBe(
      'Permis numai în locuri amenajate'
    );
    expect(within(card).getByTestId('fire-waste-kinds').textContent).toContain('uleiuri uzate');
    await user.click(within(card).getByTestId('fire-safety-edit'));
    expect(screen.queryByTestId('fire-safety-starting')).toBeNull();
    expect(value('fire-training-hours')).toBe('');
    expect(value('fire-first-month')).toBe('1');
    expect(screen.getByTestId<HTMLButtonElement>('fire-safety-save').disabled).toBe(true);
  });

  it('shows a complete schedule by category, with its months', async () => {
    mockApi({ fireSafety: savedFireSafety, exists: true });
    mount();

    expect((await screen.findByTestId('fire-schedule-execution')).textContent).toContain(
      'Ianuarie, Aprilie, Iulie, Octombrie'
    );
    expect(screen.getByTestId('fire-schedule-administrative').textContent).toContain(
      'Ianuarie, Iulie'
    );
    expect(screen.getByTestId('fire-waste-contractor').textContent).toBe('Salubris SA');
  });

  it('takes a waste kind off the list and clears the rest of the card on save', async () => {
    mockApi({ fireSafety: savedFireSafety, exists: true });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('fire-safety-edit'));
    await user.click(screen.getByRole('button', { name: 'Scoate „deșeuri de carton”' }));
    await user.selectOptions(screen.getByTestId('fire-smoking-select'), '');
    await user.clear(screen.getByTestId('fire-waste-contractor-input'));
    await user.click(screen.getByTestId('fire-safety-save'));

    await waitFor(() =>
      expect(requests(firePath, 'PUT')).toEqual([
        {
          ...savedFireSafety,
          smokingPolicy: null,
          wasteKinds: ['uleiuri uzate'],
          wasteContractor: null,
        },
      ])
    );
  });

  it('refuses a last day before the first', async () => {
    mockApi({ fireSafety: savedFireSafety, exists: true });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('fire-safety-edit'));
    await user.clear(screen.getByTestId('fire-day-to'));
    await user.type(screen.getByTestId('fire-day-to'), '3');
    await user.click(screen.getByTestId('fire-safety-save'));

    expect((await screen.findByTestId('fire-day-to-error')).textContent).toContain('Ultima zi');
    expect(requests(firePath, 'PUT')).toEqual([]);
  });

  it.each([
    ['fire-waste', 'fire-waste-input'],
    ['fire-training-schedule', 'fire-first-month'],
  ])('opens the form for ?focus=%s and focuses the field to fill', async (focus, field) => {
    mockApi({ details: { ...occupationalDetails, trainingFirstMonth: null } });
    mount(`?focus=${focus}`);

    await screen.findByTestId('fire-safety-form');
    await waitFor(() => expect(document.activeElement?.id).toBe(field));
  });

  it('shows an archived client the card without the edit button', async () => {
    mockApi({
      client: { ...sampleClient, archivedAt: '2026-09-18T10:00:00+00:00' },
      fireSafety: savedFireSafety,
      exists: true,
    });
    mount();

    await screen.findByTestId('fire-schedule-session');
    expect(screen.queryByTestId('fire-safety-edit')).toBeNull();
  });
});
