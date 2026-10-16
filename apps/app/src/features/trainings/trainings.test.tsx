import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { todayIso } from '@/features/employees/employee-format';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';
import { trainingStatus, untrained } from '@/test/training-fixture';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const welderId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const clerkId = '6e1a2b3c-4d5e-4f6a-8b7c-9d0e1f2a3b4c';
const themesRevisionId = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const trainingId = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

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

const position = (id: string, name: string) => ({
  id,
  clientId,
  name,
  staffCategory: 'execution',
  workZone: null,
  activities: null,
  trainingIntervalMonths: null,
  employeeCount: 2,
  needsProtectiveEquipment: null,
  equipmentCount: 0,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
});

const employee = (
  id: string,
  lastName: string,
  firstName: string,
  jobPosition = { id: welderId, name: 'Sudor' },
  training: unknown = untrained
) => ({
  id,
  clientId,
  lastName,
  firstName,
  employeeNumber: null,
  email: null,
  phone: null,
  jobTitle: jobPosition.name,
  jobPosition,
  hiredAt: '2020-03-01',
  status: 'active',
  terminatedAt: null,
  workplace: null,
  training,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
});

const popescu = employee('7c9e6679-7425-40de-944b-e07fc1f90ae7', 'Popescu', 'Ion', undefined, {
  ssm: trainingStatus('current', '2027-03-01', '2026-09-01'),
  psi: trainingStatus('untrained'),
});
const taranu = employee('8d0f7780-8536-41ef-a55c-f18fd2fa1bf8', 'Țăranu', 'Ștefan');
const ionescu = employee('9e1a8891-9647-42f0-b66c-a29ae3b2c0d9', 'Ionescu', 'Ana', {
  id: clerkId,
  name: 'Contabil',
});

const employeeDetail = {
  ...popescu,
  cnp: null,
  birthDate: null,
  birthPlace: null,
  homeAddress: null,
  bloodGroup: null,
  rhFactor: null,
  notes: null,
  archivedAt: null,
  qualification: null,
  education: null,
  authorizations: null,
  commuteRoute: null,
  commuteMinutes: null,
};

const longMaterial =
  'IPSSM art. 1–40, partea comună: organizarea activității, echipamentul individual de protecție, circulația în incintă; capitolul postului: sudarea în atmosferă protejată, art. 120–135.';

const training = (overrides: Record<string, unknown> = {}) => ({
  id: trainingId,
  clientId,
  domain: 'ssm',
  phase: 'periodic',
  heldOn: '2026-09-01',
  durationMinutes: 120,
  material: longMaterial,
  trainer: { name: 'Maria Pop', jobTitle: 'Șef atelier' },
  verifier: { name: 'Dan Marin', jobTitle: 'Inspector SSM' },
  supplementaryReason: null,
  source: 'app',
  themesRevisionId: null,
  notes: null,
  createdAt: '2026-09-01T10:00:00+00:00',
  updatedAt: '2026-09-01T10:00:00+00:00',
  ...overrides,
});

const workplaceRecord = {
  id: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
  occupation: 'Sudor',
  admission: { admittedOn: '2020-03-02', name: 'Maria Pop', jobTitle: 'Șef atelier' },
  training: training({
    id: '3e4f5a6b-7c8d-4e9f-8a0b-1c2d3e4f5a6b',
    phase: 'workplace',
    heldOn: '2020-03-02',
    durationMinutes: 240,
    material: 'H.G. 1051/2006; I.P.S.S.M. Art. 1 – 290',
    source: 'paper',
  }),
};

const periodicRecord = {
  id: '4f5a6b7c-8d9e-4f0a-9b1c-2d3e4f5a6b7c',
  occupation: 'Sudor',
  admission: null,
  training: training(),
};

const detailOf = (attendees: { id: string; lastName: string; firstName: string }[]) => ({
  training: {
    ...training(),
    records: attendees.map((person, index) => ({
      id: `5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c${String(index).padStart(2, '0')}`,
      employee: { id: person.id, lastName: person.lastName, firstName: person.firstName },
      occupation: 'Sudor',
      admission: null,
    })),
  },
});

