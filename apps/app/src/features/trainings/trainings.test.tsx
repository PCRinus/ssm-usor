import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getListClientSignatureRequestsQueryKey,
  getListMySignatureRequestsQueryKey,
} from '@/api/generated/api';
import { todayIso } from '@/features/employees/employee-format';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';
import {
  employeeTests,
  noTests,
  testStatus,
  trainingStatus,
  untrained,
} from '@/test/training-fixture';

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
  tests: noTests,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
});

const popescuTraining = {
  ssm: trainingStatus('current', '2027-03-01', '2026-09-01', 6, 'client'),
  psi: trainingStatus('untrained', null, null, 6, 'client'),
};
const popescu = employee(
  '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  'Popescu',
  'Ion',
  undefined,
  popescuTraining
);
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
  signed: false,
  hasSignatures: false,
};

const periodicRecord = {
  id: '4f5a6b7c-8d9e-4f0a-9b1c-2d3e4f5a6b7c',
  occupation: 'Sudor',
  admission: null,
  training: training(),
  signed: false,
  hasSignatures: false,
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
    signers: { trainer: null, verifier: null, admitter: null },
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

const heldWith = (...attendees: { id: string; lastName: string; firstName: string }[]) => ({
  ...training(),
  attendeeCount: attendees.length,
  attendees: attendees.map(({ id, lastName, firstName }) => ({
    employeeId: id,
    lastName,
    firstName,
  })),
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
      case `GET ${employeePath}/tests`:
        return Response.json(employeeTests());
      case `GET ${employeePath}/training-sheets`:
        return Response.json({
          ssm: { ready: true, missing: [], stored: false, sequences: [] },
          psi: { ready: true, missing: [], stored: false, sequences: [] },
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
      case `GET /clients/${clientId}/signer-candidates`:
        return Response.json({ items: [] });
      case `GET /clients/${clientId}/signature-requests`:
        return Response.json({ items: [] });
      default:
        if (/^GET \/clients\/[^/]+\/training-records\/[^/]+\/signatures$/.test(key)) {
          return Response.json({ recordId: url.pathname.split('/')[4], slots: [] });
        }
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
  it('splits the page into Date, Instruire SSM and Instruire PSI, in the tabs and not in the sidebar', async () => {
    mockApi();
    const runtime = mountApp(authFixture(makeSession()).client, employeePath);
    const user = userEvent.setup();
    await screen.findByTestId('employee-page');
    expect(screen.getByRole('heading', { level: 1, name: 'Popescu Ion' })).toBeTruthy();
    expect(screen.getByTestId('employee-header-client').textContent).toBe('OMV PETROM SA');
    const tabs = screen.getAllByTestId('employee-section');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Date', 'Instruire SSM', 'Instruire PSI']);
    expect(tabs[0]!.getAttribute('aria-current')).toBe('page');
    expect(screen.queryByTestId('nav-employee-group')).toBeNull();

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
    expect(requests('GET', trainingsPath)).toHaveLength(0);
    expect(screen.getByTestId('training-state').textContent).toBe('La zi');
    expect(screen.getByTestId('training-due-on').textContent).toBe('1 mar. 2027');
    expect(screen.getByTestId('training-last-periodic').textContent).toBe('1 sept. 2026');
    const interval = screen.getByTestId('training-interval');
    expect(interval.textContent).toContain('La 6 luni');
    const source = within(interval).getByTestId('training-interval-source');
    expect(source.textContent).toBe('din programul de instruire al clientului');
    expect(source.getAttribute('href')).toBe(
      `/clients/${clientId}/training?focus=training-schedule`
    );
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
    expect(periodic.queryByTestId('training-record-paper-signed')).toBeNull();
    const toggle = periodic.getByTestId('training-material-toggle');
    expect(periodic.getByTestId('training-material-text').className).toContain('line-clamp-2');
    await user.click(toggle);
    expect(periodic.getByTestId('training-material-text').className).not.toContain('line-clamp-2');
    expect(toggle.textContent).toBe('mai puțin');

    const workplace = within(items[1]!);
    expect(workplace.getByTestId('training-record-paper').textContent).toBe('De pe fișa pe hârtie');
    expect(workplace.getByTestId('training-record-paper-signed').textContent).toBe(
      'Semnat pe hârtie: instruit, instructor, verificator, admite la lucru'
    );
    expect(workplace.queryByTestId('record-signatures')).toBeNull();
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

  it('gives an untrained employee no due date, and says the fire-safety interval comes from the client', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/psi`);
    await screen.findByTestId('training-records-empty');
    expect(screen.getByTestId('training-due-on').textContent).toBe('După instruirea la angajare');
    const source = screen.getByTestId('training-interval-source');
    expect(source.textContent).toBe('din datele de instruire PSI ale clientului');
    expect(source.getAttribute('href')).toBe(
      `/clients/${clientId}/training?focus=fire-training-schedule`
    );
  });

  it("names the position when the interval is the position's own", async () => {
    mockApi({
      [`GET ${employeePath}`]: () =>
        Response.json({
          employee: {
            ...employeeDetail,
            training: {
              ...popescuTraining,
              ssm: trainingStatus('current', '2026-10-01', '2026-09-01', 1, 'position'),
            },
          },
        }),
    });
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/ssm`);
    const interval = await screen.findByTestId('training-interval');
    expect(interval.textContent).toContain('Lunar');
    const source = within(interval).getByTestId('training-interval-source');
    expect(source.textContent).toBe('din postul Sudor');
    expect(source.getAttribute('href')).toBe(`/clients/${clientId}/job-positions/${welderId}`);
  });

  it('says an undecided interval is not set and links to where it is set', async () => {
    mockApi({
      [`GET ${employeePath}`]: () =>
        Response.json({
          employee: {
            ...employeeDetail,
            training: { ...popescuTraining, ssm: trainingStatus('current', null, '2026-09-01') },
          },
        }),
    });
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/ssm`);
    const interval = await screen.findByTestId('training-interval');
    expect(screen.getByTestId('training-due-on').textContent).toBe(
      'Intervalul de instruire nu este stabilit'
    );
    expect(interval.textContent).toContain('Nestabilit');
    expect(within(interval).queryByTestId('training-interval-source')).toBeNull();
    const set = within(interval).getByTestId('training-interval-set');
    expect(set.textContent).toBe('Stabilește intervalul');
    expect(set.getAttribute('title')).toBe('Postul își poate avea și propriul interval');
    expect(set.getAttribute('href')).toBe(`/clients/${clientId}/training?focus=training-schedule`);
  });

  it('keeps the header to its buttons and says what the sheet lacks on a row of its own', async () => {
    mockApi({
      [`GET ${employeePath}/training-sheets`]: () =>
        Response.json({
          ssm: { ready: false, missing: ['employee.commute_route'], stored: false, sequences: [] },
          psi: { ready: true, missing: [], stored: false, sequences: [] },
        }),
    });
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/ssm`);
    const notice = await screen.findByTestId('training-sheet-ssm-missing');
    const tab = screen.getByTestId('employee-training-tab');
    expect(notice.parentElement).toBe(tab);
    expect(tab.children[1]).toBe(notice);
    expect(notice.nextElementSibling).toBe(screen.getByTestId('training-status'));
    expect(screen.getByTestId('training-sheet-ssm')).toHaveProperty('disabled', true);
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
    expect(asked.get('employeeIds')).toBe(popescu.id);
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
  it('marks a training typed from a paper sheet', async () => {
    mockApi({
      [`GET ${trainingsPath}`]: () =>
        Response.json({
          items: [
            { ...heldWith(popescu), source: 'paper' },
            { ...heldWith(taranu), id: '6b7c8d9e-0f1a-4b2c-9d3e-4f5a6b7c8d9e' },
          ],
        }),
    });
    mountApp(authFixture(makeSession()).client, trainingsPath);
    const rows = await screen.findAllByTestId('trainings-row');
    expect(within(rows[0]!).getByText('De pe fișa pe hârtie')).toBeTruthy();
    expect(within(rows[1]!).queryByText('De pe fișa pe hârtie')).toBeNull();
  });

  it("is a tab of the client's page, filtered by domain and phase in the URL", async () => {
    const held = heldWith(popescu, taranu);
    mockApi({
      [`GET ${trainingsPath}`]: (url) =>
        Response.json({ items: url.searchParams.get('phase') === 'workplace' ? [] : [held] }),
    });
    const runtime = mountApp(authFixture(makeSession()).client, employeesPath);
    const user = userEvent.setup();
    await screen.findAllByTestId('employees-row');
    const tabs = screen.getAllByTestId('client-section');
    const labels = tabs.map((tab) => tab.textContent);
    const tab = labels.indexOf('Instruire și responsabili') + 1;
    expect(labels[tab]).toBe('Instruiri ținute');
    await user.click(tabs[tab]!);
    const rows = await screen.findAllByTestId('trainings-row');
    expect(runtime.router.state.location.pathname).toBe(trainingsPath);
    expect(screen.getByRole('heading', { name: 'Instruiri ținute' })).toBeTruthy();
    expect(within(rows[0]!).getByText('Periodică')).toBeTruthy();
    expect(within(rows[0]!).getByTestId('trainings-attendee-count').textContent).toBe(
      '2 participanți'
    );
    const attendees = within(rows[0]!).getAllByTestId('trainings-attendee');
    expect(attendees.map((link) => link.textContent)).toEqual(['Popescu Ion', 'Țăranu Ștefan']);
    expect(attendees[1]!.getAttribute('href')).toBe(`${employeesPath}/${taranu.id}/training/ssm`);
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
    mountApp(authFixture(makeSession()).client, trainingsPath);
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
    mountApp(authFixture(makeSession()).client, trainingsPath);
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
    const held = heldWith(popescu, taranu);
    let deleted = false;
    mockApi({
      [`GET ${trainingsPath}`]: () => Response.json({ items: deleted ? [] : [held] }),
      [`DELETE ${trainingsPath}/${trainingId}`]: () => {
        deleted = true;
        return new Response(null, { status: 204 });
      },
    });
    mountApp(authFixture(makeSession()).client, trainingsPath);
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

  it.each([
    [
      { signed: true, hasSignatures: true },
      true,
      'Instruirea este semnată electronic. Anulează semnăturile ca să o poți modifica sau șterge.',
    ],
    [
      { signed: false, hasSignatures: true },
      false,
      'Instruirea are semnături, chiar anulate sau pe hârtie, care rămân în evidență, așa că nu se mai poate șterge.',
    ],
  ])('locks a training by its signatures, %o', async (signing, editLocked, lock) => {
    mockApi({
      [`GET ${trainingsPath}`]: () =>
        Response.json({ items: [{ ...heldWith(popescu, taranu), ...signing }] }),
    });
    mountApp(authFixture(makeSession()).client, trainingsPath);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('trainings-row-menu'));
    expect((await screen.findByTestId('trainings-lock')).textContent).toBe(lock);
    expect(screen.getByTestId('trainings-edit').hasAttribute('data-disabled')).toBe(editLocked);
    expect(screen.getByTestId('trainings-delete').hasAttribute('data-disabled')).toBe(true);
  });
});

describe('training state in the employee lists', () => {
  const overdue = employee(taranu.id, 'Țăranu', 'Ștefan', undefined, {
    ssm: trainingStatus('overdue', '2026-06-01', '2025-12-01'),
    psi: trainingStatus('due', '2026-10-30'),
  });

  it("says each domain's state and due date in its own column on the client's list and filters by state", async () => {
    mockApi({ [`GET ${employeesPath}`]: () => Response.json(page([popescu, overdue])) });
    const runtime = mountApp(authFixture(makeSession()).client, `${employeesPath}?page=2`);
    const user = userEvent.setup();
    const rows = await screen.findAllByTestId('employees-row');
    expect(
      screen
        .getAllByRole('columnheader')
        .map((header) => header.textContent)
        .filter((text) => text?.startsWith('Instruire'))
    ).toEqual(['Instruire SSM', 'Instruire PSI']);
    const first = within(rows[0]!);
    expect(first.getByTestId('training-status-ssm').dataset.state).toBe('current');
    expect(first.getByTestId('training-status-ssm').textContent).toBe('La zi');
    expect(first.getByTestId('training-status-ssm').className).toContain('bg-success');
    expect(first.getByTestId('training-due-ssm').textContent).toBe('până la 1 mar. 2027');
    expect(first.getByTestId('training-status-psi').textContent).toBe('Neinstruit');
    expect(first.queryByTestId('training-due-psi')).toBeNull();
    const second = within(rows[1]!);
    expect(second.getByTestId('training-status-ssm').dataset.state).toBe('overdue');
    expect(second.getByTestId('training-status-ssm').textContent).toBe('Depășită');
    expect(second.getByTestId('training-due-ssm').textContent).toBe('din 1 iun. 2026');
    expect(second.getByTestId('training-status-psi').textContent).toBe('Scadentă');
    expect(second.getByTestId('training-due-psi').textContent).toBe('până la 30 oct. 2026');

    expect(
      within(screen.getByTestId('employees-training-filter'))
        .getAllByRole('button')
        .map((chip) => chip.textContent)
    ).toEqual(['Toate', 'La zi', 'Scadente', 'Depășite', 'Neinstruiți']);
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

  it('shows a dash instead of a badge for a leaver', async () => {
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
    expect(within(row!).queryByTestId('training-status-psi')).toBeNull();
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    const cells = within(row!).getAllByRole('cell');
    expect(cells[headers.indexOf('Instruire SSM')]!.textContent).toBe('—');
    expect(cells[headers.indexOf('Instruire PSI')]!.textContent).toBe('—');
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
    expect(within(row!).getByTestId('training-status-ssm').textContent).toBe('Depășită');
    expect(within(row!).getByTestId('training-due-psi').textContent).toBe('până la 30 oct. 2026');
    await user.click(screen.getByTestId('organization-employees-training-filter-untrained'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ trainingState: 'untrained' })
    );
    await waitFor(() =>
      expect(requests('GET', '/employees').at(-1)!.url.searchParams.get('trainingState')).toBe(
        'untrained'
      )
    );
    await user.click(screen.getByTestId('organization-employees-training-filter-current'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ trainingState: 'current' })
    );
    await waitFor(() =>
      expect(requests('GET', '/employees').at(-1)!.url.searchParams.get('trainingState')).toBe(
        'current'
      )
    );
  });

  it('reads one domain when the link names it, and both again once a state is picked', async () => {
    mockApi({
      'GET /employees': () =>
        Response.json(page([{ ...overdue, client: { id: clientId, name: 'OMV PETROM SA' } }])),
      'GET /clients': () => Response.json(page([sampleClient])),
    });
    const runtime = mountApp(
      authFixture(makeSession()).client,
      '/employees?trainingState=overdue&domain=ssm'
    );
    const user = userEvent.setup();
    await screen.findAllByTestId('organization-employees-row');
    const sent = () => requests('GET', '/employees').at(-1)!.url.searchParams;
    expect(sent().get('trainingState')).toBe('overdue');
    expect(sent().get('domain')).toBe('ssm');
    await user.click(screen.getByTestId('organization-employees-training-filter-due'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ trainingState: 'due' })
    );
    await waitFor(() => expect(sent().get('trainingState')).toBe('due'));
    expect(sent().has('domain')).toBe(false);
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

const paperResult = {
  id: '6b7c8d9e-0f1a-4b2c-8d3e-4f5a6b7c8d9e',
  employeeId: popescu.id,
  domain: 'ssm',
  test: 'hiring',
  takenOn: '2026-09-02',
  material: 'Test de verificare a cunoștințelor la angajare (TASSM)',
  grade: 'admis',
  examiner: { name: 'Dan Marin', jobTitle: 'Inspector SSM' },
  source: 'paper',
  attemptId: null,
  createdAt: '2026-09-02T10:00:00+00:00',
  updatedAt: '2026-09-02T10:00:00+00:00',
  sheet: { available: false, signed: { trainee: 'unassigned', examiner: 'unassigned' } },
};

const portalResult = {
  ...paperResult,
  id: '7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f',
  domain: 'psi',
  test: 'annual',
  takenOn: '2026-09-15',
  material: 'Verificare anuală pe bază de test (TPSU)',
  examiner: null,
  source: 'portal',
  attemptId: '8d9e0f1a-2b3c-4d4e-8f5a-6b7c8d9e0f1a',
  sheet: { available: true, signed: { trainee: 'pending', examiner: 'unassigned' } },
};

const attempt = (overrides: Record<string, unknown> = {}) => ({
  id: '9e0f1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b',
  domain: 'psi',
  test: 'annual',
  startedAt: '2026-09-15T08:00:00+00:00',
  finishedAt: '2026-09-15T08:10:00+00:00',
  score: 6,
  total: 10,
  passed: false,
  ...overrides,
});

const testsPath = `${employeePath}/tests`;

describe("an employee's knowledge tests", () => {
  it('shows the hiring test awaiting as a gap that blocks nothing', async () => {
    mockApi({
      [`GET ${testsPath}`]: () => Response.json(employeeTests(testStatus('pending', 'hiring'))),
    });
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/ssm`);
    const card = within(await screen.findByTestId('employee-tests'));
    expect((await card.findByTestId('tests-state')).textContent).toBe('De susținut');
    expect(card.getByTestId('tests-awaiting').textContent).toBe(
      'Testul la angajare îl așteaptă în portal'
    );
    expect(card.getByTestId('tests-gap').textContent).toContain(
      'Testul la angajare (TASSM) nu este promovat încă.'
    );
    expect(card.getByTestId('tests-results-empty')).toBeTruthy();
    expect(card.getByTestId('tests-attempts-empty')).toBeTruthy();
    expect(card.getByTestId('tests-record-paper')).toBeTruthy();
    expect(screen.getAllByTestId('training-record').length).toBeGreaterThan(0);
  });

  it('says when a hiring test from paper could not be verified, and takes its result on paper', async () => {
    mockApi({
      [`GET ${testsPath}`]: () => Response.json(employeeTests(undefined, testStatus('unverified'))),
    });
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/psi`);
    const user = userEvent.setup();
    const card = within(await screen.findByTestId('employee-tests'));
    expect((await card.findByTestId('tests-state')).textContent).toBe('Neverificat pe fișă');
    expect(card.getByTestId('tests-awaiting').textContent).toBe(
      'Testul la angajare nu a putut fi verificat pe fișă: semnătura nu se vede clar sau lipsește.'
    );
    expect(card.queryByTestId('tests-gap')).toBeNull();
    await user.click(card.getByTestId('tests-record-paper'));
    const dialog = within(await screen.findByTestId('test-result-dialog'));
    const choice = dialog.getByTestId('test-result-test') as HTMLSelectElement;
    expect([...choice.options].map((option) => option.value)).toEqual(['hiring', 'annual']);
  });

  it('lists the results with their source and examiner, and the attempts with their score', async () => {
    const tests = employeeTests(
      testStatus('passed', null, '2026-09-02'),
      testStatus('annual_due', 'annual', '2025-09-01', '2026-09-01')
    );
    mockApi({
      [`GET ${testsPath}`]: () =>
        Response.json({
          ssm: { ...tests.ssm, results: [paperResult] },
          psi: {
            ...tests.psi,
            results: [portalResult],
            attempts: [
              attempt({ score: 8, passed: true }),
              attempt({ id: 'af0f1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b' }),
              attempt({
                id: 'b00f1a2b-3c4d-4e5f-8a6b-7c8d9e0f1a2b',
                finishedAt: null,
                score: null,
                passed: null,
              }),
            ],
          },
        }),
    });
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/psi`);
    const card = within(await screen.findByTestId('employee-tests'));
    expect((await card.findByTestId('tests-state')).textContent).toBe('Anual scadent');
    expect(card.getByTestId('tests-awaiting').textContent).toBe(
      'Testul anual este scadent din 1 sept. 2026'
    );
    expect(card.queryByTestId('tests-gap')).toBeNull();
    const [result] = card.getAllByTestId('tests-result');
    expect(result!.textContent).toContain('15 sept. 2026');
    expect(result!.textContent).toContain('Verificare anuală pe bază de test (TPSU)');
    expect(within(result!).getByTestId('tests-result-source').textContent).toBe('Din portal');
    expect(within(result!).getByTestId('tests-result-examiner').textContent).toBe(
      'Examinator: nenumit încă'
    );
    expect(within(result!).getByTestId('tests-result-examiner-edit').textContent).toBe(
      'Numește examinatorul'
    );
    const attempts = card.getAllByTestId('tests-attempt');
    expect(
      attempts.map((row) => within(row).queryByTestId('tests-attempt-score')?.textContent)
    ).toEqual(['8/10', '6/10', undefined]);
    expect(
      attempts.map((row) => within(row).getByTestId('tests-attempt-outcome').textContent)
    ).toEqual(['Promovat', 'Nepromovat', 'În curs']);
  });

  it('records a paper result with the examiner the proposal names, and shows the state passed', async () => {
    let passed = false;
    mockApi({
      [`GET ${testsPath}`]: () =>
        Response.json(
          passed
            ? {
                ...employeeTests(),
                ssm: {
                  status: testStatus('passed', null, todayIso()),
                  results: [{ ...paperResult, takenOn: todayIso() }],
                  attempts: [],
                },
              }
            : employeeTests(testStatus('pending', 'hiring'))
        ),
      [`GET ${trainingsPath}/proposal`]: () =>
        Response.json(proposal({ trainer: { name: 'Dan Marin', jobTitle: null } })),
      [`POST ${testsPath}/results`]: () => {
        passed = true;
        return Response.json({ result: paperResult }, { status: 201 });
      },
    });
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/ssm`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('tests-record-paper'));
    const dialog = within(await screen.findByTestId('test-result-dialog'));
    const asked = requests('GET', `${trainingsPath}/proposal`).at(-1)!.url.searchParams;
    expect(asked.get('domain')).toBe('ssm');
    expect(asked.get('phase')).toBe('introductory_general');
    expect((dialog.getByTestId('test-result-test') as HTMLInputElement).value).toBe(
      'Testul la angajare (TASSM)'
    );
    expect((dialog.getByTestId('test-result-examiner-name') as HTMLInputElement).value).toBe(
      'Dan Marin'
    );
    await user.click(dialog.getByTestId('test-result-submit'));
    expect((await dialog.findByTestId('test-result-examiner-job-title-error')).textContent).toBe(
      'Scrie funcția examinatorului.'
    );
    await user.type(dialog.getByTestId('test-result-examiner-job-title'), 'Inspector SSM');
    await user.click(dialog.getByTestId('test-result-submit'));
    await waitFor(() => expect(screen.queryByTestId('test-result-dialog')).toBeNull());
    expect(requests('POST', `${testsPath}/results`)[0]!.body).toEqual({
      domain: 'ssm',
      test: 'hiring',
      takenOn: todayIso(),
      grade: 'admis',
      examiner: { name: 'Dan Marin', jobTitle: 'Inspector SSM' },
    });
    await waitFor(() => expect(screen.getByTestId('tests-state').textContent).toBe('Promovat'));
    expect(screen.queryByTestId('tests-record-paper')).toBeNull();
    expect(screen.queryByTestId('tests-gap')).toBeNull();
  });

  it('offers the annual test on paper after a fire-safety pass, and words a refusal', async () => {
    mockApi({
      [`GET ${testsPath}`]: () =>
        Response.json(
          employeeTests(undefined, testStatus('passed', null, '2026-01-10', '2027-01-10'))
        ),
      [`POST ${testsPath}/results`]: () =>
        Response.json(
          { error: 'conflict', message: 'x', reason: 'test_not_awaiting' },
          { status: 409 }
        ),
    });
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/psi`);
    const user = userEvent.setup();
    const card = within(await screen.findByTestId('employee-tests'));
    expect((await card.findByTestId('tests-awaiting')).textContent).toBe(
      'Testul anual urmează la 10 ian. 2027'
    );
    await user.click(card.getByTestId('tests-record-paper'));
    const dialog = within(await screen.findByTestId('test-result-dialog'));
    expect((dialog.getByTestId('test-result-test') as HTMLInputElement).value).toBe(
      'Testul anual (TPSU)'
    );
    await user.type(dialog.getByTestId('test-result-examiner-job-title'), 'Șef atelier');
    await user.click(dialog.getByTestId('test-result-submit'));
    expect((await dialog.findByTestId('test-result-error')).textContent).toContain(
      'Testul nu așteaptă acum angajatul'
    );
  });

  it('says so when the client was archived meanwhile', async () => {
    mockApi({
      [`GET ${testsPath}`]: () => Response.json(employeeTests(testStatus('pending', 'hiring'))),
      [`GET ${trainingsPath}/proposal`]: () =>
        Response.json(proposal({ trainer: { name: 'Dan Marin', jobTitle: 'Inspector SSM' } })),
      [`POST ${testsPath}/results`]: () =>
        Response.json(
          { error: 'conflict', message: 'x', reason: 'client_archived' },
          { status: 409 }
        ),
    });
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/ssm`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('tests-record-paper'));
    const dialog = within(await screen.findByTestId('test-result-dialog'));
    await user.click(dialog.getByTestId('test-result-submit'));
    expect((await dialog.findByTestId('test-result-error')).textContent).toBe(
      'Clientul este arhivat; rezultatele testelor lui nu se mai schimbă.'
    );
  });

  it("corrects a result's examiner, and the request lists follow the examiner", async () => {
    mockApi({
      [`GET ${testsPath}`]: () =>
        Response.json({
          ...employeeTests(),
          ssm: {
            status: testStatus('passed', null, '2026-09-02'),
            results: [paperResult],
            attempts: [],
          },
        }),
      [`PATCH ${testsPath}/results/${paperResult.id}`]: (_url, init) =>
        Response.json({ result: { ...paperResult, ...JSON.parse(String(init?.body)) } }),
    });
    const { queryClient } = mountApp(
      authFixture(makeSession()).client,
      `${employeePath}/training/ssm`
    );
    const requestLists = [
      getListMySignatureRequestsQueryKey(),
      getListClientSignatureRequestsQueryKey(clientId),
    ];
    const user = userEvent.setup();
    const card = within(await screen.findByTestId('employee-tests'));
    expect((await card.findByTestId('tests-result-examiner')).textContent).toBe(
      'Examinator: Dan Marin, Inspector SSM'
    );
    for (const key of requestLists) queryClient.setQueryData(key, { items: [] });
    expect(card.queryByTestId('tests-record-paper')).toBeNull();
    await user.click(card.getByTestId('tests-result-examiner-edit'));
    const dialog = within(await screen.findByTestId('test-result-dialog'));
    expect(dialog.queryByTestId('test-result-taken-on')).toBeNull();
    const name = dialog.getByTestId('test-result-examiner-name');
    await user.clear(name);
    await user.type(name, 'Elena Voicu');
    await user.click(dialog.getByTestId('test-result-submit'));
    await waitFor(() => expect(screen.queryByTestId('test-result-dialog')).toBeNull());
    expect(requests('PATCH', `${testsPath}/results/${paperResult.id}`)[0]!.body).toEqual({
      examiner: { name: 'Elena Voicu', jobTitle: 'Inspector SSM' },
    });
    expect(requests('GET', `${trainingsPath}/proposal`)).toHaveLength(0);
    for (const key of requestLists) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });
});

describe('test state in the employee lists', () => {
  const tested = {
    ...employee(taranu.id, 'Țăranu', 'Ștefan'),
    tests: { ssm: testStatus('passed'), psi: testStatus('annual_due', 'annual') },
  };

  it('shows both domains in one column on the client list and filters by test state', async () => {
    mockApi({
      [`GET ${employeesPath}`]: (url) =>
        Response.json(page(url.searchParams.get('testState') === 'none' ? [] : [popescu, tested])),
    });
    const runtime = mountApp(authFixture(makeSession()).client, employeesPath);
    const user = userEvent.setup();
    const rows = await screen.findAllByTestId('employees-row');
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers.filter((text) => text === 'Testare')).toHaveLength(1);
    expect(headers.indexOf('Testare')).toBe(headers.indexOf('Instruire PSI') + 1);
    expect(within(rows[0]!).getByTestId('test-status-ssm').textContent).toBe('Fără test');
    const second = within(rows[1]!);
    expect(second.getByTestId('test-status-ssm').textContent).toBe('Promovat');
    expect(second.getByTestId('test-status-ssm').className).toContain('bg-success');
    expect(second.getByTestId('test-status-psi').textContent).toBe('Anual scadent');

    expect(
      within(screen.getByTestId('employees-test-filter'))
        .getAllByRole('button')
        .map((chip) => chip.textContent)
    ).toEqual([
      'Toate',
      'La zi',
      'De susținut',
      'Anual scadent',
      'Neverificat pe fișă',
      'Fără test',
    ]);
    await user.click(screen.getByTestId('employees-test-filter-pending'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ testState: 'pending' })
    );
    await waitFor(() =>
      expect(requests('GET', employeesPath).at(-1)!.url.searchParams.get('testState')).toBe(
        'pending'
      )
    );
    await user.click(screen.getByTestId('employees-test-filter-unverified'));
    await waitFor(() =>
      expect(requests('GET', employeesPath).at(-1)!.url.searchParams.get('testState')).toBe(
        'unverified'
      )
    );
    await user.click(screen.getByTestId('employees-test-filter-none'));
    expect(await screen.findByText('Niciun angajat în această stare a testării')).toBeTruthy();
    await user.click(screen.getByTestId('employees-empty-clear-test-state'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
    expect(await screen.findAllByTestId('employees-row')).toHaveLength(2);
  });

  it("filters the organization's employees by test state", async () => {
    mockApi({
      'GET /employees': () =>
        Response.json(page([{ ...tested, client: { id: clientId, name: 'OMV PETROM SA' } }])),
      'GET /clients': () => Response.json(page([sampleClient])),
    });
    const runtime = mountApp(authFixture(makeSession()).client, '/employees?testState=garbage');
    const user = userEvent.setup();
    const [row] = await screen.findAllByTestId('organization-employees-row');
    expect(runtime.router.state.location.search).toEqual({});
    expect(within(row!).getByTestId('test-status-psi').textContent).toBe('Anual scadent');
    await user.click(screen.getByTestId('organization-employees-test-filter-annual_due'));
    await waitFor(() =>
      expect(requests('GET', '/employees').at(-1)!.url.searchParams.get('testState')).toBe(
        'annual_due'
      )
    );
  });
});

describe("a portal pass's test sheet", () => {
  const signedBy = (trainee: string, examiner: string) => ({
    ...portalResult,
    examiner: { name: 'Radu Stan', jobTitle: 'Cadru tehnic PSI' },
    sheet: { available: true, signed: { trainee, examiner } },
  });
  const resultPath = `${testsPath}/results/${portalResult.id}`;
  const withResult = (result: unknown) => () =>
    Response.json({
      ...employeeTests(),
      psi: {
        status: testStatus('passed', null, '2026-09-15', '2027-09-15'),
        results: [result],
        attempts: [],
      },
    });

  it('shows the two slots, and none for a paper result', async () => {
    mockApi({
      [`GET ${testsPath}`]: () =>
        Response.json({
          ssm: {
            status: testStatus('passed', null, '2026-09-02'),
            results: [paperResult],
            attempts: [],
          },
          psi: {
            status: testStatus('passed', null, '2026-09-15', '2027-09-15'),
            results: [signedBy('signed', 'pending')],
            attempts: [],
          },
        }),
    });
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/psi`);
    const sheet = within(await screen.findByTestId('tests-sheet'));
    const slots = sheet.getAllByTestId('tests-sheet-slot');
    expect(slots.map((slot) => slot.textContent)).toEqual([
      'InstruitSemnat electronic',
      'ExaminatorDe semnatMarchează semnat pe hârtie',
    ]);
    expect(within(slots[1]!).getByTestId('signature-slot-state').className).toContain('bg-warning');
    expect(screen.getByTestId('tests-result-examiner-edit')).toBeTruthy();

    await userEvent.setup().click(screen.getAllByTestId('employee-section')[1]!);
    await screen.findByTestId('employee-tests');
    await waitFor(() => expect(screen.getByTestId('employee-tests').dataset.domain).toBe('ssm'));
    expect(await screen.findByTestId('tests-result')).toBeTruthy();
    expect(screen.queryByTestId('tests-sheet')).toBeNull();
  });

  it('opens the sheet in a new tab', async () => {
    mockApi({
      [`GET ${testsPath}`]: withResult(signedBy('pending', 'unassigned')),
      [`GET ${resultPath}/sheet`]: () =>
        new Response(new Uint8Array([37, 80, 68, 70]), {
          headers: { 'Content-Type': 'application/pdf' },
        }),
    });
    const tab = {
      document: { write: vi.fn(), close: vi.fn(), title: '' },
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:test-sheet', revokeObjectURL: () => {} })
    );
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/psi`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('tests-sheet-preview'));
    expect(open).toHaveBeenCalledWith('', '_blank');
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledWith('blob:test-sheet'));
    expect(tab.document.title).toBe('Fișa de test');
    open.mockRestore();
  });

  it('offers a sheet the pass could not draw up, and opening it draws it up', async () => {
    let drawnUp = false;
    let attempts = 0;
    mockApi({
      [`GET ${testsPath}`]: () =>
        withResult(
          drawnUp
            ? signedBy('pending', 'pending')
            : {
                ...signedBy('unassigned', 'unassigned'),
                sheet: {
                  available: false,
                  signed: { trainee: 'unassigned', examiner: 'unassigned' },
                },
              }
        )(),
      [`GET ${resultPath}/sheet`]: () => {
        attempts += 1;
        if (attempts === 1) {
          return Response.json(
            { error: 'service_unavailable', message: 'x', reason: 'pdf_unavailable' },
            { status: 503 }
          );
        }
        drawnUp = true;
        return new Response(new Uint8Array([37, 80, 68, 70]), {
          headers: { 'Content-Type': 'application/pdf' },
        });
      },
    });
    const tab = {
      document: { write: vi.fn(), close: vi.fn(), title: '' },
      location: { replace: vi.fn() },
      close: vi.fn(),
    };
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:test-sheet', revokeObjectURL: () => {} })
    );
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/psi`);
    const user = userEvent.setup();
    const sheet = within(await screen.findByTestId('tests-sheet'));
    expect(sheet.getByTestId('tests-sheet-pending')).toBeTruthy();

    await user.click(sheet.getByTestId('tests-sheet-preview'));
    expect(
      await screen.findByText(
        'Fișa de test nu a putut fi întocmită acum. Încearcă din nou peste câteva minute.'
      )
    ).toBeTruthy();
    expect(tab.close).toHaveBeenCalled();

    await user.click(sheet.getByTestId('tests-sheet-preview'));
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledWith('blob:test-sheet'));
    await waitFor(() => expect(screen.queryByTestId('tests-sheet-pending')).toBeNull());
    expect(
      within(screen.getByTestId('tests-sheet'))
        .getAllByTestId('signature-slot-state')
        .map((badge) => badge.dataset.state)
    ).toEqual(['pending', 'pending']);
    open.mockRestore();
  });

  it('marks a slot signed on paper after a confirmation, and words a refusal', async () => {
    let marked = false;
    mockApi({
      [`GET ${testsPath}`]: () =>
        withResult(marked ? signedBy('paper', 'unassigned') : signedBy('pending', 'unassigned'))(),
      [`POST ${resultPath}/sheet/paper-signatures`]: (_url, init) => {
        const { slot } = JSON.parse(String(init?.body)) as { slot: string };
        if (slot === 'examiner') {
          return Response.json(
            { error: 'validation_error', message: 'x', reason: 'examiner_required' },
            { status: 400 }
          );
        }
        marked = true;
        return Response.json({
          resultId: portalResult.id,
          sheet: signedBy('paper', 'unassigned').sheet,
        });
      },
    });
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/psi`);
    const user = userEvent.setup();
    const marks = await screen.findAllByTestId('tests-sheet-paper');
    expect(marks).toHaveLength(2);

    await user.click(marks[1]!);
    let dialog = within(await screen.findByTestId('tests-sheet-paper-dialog'));
    expect(dialog.getByRole('heading').textContent).toBe('Marchezi „Examinator” semnat pe hârtie?');
    await user.click(dialog.getByTestId('tests-sheet-paper-confirm'));
    expect((await dialog.findByTestId('tests-sheet-paper-error')).textContent).toBe(
      'Rezultatul nu are examinator. Numește-l întâi, ca fișa să-l tipărească în rubrică.'
    );
    await user.click(dialog.getByRole('button', { name: 'Renunță' }));
    await waitFor(() => expect(screen.queryByTestId('tests-sheet-paper-dialog')).toBeNull());

    await user.click(screen.getAllByTestId('tests-sheet-paper')[0]!);
    dialog = within(await screen.findByTestId('tests-sheet-paper-dialog'));
    await user.click(dialog.getByTestId('tests-sheet-paper-confirm'));
    await waitFor(() => expect(screen.queryByTestId('tests-sheet-paper-dialog')).toBeNull());
    expect(
      requests('POST', `${resultPath}/sheet/paper-signatures`).map((call) => call.body)
    ).toEqual([{ slot: 'examiner' }, { slot: 'trainee' }]);
    await waitFor(() =>
      expect(
        within(screen.getAllByTestId('tests-sheet-slot')[0]!).getByTestId('signature-slot-state')
          .textContent
      ).toBe('Semnat pe hârtie')
    );
    expect(screen.getAllByTestId('tests-sheet-paper')).toHaveLength(1);
  });

  it('keeps the examiner once they signed, and says so when the API refuses a change', async () => {
    mockApi({
      [`GET ${testsPath}`]: withResult(signedBy('pending', 'pending')),
      [`PATCH ${resultPath}`]: () =>
        Response.json(
          { error: 'conflict', message: 'x', reason: 'examiner_signed' },
          { status: 409 }
        ),
    });
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/psi`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('tests-result-examiner-edit'));
    const dialog = within(await screen.findByTestId('test-result-dialog'));
    await user.click(dialog.getByTestId('test-result-submit'));
    expect((await dialog.findByTestId('test-result-error')).textContent).toBe(
      'Examinatorul a semnat deja fișa de test, așa că examinatorul rezultatului nu se mai schimbă.'
    );
  });

  it('offers no examiner change once the examiner signed', async () => {
    mockApi({ [`GET ${testsPath}`]: withResult(signedBy('pending', 'paper')) });
    mountApp(authFixture(makeSession()).client, `${employeePath}/training/psi`);
    expect(await screen.findByTestId('tests-sheet')).toBeTruthy();
    expect(screen.queryByTestId('tests-result-examiner-edit')).toBeNull();
    expect(screen.getAllByTestId('tests-sheet-paper')).toHaveLength(1);
  });
});
