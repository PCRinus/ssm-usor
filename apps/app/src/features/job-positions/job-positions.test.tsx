import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { openedHere } from '@/app/opener';
import { bodiesOf, installFetchMock, mockApi } from '@/test/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { mountApp } from '@/test/mount';
import { clientId, clientRecord, jobPositionRecord } from '@/test/records';

import { employeeCountLabel } from './job-position-schema';

const sampleClient = clientRecord();

const barista = jobPositionRecord({
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  name: 'Barman preparator',
  workZone: 'Gelaterie',
  activities: 'Prepară și servește înghețată și cafea.',
  employeeCount: 3,
  employeesToTrainCount: 1,
  needsProtectiveEquipment: true,
  equipmentCount: 2,
  fireInstructionCount: 1,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
});

const manager = jobPositionRecord({
  id: '9b2e4c1a-3d5f-4a6b-8c7d-0e9f8a7b6c5d',
  name: 'Manager magazin – birou',
  staffCategory: 'technical_administrative',
  workZone: 'Birou',
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
});

const summaryFor = (
  position: { id: string; name: string },
  globalRiskLevel: number | null,
  factorCount = 5
) => ({
  id: `e${position.id.slice(1)}`,
  clientId,
  kind: 'job_position',
  jobPosition: { id: position.id, name: position.name },
  name: null,
  globalRiskLevel,
  factorCount: globalRiskLevel === null ? 0 : factorCount,
  unacceptableFactorCount: 0,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
});

const listPath = `/clients/${clientId}/job-positions`;
const listPage = `/clienti/${clientId}/posturi`;

type Route = (init: RequestInit | undefined) => Response;

function mockPositionsApi({
  client = sampleClient,
  items = [barista, manager] as unknown[],
  evaluations = [] as unknown[],
  create = ((init) =>
    Response.json(
      { jobPosition: { ...manager, ...JSON.parse(String(init?.body)) } },
      { status: 201 }
    )) as Route,
  update = ((init) =>
    Response.json({ jobPosition: { ...manager, ...JSON.parse(String(init?.body)) } })) as Route,
  remove = (() => new Response(null, { status: 204 })) as Route,
} = {}) {
  mockApi((init, { pathname }) => {
    const method = init?.method ?? 'GET';
    if (pathname === `/clients/${clientId}`) return Response.json({ client });
    if (pathname === listPath) return method === 'POST' ? create(init) : Response.json({ items });
    if (pathname === `/clients/${clientId}/risk-evaluations`) {
      return Response.json({ items: evaluations });
    }
    if (pathname.endsWith('/risk-evaluation')) return Response.json({ evaluation: null });
    if (pathname.endsWith('/equipment')) {
      return Response.json({ items: [], needsProtectiveEquipment: null });
    }
    if (pathname.startsWith(`${listPath}/`))
      return method === 'DELETE' ? remove(init) : update(init);
    if (pathname.endsWith('/instructions')) {
      return Response.json({ items: [] });
    }
  });
}

const mount = () => mountApp(authFixture(makeSession()).client, `/clienti/${clientId}/posturi`);

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  const rows = await screen.findAllByTestId('job-position-row');
  const row = rows.find((item) => item.textContent?.includes(name))!;
  await user.click(within(row).getByTestId('job-position-actions'));
}

installFetchMock();

