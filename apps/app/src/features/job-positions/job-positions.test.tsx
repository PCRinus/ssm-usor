import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

import { employeeCountLabel } from './job-position-schema';

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

const barista = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  clientId,
  name: 'Barman preparator',
  staffCategory: 'execution',
  workZone: 'Gelaterie',
  activities: 'Prepară și servește înghețată și cafea.',
  trainingIntervalMonths: null as number | null,
  employeeCount: 3,
  needsProtectiveEquipment: true as boolean | null,
  equipmentCount: 2,
  needsInstructions: null as boolean | null,
  instructionCount: 0,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
};

const manager = {
  ...barista,
  id: '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d',
  name: 'Manager magazin – birou',
  staffCategory: 'technical_administrative',
  workZone: 'Birou',
  activities: null,
  employeeCount: 0,
  needsProtectiveEquipment: null,
  equipmentCount: 0,
  needsInstructions: null as boolean | null,
  instructionCount: 0,
};

const listPath = `/clients/${clientId}/job-positions`;

type Route = (init: RequestInit | undefined) => Response;

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  client = sampleClient,
  items = [barista, manager] as unknown[],
  create = ((init) =>
    Response.json(
      { jobPosition: { ...manager, ...JSON.parse(String(init?.body)) } },
      { status: 201 }
    )) as Route,
  update = ((init) =>
    Response.json({ jobPosition: { ...manager, ...JSON.parse(String(init?.body)) } })) as Route,
  remove = (() => new Response(null, { status: 204 })) as Route,
} = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({ user: { id: 'user-one', email: 'review@example.test' } });
    }
    if (pathname === `/clients/${clientId}`) return Response.json({ client });
    if (pathname === listPath) return method === 'POST' ? create(init) : Response.json({ items });
    if (pathname === `/clients/${clientId}/risk-evaluations`) return Response.json({ items: [] });
    if (pathname.endsWith('/risk-evaluation')) return Response.json({ evaluation: null });
    if (pathname.endsWith('/equipment')) {
      return Response.json({ items: [], needsProtectiveEquipment: null });
    }
    if (pathname.startsWith(`${listPath}/`))
      return method === 'DELETE' ? remove(init) : update(init);
    if (pathname.endsWith('/instructions')) {
      return Response.json({ items: [], needsInstructions: null });
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
  mountApp(authFixture(makeSession()).client, `/clients/${clientId}/job-positions`);

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  const rows = await screen.findAllByTestId('job-position-row');
  const row = rows.find((item) => item.textContent?.includes(name))!;
  await user.click(within(row).getByTestId('job-position-actions'));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe("a client's job positions", () => {
  it('is a section of the client page, listing each position with its category, zone and people', async () => {
    mockApi();
    mount();

    const [first, second] = await screen.findAllByTestId('job-position-row');
    expect(first!.textContent).toContain('Barman preparator');
    expect(first!.textContent).toContain('Prepară și servește');
    expect(within(first!).getByTestId('job-position-category-badge').textContent).toBe('Execuție');
    expect(first!.textContent).toContain('Gelaterie');
    expect(within(first!).getByTestId('job-position-employees').textContent).toBe('3 angajați');
    expect(within(second!).getByTestId('job-position-category-badge').textContent).toBe(
      'Tehnic-administrativ'
    );
    expect(within(second!).getByTestId('job-position-employees').textContent).toBe(
      'Niciun angajat'
    );
    expect(within(first!).getByTestId('job-position-equipment').textContent).toBe('2 articole');
    expect(within(second!).getByTestId('job-position-equipment').textContent).toBe('De stabilit');

    const sections = screen.getAllByTestId('client-section').map((item) => item.textContent);
    expect(sections.slice(0, 3)).toEqual(['Detalii', 'Angajați', 'Posturi de lucru']);
    const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(within(breadcrumb).getByText('Posturi de lucru')).toBeTruthy();
  });

  it('opens a position on its own page from its name', async () => {
    mockApi();
    const runtime = mount();
    const user = userEvent.setup();
    const [row] = await screen.findAllByTestId('job-position-row');
    await user.click(within(row!).getByTestId('job-position-open'));
    await screen.findByTestId('job-position-page');
    expect(runtime.router.state.location.pathname).toBe(`${listPath}/${barista.id}`);
    expect(screen.getByRole('heading', { level: 2, name: 'Barman preparator' })).toBeTruthy();
    expect(screen.getByText('Prepară și servește înghețată și cafea.')).toBeTruthy();
    const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(within(breadcrumb).getByRole('link', { name: 'Posturi de lucru' })).toBeTruthy();
    expect(within(breadcrumb).getByText('Barman preparator')).toBeTruthy();
  });

  it("links each position's equipment and instructions to that section, in words for each state", async () => {
    const cashier = {
      ...barista,
      id: '3f1d2c4b-5a6e-4f7a-8b9c-0d1e2f3a4b5c',
      name: 'Casier',
      needsProtectiveEquipment: false,
      equipmentCount: 0,
      needsInstructions: true,
      instructionCount: 3,
    };
    const cook = {
      ...barista,
      id: '4a2e3d5c-6b7f-4a8b-9c0d-1e2f3a4b5c6d',
      name: 'Bucătar',
      equipmentCount: 20,
      needsInstructions: true,
      instructionCount: 1,
    };
    mockApi({ items: [barista, manager, cashier, cook] });
    mount();

    const rows = await screen.findAllByTestId('job-position-row');
    const states = rows.map((row) => [
      within(row).getByTestId('job-position-equipment').textContent,
      within(row).getByTestId('job-position-instructions').textContent,
    ]);
    expect(states).toEqual([
      ['2 articole', 'De stabilit'],
      ['De stabilit', 'De stabilit'],
      ['Nu necesită', '3 instrucțiuni'],
      ['20 de articole', '1 instrucțiune'],
    ]);
    const [first] = rows;
    expect(within(first!).getByTestId('job-position-equipment').getAttribute('href')).toBe(
      `${listPath}/${barista.id}#protective-equipment`
    );
    expect(within(first!).getByTestId('job-position-instructions').getAttribute('href')).toBe(
      `${listPath}/${barista.id}#instructions`
    );
  });

  it('opens the section a state link names, not only the top of the page', async () => {
    mockApi();
    const runtime = mount();
    const user = userEvent.setup();
    const [row] = await screen.findAllByTestId('job-position-row');
    await user.click(within(row!).getByTestId('job-position-equipment'));
    await screen.findByTestId('job-position-page');
    expect(runtime.router.state.location.pathname).toBe(`${listPath}/${barista.id}`);
    expect(runtime.router.state.location.hash).toBe('protective-equipment');
  });

  it("offers the position's equipment and instructions first in the row menu", async () => {
    mockApi();
    const runtime = mount();
    const user = userEvent.setup();

    await openRowMenu(user, 'Manager magazin');
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Echipament de protecție',
      'Instrucțiuni',
      'Evaluare de risc',
      'Modifică',
      'Șterge',
    ]);
    await user.click(screen.getByTestId('job-position-menu-instructions'));
    await screen.findByTestId('job-position-page');
    expect(runtime.router.state.location.pathname).toBe(`${listPath}/${manager.id}`);
    expect(runtime.router.state.location.hash).toBe('instructions');
  });

  it('names the positions still undecided about equipment or instructions, with links', async () => {
    mockApi();
    mount();

    const equipment = await screen.findByTestId('job-positions-undecided-equipment');
    expect(equipment.textContent).toBe(
      'Un post nu are echipamentul de protecție stabilit: Manager magazin – birou.'
    );
    expect(within(equipment).getByRole('link').getAttribute('href')).toBe(
      `${listPath}/${manager.id}#protective-equipment`
    );
    const instructions = screen.getByTestId('job-positions-undecided-instructions');
    expect(instructions.textContent).toBe(
      '2 posturi nu au instrucțiunile stabilite: Barman preparator și Manager magazin – birou.'
    );
    expect(
      within(instructions)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href'))
    ).toEqual([`${listPath}/${barista.id}#instructions`, `${listPath}/${manager.id}#instructions`]);
  });

  it('names only the first undecided positions when there are many', async () => {
    const many = Array.from({ length: 7 }, (_, index) => ({
      ...manager,
      id: `9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5${index}`,
      name: `Post ${index + 1}`,
    }));
    mockApi({ items: many });
    mount();
    expect((await screen.findByTestId('job-positions-undecided-equipment')).textContent).toBe(
      '7 posturi nu au echipamentul de protecție stabilit: Post 1, Post 2, Post 3, Post 4, Post 5 și încă 2.'
    );
  });

  it('asks for nothing once every position has decided', async () => {
    mockApi({ items: [{ ...barista, needsInstructions: false }] });
    mount();
    await screen.findAllByTestId('job-position-row');
    expect(screen.queryByTestId('job-positions-undecided')).toBeNull();
  });

  it('says how positions come to exist when there are none', async () => {
    mockApi({ items: [] });
    mount();
    expect((await screen.findByTestId('job-positions-empty')).textContent).toMatch(
      /fiecare funcție nouă devine un post/i
    );
  });

  it('adds a position, in the execution category unless told otherwise', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('job-position-add'));
    expect(screen.getByTestId<HTMLSelectElement>('job-position-category').value).toBe('execution');
    await user.click(screen.getByTestId('job-position-save'));
    expect(await screen.findByText(/Introdu denumirea postului/)).toBeTruthy();

    await user.type(screen.getByTestId('job-position-name'), '  Lucrător comercial ');
    await user.type(screen.getByTestId('job-position-zone'), 'Gelaterie');
    await user.click(screen.getByTestId('job-position-save'));

    await waitFor(() => expect(requests(listPath, 'POST')).toHaveLength(1));
    expect(requests(listPath, 'POST')[0]).toEqual({
      name: 'Lucrător comercial',
      staffCategory: 'execution',
      workZone: 'Gelaterie',
      activities: null,
      trainingIntervalMonths: null,
    });
    expect(await screen.findByText('Postul de lucru a fost adăugat.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('job-position-dialog')).toBeNull());
  });

  it('puts a taken name on the field, with the way out', async () => {
    mockApi({
      create: () =>
        Response.json(
          { code: 'conflict', message: 'Taken.', reason: 'job_position_name_taken' },
          { status: 409 }
        ),
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('job-position-add'));
    await user.type(screen.getByTestId('job-position-name'), 'Barman preparator');
    await user.click(screen.getByTestId('job-position-save'));

    expect(await screen.findByText(/are deja un post cu această denumire/)).toBeTruthy();
    expect(screen.getByTestId('job-position-dialog')).toBeTruthy();
  });

  it('edits a position and says that contract titles stay as they are', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await openRowMenu(user, 'Manager magazin');
    await user.click(await screen.findByTestId('job-position-edit'));
    expect(screen.getByTestId('job-position-dialog').textContent).toContain(
      'chiar dacă redenumești postul'
    );
    expect(screen.getByTestId<HTMLSelectElement>('job-position-category').value).toBe(
      'technical_administrative'
    );
    const name = screen.getByTestId('job-position-name');
    await user.clear(name);
    await user.type(name, 'Manager magazin');
    await user.type(screen.getByTestId('job-position-activities'), 'Conduce magazinul.');
    await user.click(screen.getByTestId('job-position-save'));

    await waitFor(() => expect(requests(`${listPath}/${manager.id}`, 'PUT')).toHaveLength(1));
    expect(requests(`${listPath}/${manager.id}`, 'PUT')[0]).toEqual({
      name: 'Manager magazin',
      staffCategory: 'technical_administrative',
      workZone: 'Birou',
      activities: 'Conduce magazinul.',
      trainingIntervalMonths: null,
    });
  });

  it('gives a post an interval of its own, within what its category allows', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('job-position-add'));
    await user.type(screen.getByTestId('job-position-name'), 'Sudor');
    const interval = screen.getByTestId<HTMLSelectElement>('job-position-interval');
    expect([...interval.options].map((option) => option.value)).toEqual([
      '',
      '1',
      '2',
      '3',
      '4',
      '6',
    ]);
    await user.selectOptions(
      screen.getByTestId('job-position-category'),
      'technical_administrative'
    );
    expect([...interval.options].map((option) => option.value)).toContain('12');
    await user.selectOptions(interval, '12');
    // A year is not an interval for execution staff: going back drops it with its option.
    await user.selectOptions(screen.getByTestId('job-position-category'), 'execution');
    expect(interval.value).toBe('');

    await user.selectOptions(interval, '2');
    await user.click(screen.getByTestId('job-position-save'));
    await waitFor(() => expect(requests(listPath, 'POST')).toHaveLength(1));
    expect(requests(listPath, 'POST')[0]).toMatchObject({ trainingIntervalMonths: 2 });
  });

  it('removes an empty position, and will not offer it for one people are in', async () => {
    mockApi();
    mount();
    const user = userEvent.setup();

    await openRowMenu(user, 'Barman preparator');
    await user.click(await screen.findByTestId('job-position-remove'));
    const held = await screen.findByTestId('job-position-remove-dialog');
    expect(held.textContent).toContain('3 angajați');
    expect(screen.getByTestId<HTMLButtonElement>('job-position-remove-confirm').disabled).toBe(
      true
    );
    await user.click(within(held).getByRole('button', { name: 'Renunță' }));

    await openRowMenu(user, 'Manager magazin');
    await user.click(await screen.findByTestId('job-position-remove'));
    await user.click(await screen.findByTestId('job-position-remove-confirm'));
    await waitFor(() => expect(requests(`${listPath}/${manager.id}`, 'DELETE')).toHaveLength(1));
    expect(await screen.findByText(/a fost șters\./)).toBeTruthy();
  });

  it('says so when people joined the position in the meantime', async () => {
    mockApi({
      remove: () =>
        Response.json(
          { code: 'conflict', message: 'Held.', reason: 'job_position_held' },
          { status: 409 }
        ),
    });
    mount();
    const user = userEvent.setup();

    await openRowMenu(user, 'Manager magazin');
    await user.click(await screen.findByTestId('job-position-remove'));
    await user.click(await screen.findByTestId('job-position-remove-confirm'));
    expect((await screen.findByTestId('job-positions-error')).textContent).toContain(
      'mai sunt angajați'
    );
  });

  it('is read-only for an archived client', async () => {
    mockApi({ client: { ...sampleClient, archivedAt: '2026-09-18T10:00:00+00:00' } });
    mount();
    expect(await screen.findAllByTestId('job-position-row')).toHaveLength(2);
    expect(screen.queryByTestId('job-position-add')).toBeNull();
    expect(screen.queryByTestId('job-positions-undecided')).toBeNull();

    await openRowMenu(userEvent.setup(), 'Manager magazin');
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Echipament de protecție',
      'Instrucțiuni',
      'Evaluare de risc',
    ]);
  });

  it('opens the new position dialog when a row asks for a first position', async () => {
    mockApi({ items: [] });
    const runtime = mountApp(
      authFixture(makeSession()).client,
      `/clients/${clientId}/job-positions?focus=add-position`
    );
    expect(await screen.findByTestId('job-position-dialog')).toBeTruthy();
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
  });
});

describe('employeeCountLabel', () => {
  it('counts people the Romanian way', () => {
    expect([0, 1, 2, 19, 20, 101, 120].map(employeeCountLabel)).toEqual([
      'Niciun angajat',
      'Un angajat',
      '2 angajați',
      '19 angajați',
      '20 de angajați',
      '101 angajați',
      '120 de angajați',
    ]);
  });
});