const proposal = (overrides: Record<string, unknown> = {}) => ({
  durationMinutes: 120,
  material: 'IPSSM art. 1–40; art. 120–135',
  trainer: { name: 'Maria Pop', jobTitle: 'Șef atelier' },
  verifier: { name: 'Dan Marin', jobTitle: null },
  admittedBy: null,
  themesRevisionId,
  ...overrides,
});

const page = (items: unknown[]) => ({ items, page: 1, pageSize: 25, total: items.length });

type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

const fetchMock = vi.fn<typeof fetch>();

const employeesPath = `/clients/${clientId}/employees`;
const employeePath = `${employeesPath}/${popescu.id}`;
const trainingsPath = `/clients/${clientId}/trainings`;

function mockApi(routes: Partial<Record<string, Handler>> = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const key = `${method} ${url.pathname}`;
    const route = routes[key];
    if (route) return route(url, init);
    switch (key) {
      case 'GET /me':
        return Response.json({ user: { id: 'user-one', email: 'review@example.test' } });
      case `GET /clients/${clientId}`:
        return Response.json({ client: sampleClient });
      case `GET ${employeesPath}`:
        return Response.json(page([popescu, taranu, ionescu]));
      case `GET ${employeePath}`:
        return Response.json({ employee: employeeDetail });
      case `GET ${employeePath}/training-records`:
        return Response.json({ items: [] });
      case `GET ${employeePath}/training-sheets`:
        return Response.json({
          ssm: { ready: true, missing: [] },
          psi: { ready: true, missing: [] },
        });
      case `GET /clients/${clientId}/job-positions`:
        return Response.json({
          items: [position(welderId, 'Sudor'), position(clerkId, 'Contabil')],
        });
      case `GET ${trainingsPath}`:
        return Response.json({ items: [] });
      case `GET ${trainingsPath}/proposal`:
        return Response.json(proposal());
      case `POST ${trainingsPath}`:
        return Response.json(detailOf([popescu]), { status: 201 });
      case `GET /clients/${clientId}/files`:
        return Response.json({ items: [] });
      default:
        throw new Error(`Unexpected request: ${key}${url.search}`);
    }
  });
}