describe("a client's job positions", () => {
  it('is a section of the client page, listing each position with its facts and people', async () => {
    mockPositionsApi({ items: [barista, { ...manager, trainingIntervalMonths: 12 }] });
    mount();

    const [first, second] = await screen.findAllByTestId('job-position-row');
    expect(within(first!).getByTestId('job-position-open').textContent).toBe('Barman preparator');
    expect(within(first!).getByTestId('job-position-facts').textContent).toBe(
      'Execuție · Gelaterie'
    );
    expect(first!.textContent).not.toContain('Prepară și servește');
    expect(within(second!).getByTestId('job-position-facts').textContent).toBe(
      'Tehnico-administrativ · Birou · instruire la 12 luni'
    );
    expect(within(first!).getByTestId('job-position-employees').textContent).toBe('3 lucrători');
    expect(within(second!).getByTestId('job-position-employees').textContent).toBe(
      'Niciun lucrător'
    );
    expect(within(first!).getByTestId('job-position-equipment').textContent).toBe('2 articole');
    expect(within(second!).getByTestId('job-position-equipment').textContent).toBe('De stabilit');
    expect(screen.getByTestId('job-positions-count').textContent).toBe('2 posturi');
    expect(screen.queryByTestId('pager-summary')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Posturi de lucru' })).toBeNull();

    const sections = screen.getAllByTestId('client-section').map((item) => item.textContent);
    expect(sections.slice(0, 3)).toEqual(['Detalii', 'Lucrători', 'Posturi de lucru']);
    expect(screen.getAllByTestId('page-back')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Înapoi la clienți' })).toBeTruthy();
  });

  it("links a post's workers, and those of them to train, to the workers list", async () => {
    mockPositionsApi();
    mount();

    const [first, second] = await screen.findAllByTestId('job-position-row');
    expect(within(first!).getByTestId('job-position-employees').getAttribute('href')).toBe(
      `/clienti/${clientId}/angajati?jobPosition=${barista.id}`
    );
    const toTrain = within(first!).getByTestId('job-position-to-train');
    expect(toTrain.textContent).toBe('1 de instruit');
    expect(screen.getByRole('link', { name: '1 de instruit pe postul Barman preparator' })).toBe(
      toTrain
    );
    expect(screen.getByRole('link', { name: '3 lucrători pe postul Barman preparator' })).toBe(
      within(first!).getByTestId('job-position-employees')
    );
    expect(toTrain.getAttribute('href')).toBe(
      `/clienti/${clientId}/angajati?jobPosition=${barista.id}&attention=toTrain`
    );
    expect(within(second!).queryByRole('link', { name: 'Niciun lucrător' })).toBeNull();
    expect(within(second!).queryByTestId('job-position-to-train')).toBeNull();
  });

  it('opens a position on a page of its own, whose arrow goes back to the list', async () => {
    mockPositionsApi();
    const runtime = mount();
    const user = userEvent.setup();
    const [row] = await screen.findAllByTestId('job-position-row');
    const listIndex = runtime.router.history.location.state.__TSR_index;
    await user.click(within(row!).getByTestId('job-position-open'));
    await screen.findByTestId('job-position-page');
    expect(runtime.router.state.location.pathname).toBe(`${listPage}/${barista.id}`);
    expect(screen.queryByTestId('client-page')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Barman preparator' })).toBeTruthy();
    expect(screen.getByText('Prepară și servește înghețată și cafea.')).toBeTruthy();
    const back = screen.getByTestId('page-back');
    expect(back.getAttribute('aria-label')).toBe('Înapoi');
    expect(back.getAttribute('href')).toBe(listPage);

    await user.click(back);
    await screen.findAllByTestId('job-position-row');
    expect(runtime.router.state.location.pathname).toBe(listPage);
    expect(runtime.router.history.location.state.__TSR_index).toBe(listIndex);
  });

  it("leaves the client's arrow its own opener after a position", async () => {
    mockPositionsApi();
    const runtime = mount();
    const user = userEvent.setup();
    await screen.findAllByTestId('job-position-row');
    await act(() =>
      runtime.router.navigate({
        to: '/clienti/$clientId/posturi',
        params: { clientId },
        state: openedHere,
      })
    );
    const [row] = await screen.findAllByTestId('job-position-row');
    await user.click(within(row!).getByTestId('job-position-open'));
    await screen.findByTestId('job-position-page');
    await user.click(screen.getByTestId('page-back'));
    await screen.findAllByTestId('job-position-row');

    const clientBack = screen.getByTestId('page-back');
    expect(clientBack.getAttribute('aria-label')).toBe('Înapoi');
    await user.click(clientBack);
    await waitFor(() => expect(runtime.router.history.location.state.__TSR_index).toBe(0));
    expect(runtime.router.state.location.pathname).toBe(listPage);
  });

  it("links each position's equipment and instructions to that section, in words for each state", async () => {
    const cashier = {
      ...barista,
      id: '3f1d2c4b-5a6e-4f7a-8b9c-0d1e2f3a4b5c',
      name: 'Casier',
      needsProtectiveEquipment: false,
      equipmentCount: 0,
      instructionCount: 3,
    };
    const cook = {
      ...barista,
      id: '4a2e3d5c-6b7f-4a8b-9c0d-1e2f3a4b5c6d',
      name: 'Bucătar',
      equipmentCount: 20,
      instructionCount: 1,
    };
    mockPositionsApi({ items: [barista, manager, cashier, cook] });
    mount();

    const rows = await screen.findAllByTestId('job-position-row');
    const states = rows.map((row) => [
      within(row).getByTestId('job-position-equipment').textContent,
      within(row).getByTestId('job-position-instructions').textContent,
    ]);
    expect(states).toEqual([
      ['2 articole', 'De stabilit'],
      ['20 de articole', '1 instrucțiune'],
      ['Nu necesită', '3 instrucțiuni'],
      ['De stabilit', 'De stabilit'],
    ]);
    const [first] = rows;
    expect(within(first!).getByTestId('job-position-equipment').getAttribute('href')).toBe(
      `${listPage}/${barista.id}#protective-equipment`
    );
    expect(within(first!).getByTestId('job-position-instructions').getAttribute('href')).toBe(
      `${listPage}/${barista.id}#instructions`
    );
  });

  it('opens the section a state link names, not only the top of the page', async () => {
    mockPositionsApi();
    const runtime = mount();
    const user = userEvent.setup();
    const [row] = await screen.findAllByTestId('job-position-row');
    await user.click(within(row!).getByTestId('job-position-equipment'));
    await screen.findByTestId('job-position-page');
    expect(runtime.router.state.location.pathname).toBe(`${listPage}/${barista.id}`);
    expect(runtime.router.state.location.hash).toBe('protective-equipment');
  });

  it("offers the position's equipment and instructions first in the row menu", async () => {
    mockPositionsApi();
    const runtime = mount();
    const user = userEvent.setup();

    await openRowMenu(user, 'Manager magazin');
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Echipament de protecție',
      'Instrucțiuni SSM',
      'Instrucțiuni SU',
      'Fișa de evaluare a riscurilor',
      'Modifică',
      'Șterge',
    ]);
    await user.click(screen.getByTestId('job-position-menu-fire-instructions'));
    await screen.findByTestId('job-position-page');
    expect(runtime.router.state.location.pathname).toBe(`${listPage}/${manager.id}`);
    expect(runtime.router.state.location.hash).toBe('fire-instructions');
  });

  it('counts the posts with a decision still to take, the sheet included', async () => {
    const done = {
      ...barista,
      id: '3f1d2c4b-5a6e-4f7a-8b9c-0d1e2f3a4b5c',
      name: 'Casier',
      instructionCount: 2,
    };
    mockPositionsApi({
      items: [barista, manager, done],
      evaluations: [summaryFor(barista, 2.1), summaryFor(manager, 2.2), summaryFor(done, 4.2)],
    });
    mount();
    await screen.findAllByTestId('job-position-row');
    await waitFor(() =>
      expect(screen.getByTestId('job-positions-undecided').textContent).toBe(
        'De stabilit: 2 posturi'
      )
    );
  });

  it('asks for nothing once every position has decided', async () => {
    mockPositionsApi({
      items: [{ ...barista, instructionCount: 2 }],
      evaluations: [summaryFor(barista, 2)],
    });
    mount();
    await waitFor(() =>
      expect(screen.getAllByTestId('job-position-risk')[0]!.textContent).toBe('Nivel global 2,00')
    );
    expect(screen.queryByTestId('job-positions-undecided')).toBeNull();
  });

  it('shows the sheet by its global level, amber over the acceptable limit', async () => {
    mockPositionsApi({ evaluations: [summaryFor(barista, 3.919, 14)] });
    mount();
    const [first, second] = await screen.findAllByTestId('job-position-row');
    await waitFor(() =>
      expect(within(first!).getByTestId('job-position-risk').textContent).toBe('Nivel global 3,92')
    );
    expect(within(first!).getByTestId('job-position-factors').textContent).toBe('14 factori');
    expect(within(first!).getByTestId('job-position-risk').className).toContain('bg-warning');
    expect(within(second!).getByTestId('job-position-risk').textContent).toBe('Neevaluat');
    expect(within(second!).queryByTestId('job-position-factors')).toBeNull();
  });

  it('opens with no toolbar and its own add button when there are no posts', async () => {
    mockPositionsApi({ items: [] });
    mount();
    expect((await screen.findByTestId('job-positions-empty')).textContent).toMatch(
      /fiecare funcție nouă devine un post/i
    );
    expect(screen.queryByTestId('job-positions-filters')).toBeNull();
    expect(screen.queryByTestId('job-positions-count')).toBeNull();
    expect(screen.getAllByTestId('job-position-add')).toHaveLength(1);
  });

  it('adds a position, in the execution category unless told otherwise', async () => {
    mockPositionsApi();
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('job-position-add'));
    expect(screen.getByTestId<HTMLSelectElement>('job-position-category').value).toBe('execution');
    await user.click(screen.getByTestId('job-position-save'));
    expect(await screen.findByText(/Introdu denumirea postului/)).toBeTruthy();

    await user.type(screen.getByTestId('job-position-name'), '  Lucrător comercial ');
    await user.type(screen.getByTestId('job-position-zone'), 'Gelaterie');
    await user.click(screen.getByTestId('job-position-save'));

    await waitFor(() => expect(bodiesOf(listPath, 'POST')).toHaveLength(1));
    expect(bodiesOf(listPath, 'POST')[0]).toEqual({
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
    mockPositionsApi({
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

  it('says the client is archived when a stale page adds a position to it', async () => {
    mockPositionsApi({
      create: () =>
        Response.json(
          { code: 'conflict', message: 'Archived.', reason: 'client_archived' },
          { status: 409 }
        ),
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('job-position-add'));
    await user.type(screen.getByTestId('job-position-name'), 'Barman preparator');
    await user.click(screen.getByTestId('job-position-save'));

    expect((await screen.findByTestId('job-position-error')).textContent).toContain('arhivat');
    expect(screen.getByTestId('job-position-dialog')).toBeTruthy();
  });

  it('edits a position and says that contract titles stay as they are', async () => {
    mockPositionsApi();
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

    await waitFor(() => expect(bodiesOf(`${listPath}/${manager.id}`, 'PUT')).toHaveLength(1));
    expect(bodiesOf(`${listPath}/${manager.id}`, 'PUT')[0]).toEqual({
      name: 'Manager magazin',
      staffCategory: 'technical_administrative',
      workZone: 'Birou',
      activities: 'Conduce magazinul.',
      trainingIntervalMonths: null,
    });
  });

  it('gives a post an interval of its own, within what its category allows', async () => {
    mockPositionsApi();
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
      '5',
      '6',
    ]);
    await user.selectOptions(
      screen.getByTestId('job-position-category'),
      'technical_administrative'
    );
    expect([...interval.options].map((option) => option.value)).toEqual([
      '',
      '1',
      '2',
      '3',
      '4',
      '6',
      '12',
    ]);
    await user.selectOptions(interval, '12');
    // A year is not an interval for execution staff: going back drops it with its option.
    await user.selectOptions(screen.getByTestId('job-position-category'), 'execution');
    expect(interval.value).toBe('');

    await user.selectOptions(interval, '2');
    await user.click(screen.getByTestId('job-position-save'));
    await waitFor(() => expect(bodiesOf(listPath, 'POST')).toHaveLength(1));
    expect(bodiesOf(listPath, 'POST')[0]).toMatchObject({ trainingIntervalMonths: 2 });
  });

  it('removes an empty position, and will not offer it for one people are in', async () => {
    mockPositionsApi();
    mount();
    const user = userEvent.setup();

    await openRowMenu(user, 'Barman preparator');
    await user.click(await screen.findByTestId('job-position-remove'));
    const held = await screen.findByTestId('job-position-remove-dialog');
    expect(held.textContent).toContain('3 lucrători');
    expect(screen.getByTestId<HTMLButtonElement>('job-position-remove-confirm').disabled).toBe(
      true
    );
    await user.click(within(held).getByRole('button', { name: 'Renunță' }));

    await openRowMenu(user, 'Manager magazin');
    await user.click(await screen.findByTestId('job-position-remove'));
    await user.click(await screen.findByTestId('job-position-remove-confirm'));
    await waitFor(() => expect(bodiesOf(`${listPath}/${manager.id}`, 'DELETE')).toHaveLength(1));
    expect(await screen.findByText(/a fost șters\./)).toBeTruthy();
  });

  it('says so when people joined the position in the meantime', async () => {
    mockPositionsApi({
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
      'mai sunt lucrători'
    );
  });

  it('is read-only for an archived client, every badge grey, and still filters', async () => {
    mockPositionsApi({ client: { ...sampleClient, archivedAt: '2026-09-18T10:00:00+00:00' } });
    const runtime = mount();
    const user = userEvent.setup();
    expect(await screen.findAllByTestId('job-position-row')).toHaveLength(2);
    expect(screen.queryByTestId('job-position-add')).toBeNull();
    expect(screen.queryByTestId('job-positions-undecided')).toBeNull();
    expect(screen.queryByTestId('job-position-to-train')).toBeNull();
    await waitFor(() => expect(screen.getAllByTestId('job-position-risk')).toHaveLength(2));
    await screen.findByTestId('sensitive-groups-state');
    expect(screen.getByTestId('job-positions-page').querySelector('.bg-warning')).toBeNull();

    await user.click(screen.getByTestId('job-positions-filters'));
    await user.click(await screen.findByRole('checkbox', { name: 'Personal de execuție' }));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ staffCategory: 'execution' })
    );

    await openRowMenu(user, 'Barman preparator');
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Echipament de protecție',
      'Instrucțiuni SSM',
      'Instrucțiuni SU',
      'Fișa de evaluare a riscurilor',
    ]);
  });

  it('sorts by the global level, highest first on the first click, kept in the address', async () => {
    const cashier = { ...manager, id: '3f1d2c4b-5a6e-4f7a-8b9c-0d1e2f3a4b5c', name: 'Casier' };
    mockPositionsApi({
      items: [barista, manager, cashier],
      evaluations: [summaryFor(barista, 2.1), summaryFor(cashier, 3.6)],
    });
    const runtime = mount();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByTestId('job-position-factors')).toHaveLength(2));

    await user.click(screen.getByTestId('sort-risk'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ sort: 'risk', order: 'desc' })
    );
    const names = () => screen.getAllByTestId('job-position-open').map((link) => link.textContent);
    expect(names()).toEqual(['Casier', 'Barman preparator', 'Manager magazin – birou']);

    await user.click(screen.getByTestId('sort-risk'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ sort: 'risk' }));
    expect(names()).toEqual(['Barman preparator', 'Casier', 'Manager magazin – birou']);

    await user.click(screen.getByTestId('sort-employees'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ sort: 'employees', order: 'desc' })
    );
    expect(names()[0]).toBe('Barman preparator');
  });

  it('filters by staff category from the address, and clears only the filter', async () => {
    mockPositionsApi();
    const runtime = mountApp(
      authFixture(makeSession()).client,
      `${listPage}?staffCategory=technical_administrative&sort=employees&order=desc`
    );
    const user = userEvent.setup();
    const rows = await screen.findAllByTestId('job-position-row');
    expect(rows.map((row) => within(row).getByTestId('job-position-open').textContent)).toEqual([
      'Manager magazin – birou',
    ]);
    expect(screen.getByTestId('job-positions-count').textContent).toBe('1 din 2 posturi');
    expect(screen.getByTestId('job-positions-applied-filters').textContent).toContain(
      'Tehnico-administrativ'
    );

    await act(() =>
      runtime.router.navigate({
        to: '/clienti/$clientId/posturi',
        params: { clientId },
        search: { staffCategory: ['technical_administrative'] },
      })
    );
    mockPositionsApi({ items: [barista] });
    await act(() => runtime.queryClient.invalidateQueries());
    expect(await screen.findByTestId('job-positions-empty-filtered')).toBeTruthy();
    expect(screen.getByTestId('job-positions-count').textContent).toBe('0 din 1 post');

    await user.click(screen.getByTestId('job-positions-empty-filtered-clear'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
    expect(await screen.findAllByTestId('job-position-row')).toHaveLength(1);
  });

  it('opens the new position dialog from the toolbar when asked to add one', async () => {
    mockPositionsApi();
    const runtime = mountApp(authFixture(makeSession()).client, `${listPage}?focus=add-position`);
    expect(await screen.findByTestId('job-position-dialog')).toBeTruthy();
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
  });

  it('opens its one filter group at once in the phone sheet', async () => {
    const media = window.matchMedia;
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ ...media(query), matches: query === '(max-width: 767px)' }))
    );
    mockPositionsApi();
    const runtime = mount();
    const user = userEvent.setup();
    await screen.findAllByTestId('job-position-row');
    await user.click(screen.getByTestId('job-positions-filters'));
    const sheet = await screen.findByTestId('job-positions-filters-sheet');
    expect(
      within(sheet)
        .getByTestId('job-positions-filters-group-staffCategory')
        .getAttribute('aria-expanded')
    ).toBe('true');
    await user.click(within(sheet).getByRole('checkbox', { name: 'Personal de execuție' }));
    await user.click(within(sheet).getByTestId('job-positions-filters-apply'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ staffCategory: 'execution' })
    );
  });

  it('opens the new position dialog when a row asks for a first position', async () => {
    mockPositionsApi({ items: [] });
    const runtime = mountApp(
      authFixture(makeSession()).client,
      `/clienti/${clientId}/posturi?focus=add-position`
    );
    expect(await screen.findByTestId('job-position-dialog')).toBeTruthy();
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
  });
});

describe('employeeCountLabel', () => {
  it('counts people the Romanian way', () => {
    expect([0, 1, 2, 19, 20, 101, 120].map(employeeCountLabel)).toEqual([
      'Niciun lucrător',
      'Un lucrător',
      '2 lucrători',
      '19 lucrători',
      '20 de lucrători',
      '101 lucrători',
      '120 de lucrători',
    ]);
  });
});