const requests = (method: string, pathname: string) =>
  fetchMock.mock.calls
    .filter(
      ([input, init]) =>
        (init?.method ?? 'GET') === method && new URL(String(input)).pathname === pathname
    )
    .map(([input, init]) => ({
      url: new URL(String(input)),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe("an employee's training tabs", () => {
  it('splits the page into Date, Instruire SSM and Instruire PSI, in the tabs and the sidebar', async () => {
    mockApi();
    const runtime = mountApp(authFixture(makeSession()).client, employeePath);
    const user = userEvent.setup();
    await screen.findByTestId('employee-page');
    expect(screen.getByRole('heading', { level: 1, name: 'Popescu Ion' })).toBeTruthy();
    expect(screen.getByTestId('employee-header-client').textContent).toBe('OMV PETROM SA');
    const tabs = screen.getAllByTestId('employee-section');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Date', 'Instruire SSM', 'Instruire PSI']);
    expect(tabs[0]!.getAttribute('aria-current')).toBe('page');
    const group = screen.getByTestId('nav-employee-group');
    expect(
      within(group)
        .getAllByTestId('nav-sub-entry')
        .map((entry) => entry.textContent)
    ).toEqual(['Date', 'Instruire SSM', 'Instruire PSI']);

    await user.click(tabs[1]!);
    await screen.findByTestId('employee-training-tab');
    expect(runtime.router.state.location.pathname).toBe(`${employeePath}/training/ssm`);
    expect(screen.queryByTestId('employee-page')).toBeNull();
    expect(screen.getAllByTestId('employee-section')[1]!.getAttribute('aria-current')).toBe('page');
    const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' });
    expect(within(breadcrumb).getByText('Instruire SSM')).toBeTruthy();
  });

  it('shows the state, the due date and the records newest first, each with its facts', async () => {
    mockApi({
      [`GET ${employeePath}/training-records`]: () =>
        Response.json({ items: [periodicRecord, workplaceRecord] }),
    });
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/ssm`);
    const user = userEvent.setup();
    const items = await screen.findAllByTestId('training-record-item');
    expect(
      requests('GET', `${employeePath}/training-records`)[0]!.url.searchParams.get('domain')
    ).toBe('ssm');
    expect(screen.getByTestId('training-state').textContent).toBe('La zi');
    expect(screen.getByTestId('training-due-on').textContent).toBe('1 mar. 2027');
    expect(screen.getByTestId('training-last-periodic').textContent).toBe('1 sept. 2026');
    expect(
      within(screen.getByTestId('training-tab-actions')).getByTestId('training-sheet-ssm')
    ).toBeTruthy();

    expect(items.map((item) => item.dataset.phase)).toEqual(['periodic', 'workplace']);
    const periodic = within(items[0]!);
    expect(periodic.getByText('Periodică')).toBeTruthy();
    expect(periodic.getByTestId('training-record-duration').textContent).toBe('120 min (2 h)');
    expect(periodic.getByText('Maria Pop, Șef atelier')).toBeTruthy();
    expect(periodic.getByText('Dan Marin, Inspector SSM')).toBeTruthy();
    expect(periodic.queryByTestId('training-record-paper')).toBeNull();
    const toggle = periodic.getByTestId('training-material-toggle');
    expect(periodic.getByTestId('training-material-text').className).toContain('line-clamp-2');
    await user.click(toggle);
    expect(periodic.getByTestId('training-material-text').className).not.toContain('line-clamp-2');
    expect(toggle.textContent).toBe('mai puțin');

    const workplace = within(items[1]!);
    expect(workplace.getByTestId('training-record-paper')).toBeTruthy();
    expect(workplace.getByTestId('training-record-duration').textContent).toBe('240 min (4 h)');
    expect(workplace.getByTestId('training-record-admission').textContent).toBe(
      'Admis la lucru de Maria Pop, Șef atelier la 2 mar. 2020'
    );
    expect(workplace.queryByTestId('training-material-toggle')).toBeNull();
  });

  it('offers to record the first training when there is none', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/psi`);
    const empty = await screen.findByTestId('training-records-empty');
    expect(empty.textContent).toContain('Nicio instruire înregistrată încă');
    expect(screen.getByTestId('training-state').textContent).toBe('Neinstruit');
    expect(within(empty).getByTestId('training-record')).toBeTruthy();
  });

  it('records a training for this employee alone, filled from the proposal', async () => {
    mockApi({
      [`GET ${employeePath}/training-records`]: () => Response.json({ items: [workplaceRecord] }),
    });
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/ssm`);
    const user = userEvent.setup();
    await screen.findAllByTestId('training-record-item');
    await user.click(screen.getAllByTestId('training-record')[0]!);
    const dialog = await screen.findByTestId('training-dialog');
    expect((within(dialog).getByTestId('training-phase') as HTMLSelectElement).value).toBe(
      'introductory_general'
    );
    expect(within(dialog).getByTestId('training-fixed-attendee').textContent).toBe('Popescu Ion');
    await user.selectOptions(within(dialog).getByTestId('training-phase'), 'periodic');
    await waitFor(() =>
      expect((within(dialog).getByTestId('training-material') as HTMLTextAreaElement).value).toBe(
        'IPSSM art. 1–40; art. 120–135'
      )
    );
    const proposals = requests('GET', `${trainingsPath}/proposal`);
    const asked = proposals.at(-1)!.url.searchParams;
    expect(asked.get('phase')).toBe('periodic');
    expect(asked.get('jobPositionId')).toBe(welderId);
    expect(asked.get('heldOn')).toBe(todayIso());
    expect((within(dialog).getByTestId('training-duration') as HTMLInputElement).value).toBe('120');
    await user.type(within(dialog).getByTestId('training-verifier-job-title'), 'Inspector SSM');
    await user.selectOptions(within(dialog).getByTestId('training-source'), 'paper');
    await user.click(within(dialog).getByTestId('training-save'));

    expect(await screen.findByText('Instruirea a fost înregistrată.')).toBeTruthy();
    const [created] = requests('POST', trainingsPath);
    expect(created!.body).toEqual({
      domain: 'ssm',
      phase: 'periodic',
      heldOn: todayIso(),
      durationMinutes: 120,
      material: 'IPSSM art. 1–40; art. 120–135',
      trainer: { name: 'Maria Pop', jobTitle: 'Șef atelier' },
      verifier: { name: 'Dan Marin', jobTitle: 'Inspector SSM' },
      supplementaryReason: null,
      source: 'paper',
      themesRevisionId,
      notes: null,
      employeeIds: [popescu.id],
      admission: null,
    });
    await waitFor(() =>
      expect(requests('GET', `${employeePath}/training-records`).length).toBeGreaterThan(1)
    );
    expect(requests('GET', employeePath).length).toBeGreaterThan(1);
  });

  it('keeps what the person typed when a later proposal arrives, and asks for the material the themes lack', async () => {
    mockApi({
      [`GET ${trainingsPath}/proposal`]: (url) =>
        Response.json(
          url.searchParams.get('phase') === 'supplementary'
            ? proposal({ durationMinutes: 60, material: null, themesRevisionId: null })
            : proposal()
        ),
    });
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/ssm`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('training-record'));
    const dialog = await screen.findByTestId('training-dialog');
    await user.selectOptions(within(dialog).getByTestId('training-phase'), 'periodic');
    const duration = within(dialog).getByTestId('training-duration') as HTMLInputElement;
    await waitFor(() => expect(duration.value).toBe('120'));
    await user.clear(within(dialog).getByTestId('training-trainer-name'));
    await user.type(within(dialog).getByTestId('training-trainer-name'), 'Vasile Ene');

    await user.selectOptions(within(dialog).getByTestId('training-phase'), 'supplementary');
    await waitFor(() => expect(duration.value).toBe('60'));
    expect((within(dialog).getByTestId('training-trainer-name') as HTMLInputElement).value).toBe(
      'Vasile Ene'
    );
    expect(within(dialog).getByTestId('training-no-themes').textContent).toBe(
      'Tematica de instruire nu este încă generată; completează materialul.'
    );
    expect((within(dialog).getByTestId('training-material') as HTMLTextAreaElement).value).toBe('');

    await user.click(within(dialog).getByTestId('training-save'));
    expect(await within(dialog).findByText('Alege motivul instruirii suplimentare.')).toBeTruthy();
    expect(within(dialog).getByText('Completează materialul predat.')).toBeTruthy();
    expect(requests('POST', trainingsPath)).toHaveLength(0);
  });

  it('edits a training shared with others for everyone, saying so', async () => {
    mockApi({
      [`GET ${employeePath}/training-records`]: () => Response.json({ items: [periodicRecord] }),
      [`GET ${trainingsPath}/${trainingId}`]: () => Response.json(detailOf([popescu, taranu])),
      [`PUT ${trainingsPath}/${trainingId}`]: () => Response.json(detailOf([popescu, taranu])),
    });
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/ssm`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('training-record-edit'));
    const dialog = await screen.findByTestId('training-dialog');
    expect((await within(dialog).findByTestId('training-shared-notice')).textContent).toBe(
      'Această instruire are 2 participanți; modificarea îi privește pe toți.'
    );
    expect(within(dialog).queryByTestId('training-fixed-attendee')).toBeNull();
    const attendees = within(dialog).getAllByTestId('training-attendee');
    expect(attendees).toHaveLength(2);
    expect(attendees.every((box) => box.getAttribute('aria-checked') === 'true')).toBe(true);
    expect((within(dialog).getByTestId('training-position') as HTMLSelectElement).value).toBe(
      welderId
    );
    const duration = within(dialog).getByTestId('training-duration');
    await user.clear(duration);
    await user.type(duration, '90');
    await user.click(within(dialog).getByTestId('training-save'));

    expect(await screen.findByText('Instruirea a fost modificată.')).toBeTruthy();
    const [saved] = requests('PUT', `${trainingsPath}/${trainingId}`);
    expect(saved!.body).toMatchObject({
      durationMinutes: 90,
      material: longMaterial,
      employeeIds: [popescu.id, taranu.id],
    });
    expect(requests('GET', `${trainingsPath}/proposal`)).toHaveLength(0);
  });
});

describe("a client's trainings held", () => {
  it('is the second view of the employees section, filtered by domain and phase in the URL', async () => {
    const held = { ...training(), attendeeCount: 2 };
    mockApi({
      [`GET ${trainingsPath}`]: (url) =>
        Response.json({ items: url.searchParams.get('phase') === 'workplace' ? [] : [held] }),
    });
    const runtime = mountApp(authFixture(makeSession()).client, employeesPath);
    const user = userEvent.setup();
    const views = await screen.findAllByTestId('employees-view');
    expect(views.map((view) => view.textContent)).toEqual(['Angajați', 'Instruiri']);
    await user.click(views[1]!);
    const rows = await screen.findAllByTestId('trainings-row');
    expect(runtime.router.state.location.pathname).toBe(`${employeesPath}/trainings`);
    expect(within(rows[0]!).getByText('Periodică')).toBeTruthy();
    expect(within(rows[0]!).getByTestId('trainings-attendees').textContent).toBe('2 participanți');
    expect(within(rows[0]!).getByText('120 min (2 h)')).toBeTruthy();

    const historyLength = runtime.router.history.length;
    await user.click(
      screen
        .getAllByTestId('trainings-filter-domain')
        .find((link) => link.dataset.domain === 'psi')!
    );
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ domain: 'psi' }));
    await user.selectOptions(screen.getByTestId('trainings-filter-phase'), 'workplace');
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ domain: 'psi', phase: 'workplace' })
    );
    expect(runtime.router.history.length).toBe(historyLength);
    expect((await screen.findByTestId('trainings-empty')).textContent).toContain(
      'Nicio instruire de tipul „La locul de muncă” în domeniul PSI înregistrată încă.'
    );
    const asked = requests('GET', trainingsPath).at(-1)!.url.searchParams;
    expect(asked.get('domain')).toBe('psi');
    expect(asked.get('phase')).toBe('workplace');
  });

  it('records a periodic training for everyone in a post, from the checklist', async () => {
    mockApi({
      [`POST ${trainingsPath}`]: () => Response.json(detailOf([popescu, taranu]), { status: 201 }),
    });
    mountApp(authFixture(makeSession()).client, `${employeesPath}/trainings`);
    const user = userEvent.setup();
    await screen.findByTestId('trainings-empty');
    await user.click(screen.getByTestId('trainings-record'));
    const dialog = await screen.findByTestId('training-dialog');
    await user.click(within(dialog).getByTestId('training-save'));
    expect(
      await within(dialog).findByText(
        'Alege postul: de el depind participanții și materialul propus.'
      )
    ).toBeTruthy();

    await user.selectOptions(within(dialog).getByTestId('training-position'), welderId);
    const attendees = await within(dialog).findAllByTestId('training-attendee');
    expect(attendees.map((box) => box.closest('li')!.textContent)).toEqual([
      'Popescu Ion',
      'Țăranu Ștefan',
    ]);
    expect(attendees.every((box) => box.getAttribute('aria-checked') === 'true')).toBe(true);
    await user.click(within(dialog).getByTestId('training-attendees-none'));
    expect(within(dialog).getByTestId('training-attendees-count').textContent).toBe(
      '0 participanți aleși din 2'
    );
    await user.type(within(dialog).getByTestId('training-attendees-search'), 'stefan');
    expect(within(dialog).getAllByTestId('training-attendee')).toHaveLength(1);
    await user.clear(within(dialog).getByTestId('training-attendees-search'));
    await user.click(within(dialog).getByTestId('training-attendees-all'));
    await waitFor(() =>
      expect(
        (within(dialog).getByTestId('training-material') as HTMLTextAreaElement).value
      ).not.toBe('')
    );
    await user.type(within(dialog).getByTestId('training-verifier-job-title'), 'Inspector SSM');
    await user.click(within(dialog).getByTestId('training-save'));

    expect(await screen.findByText('Instruirea a fost înregistrată.')).toBeTruthy();
    expect(requests('POST', trainingsPath)[0]!.body.employeeIds).toEqual([popescu.id, taranu.id]);
  });

  it('lists every current employee for an introductory training, and puts an API issue on its field', async () => {
    mockApi({
      [`POST ${trainingsPath}`]: () =>
        Response.json(
          {
            error: 'validation_error',
            message: 'Invalid',
            issues: [{ path: 'trainer.jobTitle', message: 'Funcția este prea lungă.' }],
          },
          { status: 400 }
        ),
    });
    mountApp(authFixture(makeSession()).client, `${employeesPath}/trainings`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('trainings-record'));
    const dialog = await screen.findByTestId('training-dialog');
    await user.selectOptions(within(dialog).getByTestId('training-phase'), 'introductory_general');
    const attendees = await within(dialog).findAllByTestId('training-attendee');
    expect(attendees).toHaveLength(3);
    expect(attendees.some((box) => box.getAttribute('aria-checked') === 'true')).toBe(false);
    expect(attendees.map((box) => box.closest('li')!.textContent)).toContain('Ionescu AnaContabil');
    await user.click(attendees[0]!);
    await waitFor(() =>
      expect((within(dialog).getByTestId('training-duration') as HTMLInputElement).value).toBe(
        '120'
      )
    );
    await user.type(within(dialog).getByTestId('training-verifier-job-title'), 'Inspector SSM');
    await user.click(within(dialog).getByTestId('training-save'));
    expect(await within(dialog).findByText('Funcția este prea lungă.')).toBeTruthy();
    expect(screen.getByTestId('training-dialog')).toBeTruthy();
  });

  it('deletes a training held after asking, naming everyone it concerns', async () => {
    const held = { ...training(), attendeeCount: 2 };
    let deleted = false;
    mockApi({
      [`GET ${trainingsPath}`]: () => Response.json({ items: deleted ? [] : [held] }),
      [`DELETE ${trainingsPath}/${trainingId}`]: () => {
        deleted = true;
        return new Response(null, { status: 204 });
      },
    });
    mountApp(authFixture(makeSession()).client, `${employeesPath}/trainings`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('trainings-row-menu'));
    await user.click(await screen.findByTestId('trainings-delete'));
    const dialog = await screen.findByTestId('training-delete-dialog');
    expect(within(dialog).getByTestId('training-delete-count').textContent).toBe(
      'Are 2 participanți; ștergerea îi privește pe toți.'
    );
    await user.click(within(dialog).getByTestId('training-delete-confirm'));
    expect(await screen.findByText('Instruirea a fost ștearsă.')).toBeTruthy();
    expect(await screen.findByTestId('trainings-empty')).toBeTruthy();
  });
});

describe('training state in the employee lists', () => {
  const overdue = employee(taranu.id, 'Țăranu', 'Ștefan', undefined, {
    ssm: trainingStatus('overdue', '2026-06-01', '2025-12-01'),
    psi: trainingStatus('due', '2026-10-30'),
  });

  it("colours each domain by its state on the client's list and filters by state", async () => {
    mockApi({ [`GET ${employeesPath}`]: () => Response.json(page([popescu, overdue])) });
    const runtime = mountApp(authFixture(makeSession()).client, `${employeesPath}?page=2`);
    const user = userEvent.setup();
    const rows = await screen.findAllByTestId('employees-row');
    const first = within(rows[0]!);
    expect(first.getByTestId('training-status-ssm').dataset.state).toBe('current');
    expect(first.getByTestId('training-status-psi').dataset.state).toBe('untrained');
    const second = within(rows[1]!);
    expect(second.getByTestId('training-status-ssm').dataset.state).toBe('overdue');
    expect(second.getByTestId('training-status-psi').getAttribute('title')).toBe(
      'PSI: scadentă, termen 30 oct. 2026'
    );
    expect(second.getByText('SSM: depășită, termen 1 iun. 2026')).toBeTruthy();

    const historyLength = runtime.router.history.length;
    await user.click(screen.getByTestId('employees-training-filter-overdue'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ trainingState: 'overdue' })
    );
    expect(runtime.router.history.length).toBe(historyLength);
    expect(
      screen.getByTestId('employees-training-filter-overdue').getAttribute('aria-pressed')
    ).toBe('true');
    await waitFor(() =>
      expect(requests('GET', employeesPath).at(-1)!.url.searchParams.get('trainingState')).toBe(
        'overdue'
      )
    );
    await user.click(screen.getByTestId('employees-training-filter-all'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
  });

  it('says when no one is in the state asked for, and shows everyone again', async () => {
    mockApi({
      [`GET ${employeesPath}`]: (url) =>
        Response.json(page(url.searchParams.get('trainingState') ? [] : [popescu])),
    });
    const runtime = mountApp(
      authFixture(makeSession()).client,
      `${employeesPath}?trainingState=overdue`
    );
    const user = userEvent.setup();
    expect(await screen.findByText('Niciun angajat în această stare a instruirii')).toBeTruthy();
    await user.click(screen.getByTestId('employees-empty-clear-training-state'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
    expect(await screen.findAllByTestId('employees-row')).toHaveLength(1);
  });

  it('shows no badge for a leaver', async () => {
    const leaver = {
      ...employee(ionescu.id, 'Ionescu', 'Ana', undefined, {
        ssm: trainingStatus(null),
        psi: trainingStatus(null),
      }),
      status: 'terminated',
      terminatedAt: '2026-01-31',
    };
    mockApi({ [`GET ${employeesPath}`]: () => Response.json(page([leaver])) });
    mountApp(authFixture(makeSession()).client, `${employeesPath}?status=terminated`);
    const [row] = await screen.findAllByTestId('employees-row');
    expect(within(row!).queryByTestId('training-status-ssm')).toBeNull();
    expect(screen.queryByTestId('employees-training-filter')).toBeNull();
  });

  it("filters the organization's employees by state", async () => {
    mockApi({
      'GET /employees': () =>
        Response.json(page([{ ...overdue, client: { id: clientId, name: 'OMV PETROM SA' } }])),
      'GET /clients': () => Response.json(page([sampleClient])),
    });
    const runtime = mountApp(authFixture(makeSession()).client, '/employees');
    const user = userEvent.setup();
    const [row] = await screen.findAllByTestId('organization-employees-row');
    expect(within(row!).getByTestId('training-status-ssm').dataset.state).toBe('overdue');
    await user.click(screen.getByTestId('organization-employees-training-filter-untrained'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ trainingState: 'untrained' })
    );
    await waitFor(() =>
      expect(requests('GET', '/employees').at(-1)!.url.searchParams.get('trainingState')).toBe(
        'untrained'
      )
    );
  });
});

describe('dates typed into the dialog', () => {
  it('refuses a day after today', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/ssm`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('training-record'));
    const dialog = await screen.findByTestId('training-dialog');
    fireEvent.change(within(dialog).getByTestId('training-held-on'), {
      target: { value: '01.01.2099' },
    });
    await user.click(within(dialog).getByTestId('training-save'));
    expect(
      await within(dialog).findByText('O instruire se înregistrează după ce a avut loc.')
    ).toBeTruthy();
  });
});
