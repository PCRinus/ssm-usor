import { readOnlyReason } from '@ssm-usor/contracts';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  type ClientDocumentListResponse,
  type EmployeeListResponseItemsItem,
  type EmployeeParticipantState,
  type FoundSheetsResponse,
  getListClientSignatureRequestsQueryKey,
  getListMySignaturesQueryKey,
  type ImportListResponse,
  type SigningAgreementResponse,
  type WorkplaceListResponse,
} from '@/api/generated/api';
import { trainingLocks } from '@/features/signatures/use-record-signatures';
import { readOnlyMessage, sessionExpiredMessage } from '@/lib/api-errors';
import { todayIso } from '@/lib/dates';
import { installFetchMock, mockApi as mockRoutes, requestsTo } from '@/test/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { mountApp } from '@/test/mount';
import {
  clientId,
  clientRecord,
  dutiesNotIssued,
  employeeListItem,
  employeeRecord,
  jobPositionRecord,
  pageOf,
} from '@/test/records';
import { fullText } from '@/test/text';
import { employeeTests, testStatus, trainingStatus, untrained } from '@/test/training-fixture';

const welderId = '5d0f1a9e-2a6b-4c3d-8e7f-1a2b3c4d5e6f';
const clerkId = '6e1a2b3c-4d5e-4f6a-8b7c-9d0e1f2a3b4c';
const themesRevisionId = '0b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const trainingId = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

const sampleClient = clientRecord({
  legalName: 'OMV PETROM SA',
  vatPayer: true,
  caenCode: '0610',
  locality: null,
  legalRepresentativeName: null,
  declaredEmployeeCount: null,
});

const position = (id: string, name: string) =>
  jobPositionRecord({
    id,
    name,
    employeeCount: 2,
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-20T10:00:00.000Z',
  });

const employee = (
  id: string,
  lastName: string,
  firstName: string,
  jobPosition = { id: welderId, name: 'Sudor' },
  training: EmployeeListResponseItemsItem['training'] = untrained
) =>
  employeeListItem({
    id,
    lastName,
    firstName,
    jobTitle: jobPosition.name,
    jobPosition,
    hiredAt: '2020-03-01',
    workplace: null,
    training,
  });

const popescuTraining = {
  ssm: trainingStatus('current', '2027-03-01', '2026-09-01', 6, 'client'),
  su: trainingStatus('untrained', null, null, 6, 'client'),
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

const employeeDetail = employeeRecord({
  id: popescu.id,
  lastName: popescu.lastName,
  firstName: popescu.firstName,
  jobTitle: popescu.jobTitle,
  jobPosition: { ...popescu.jobPosition, archived: false },
  hiredAt: popescu.hiredAt,
  workplace: null,
  training: popescuTraining,
});

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
  attendeeCount: 1,
  signature: 'paper',
  signed: false,
  hasSignatures: false,
  printed: false,
};

const periodicRecord = {
  id: '4f5a6b7c-8d9e-4f0a-9b1c-2d3e4f5a6b7c',
  occupation: 'Sudor',
  admission: null,
  training: training(),
  attendeeCount: 2,
  signature: 'pending',
  signed: false,
  hasSignatures: false,
  printed: false,
};

const detailOf = (attendees: { id: string; lastName: string; firstName: string }[]) => ({
  training: {
    ...training(),
    records: attendees.map((person, index) => ({
      id: `5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c${String(index).padStart(2, '0')}`,
      employee: { id: person.id, lastName: person.lastName, firstName: person.firstName },
      occupation: 'Sudor',
      admission: null,
      signature: 'paper',
    })),
    signers: { trainer: null, verifier: null, admitter: null },
    slotSignatures: { trainer: 'paper', verifier: 'paper', admitter: null },
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
  signatureState: 'paper',
  pendingTraineeSignatures: 0,
  pendingSignerSignatures: 0,
});

const page = (items: unknown[], unfilteredTotal = items.length) => ({
  ...pageOf(items),
  unfilteredTotal,
});

type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

const employeesPath = `/clients/${clientId}/employees`;
const employeesPage = `/clienti/${clientId}/angajati`;
const employeePath = `${employeesPath}/${popescu.id}`;
const employeePage = `${employeesPage}/${popescu.id}`;
const trainingsPath = `/clients/${clientId}/trainings`;
const trainingsPage = `/clienti/${clientId}/instruiri-tinute`;

function mockApi(routes: Partial<Record<string, Handler>> = {}) {
  mockRoutes((init, url) => {
    const method = init?.method ?? 'GET';
    const key = `${method} ${url.pathname}`;
    const route = routes[key];
    if (route) return route(url, init);
    switch (key) {
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
          ssm: { ready: true, missing: [], stored: false, sequences: [], versions: {} },
          su: { ready: true, missing: [], stored: false, sequences: [], versions: {} },
        });
      case `GET ${employeePath}/duties-acknowledgement`:
        return Response.json(dutiesNotIssued);
      case `GET /clients/${clientId}/job-positions`:
        return Response.json({
          items: [position(welderId, 'Sudor'), position(clerkId, 'Contabil')],
        });
      case `GET ${trainingsPath}`:
        return Response.json(page([]));
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
      case `GET /clients/${clientId}/workplaces`:
        return Response.json({
          items: [],
          unassignedEmployeeCount: 3,
        } satisfies WorkplaceListResponse);
      case `GET /clients/${clientId}/found-sheets`:
        return Response.json({ items: [], total: 0 } satisfies FoundSheetsResponse);
      case `GET /clients/${clientId}/documents`:
        return Response.json({
          items: [],
          lastGeneration: null,
          notApplicable: [],
          currentEmployeeCount: 3,
        } satisfies ClientDocumentListResponse);
      case `GET ${employeePath}/participant`:
        return Response.json({
          participant: null,
          invitation: null,
        } satisfies EmployeeParticipantState);
      case `GET ${employeePath}/signing-agreement/state`:
        return Response.json({
          agreement: null,
          unavailable: null,
        } satisfies SigningAgreementResponse);
      case 'GET /imports':
        if (
          url.searchParams.get('clientId') === clientId &&
          url.searchParams.get('kind') === 'employees'
        ) {
          return Response.json({ items: [] } satisfies ImportListResponse);
        }
        return undefined;
      default:
        if (/^GET \/clients\/[^/]+\/training-records\/[^/]+\/signatures$/.test(key)) {
          return Response.json({ recordId: url.pathname.split('/')[4], slots: [] });
        }
        if (
          /^GET \/clients\/[^/]+\/employees\/[^/]+\/tests\/results\/[^/]+\/sheet\/link$/.test(key)
        ) {
          return Response.json({
            url: 'http://127.0.0.1:54321/storage/v1/object/sign/documents/test-sheet',
            fileName: 'Fisa-de-test-TAPSI-Popescu-Ion-2026-10-21.pdf',
            expiresInSeconds: 600,
          });
        }
    }
  });
}

const requests = (method: string, pathname: string) =>
  requestsTo(pathname, method).map(([input, init]) => ({
    url: new URL(String(input)),
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  }));

installFetchMock();

describe("an employee's training tabs", () => {
  it('splits the page into Date, Instruire SSM, Instruire SU, Documente and Portal, in the tabs and not in the sidebar', async () => {
    mockApi();
    const runtime = mountApp(authFixture(makeSession()).client, employeePage);
    const user = userEvent.setup();
    await screen.findByTestId('employee-page');
    expect(screen.getByRole('heading', { level: 1, name: 'Popescu Ion' })).toBeTruthy();
    expect(screen.getByTestId('employee-header-client').textContent).toBe('OMV PETROM SA');
    const tabs = screen.getAllByTestId('employee-section');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Date',
      'Instruire SSM',
      'Instruire SU',
      'Documente',
      'Portal',
    ]);
    expect(tabs[0]!.getAttribute('aria-current')).toBe('page');
    expect(screen.queryByTestId('nav-employee-group')).toBeNull();
    expect(screen.queryByTestId('employee-files-card')).toBeNull();

    await user.click(tabs[1]!);
    await screen.findByTestId('employee-training-tab');
    expect(runtime.router.state.location.pathname).toBe(`${employeePage}/instruire/ssm`);
    expect(screen.queryByTestId('employee-page')).toBeNull();
    expect(screen.getAllByTestId('employee-section')[1]!.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Înapoi la lucrători' }).getAttribute('href')).toBe(
      employeePage.replace(/\/[^/]+$/, '')
    );

    await user.click(screen.getAllByTestId('employee-section')[3]!);
    await screen.findByTestId('employee-files-card');
    expect(runtime.router.state.location.pathname).toBe(`${employeePage}/documente`);
    expect(screen.queryByTestId('employee-training-tab')).toBeNull();
    expect(screen.getAllByTestId('employee-section')[3]!.getAttribute('aria-current')).toBe('page');
    expect(screen.getAllByTestId('page-back')).toHaveLength(1);
  });

  it('shows the state, the due date and the records newest first, each with its facts', async () => {
    mockApi({
      [`GET ${employeePath}/training-records`]: () =>
        Response.json({ items: [periodicRecord, workplaceRecord] }),
    });
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/ssm`);
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
      `/clienti/${clientId}/instruire?focus=training-schedule`
    );
    const actions = screen.getByTestId('training-tab-actions');
    expect(within(actions).getByTestId('training-sheet-ssm')).toBeTruthy();
    expect(actions.firstElementChild).toBe(screen.getByTestId('training-record'));
    expect(
      Array.from(screen.getByTestId('employee-training-tab').querySelectorAll('button, a'))
        .filter((element) => element.getAttribute('data-variant') === 'default')
        .map((element) => element.getAttribute('data-testid'))
    ).toEqual(['training-record']);
    expect(
      within(screen.getByTestId('employee-training-tab'))
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent)
    ).toEqual(['Fișa de luare la cunoștință a atribuțiilor SSM', 'Testare', 'Instruiri']);

    const periodic = within(items[0]!);
    expect(periodic.getByText('Periodică')).toBeTruthy();
    expect(periodic.getByTestId('training-record-duration').textContent).toBe('120 min (2 h)');
    expect(periodic.getByText('Maria Pop')).toBeTruthy();
    expect(periodic.queryByTestId('training-record-paper')).toBeNull();
    const session = periodic.getByTestId('training-record-session');
    expect(session.textContent).toBe('Instruire de grup · 2 participanți');
    expect(session.getAttribute('href')).toBe(`${trainingsPage}?domain=ssm&open=${trainingId}`);
    expect(periodic.getByTestId('training-record-signature').textContent).toBe('De semnat');
    const workplace = within(items[1]!);
    expect(workplace.getByText('La locul de muncă')).toBeTruthy();
    expect(workplace.getByTestId('training-record-paper').textContent).toBe(
      'Transcrisă de pe fișă'
    );
    expect(workplace.queryByTestId('training-record-session')).toBeNull();
    expect(workplace.getByTestId('training-record-duration').textContent).toBe('240 min (4 h)');
    expect(workplace.getByTestId('training-record-signature').textContent).toBe('Semnată de mână');

    const [openPeriodic, openWorkplace] = screen.getAllByTestId('training-record-open');
    expect(openPeriodic!.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('training-record-details')).toBeNull();
    await user.click(openPeriodic!);
    expect(openPeriodic!.getAttribute('aria-expanded')).toBe('true');
    const periodicDetails = screen.getByTestId('training-record-details');
    expect(openPeriodic!.getAttribute('aria-controls')).toBe(periodicDetails.closest('tr')!.id);
    const opened = within(periodicDetails);
    expect(opened.getByText(fullText('Dan Marin, Inspector SSM'))).toBeTruthy();
    expect(opened.queryByTestId('training-record-paper-signed')).toBeNull();
    const toggle = opened.getByTestId('training-material-toggle');
    expect(opened.getByTestId('training-material-text').className).toContain('line-clamp-2');
    await user.click(toggle);
    expect(opened.getByTestId('training-material-text').className).not.toContain('line-clamp-2');
    expect(toggle.textContent).toBe('mai puțin');
    await user.click(openPeriodic!);
    expect(screen.queryByTestId('training-record-details')).toBeNull();

    openWorkplace!.focus();
    await user.keyboard('{Enter}');
    const workplaceDetails = within(screen.getByTestId('training-record-details'));
    expect(workplaceDetails.getByTestId('training-record-paper-signed').textContent).toBe(
      'Semnat pe hârtie: instruit, instructor, verificator, admite la lucru'
    );
    expect(workplaceDetails.queryByTestId('record-signatures')).toBeNull();
    expect(workplaceDetails.getByTestId('training-record-admission').textContent).toBe(
      'Admis la lucru de Maria Pop, Șef atelier la 2 mar. 2020'
    );
    expect(workplaceDetails.queryByTestId('training-material-toggle')).toBeNull();
  });

  it('offers to record the first training when there is none', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/su`);
    const empty = await screen.findByTestId('training-records-empty');
    expect(empty.textContent).toContain('Nicio instruire înregistrată încă');
    expect(screen.getByTestId('training-state').textContent).toBe('Neinstruit');
    expect(within(empty).getByTestId('training-record')).toBeTruthy();
  });

  it('gives an untrained employee no due date, and says the fire-safety interval comes from the client', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/su`);
    await screen.findByTestId('training-records-empty');
    expect(screen.getByTestId('training-due-on').textContent).toBe('După instruirea la angajare');
    const source = screen.getByTestId('training-interval-source');
    expect(source.textContent).toBe('din datele de instruire SU ale clientului');
    expect(source.getAttribute('href')).toBe(
      `/clienti/${clientId}/instruire?focus=fire-training-schedule`
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
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/ssm`);
    const interval = await screen.findByTestId('training-interval');
    expect(interval.textContent).toContain('Lunar');
    const source = within(interval).getByTestId('training-interval-source');
    expect(source.textContent).toBe('din postul Sudor');
    expect(source.getAttribute('href')).toBe(`/clienti/${clientId}/posturi/${welderId}`);
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
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/ssm`);
    const interval = await screen.findByTestId('training-interval');
    expect(screen.getByTestId('training-due-on').textContent).toBe(
      'Intervalul de instruire nu este stabilit'
    );
    expect(interval.textContent).toContain('Nestabilit');
    expect(within(interval).queryByTestId('training-interval-source')).toBeNull();
    const set = within(interval).getByTestId('training-interval-set');
    expect(set.textContent).toBe('Stabilește intervalul');
    expect(set.getAttribute('title')).toBe('Postul își poate avea și propriul interval');
    expect(set.getAttribute('href')).toBe(`/clienti/${clientId}/instruire?focus=training-schedule`);
  });

  it('keeps the action bar to its buttons and says what the sheet lacks on a row of its own', async () => {
    mockApi({
      [`GET ${employeePath}/training-sheets`]: () =>
        Response.json({
          ssm: {
            ready: false,
            missing: ['employee.commute_route'],
            stored: false,
            sequences: [],
            versions: {},
          },
          su: { ready: true, missing: [], stored: false, sequences: [], versions: {} },
        }),
    });
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/ssm`);
    const notice = await screen.findByTestId('training-sheet-ssm-missing');
    expect(
      within(screen.getByTestId('employee-training-tab')).queryByRole('heading', {
        name: 'Instruire SSM',
      })
    ).toBeNull();
    expect(screen.getByTestId('training-tab-actions').contains(notice)).toBe(false);
    expect(screen.getByTestId('employee-training-tab').contains(notice)).toBe(true);
    expect(
      notice.compareDocumentPosition(screen.getByTestId('training-status')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByTestId('training-sheet-ssm')).toHaveProperty('disabled', true);
  });

  it('records a training for this employee alone, filled from the proposal', async () => {
    mockApi({
      [`GET ${employeePath}/training-records`]: () => Response.json({ items: [workplaceRecord] }),
    });
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/ssm`);
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
    await user.click(within(dialog).getByTestId('training-source'));
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
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/ssm`);
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
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/ssm`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('training-record-row-menu'));
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
  it('says in words what a paper sheet does not write, and saves the training so', async () => {
    const asWritten = training({
      source: 'paper',
      durationMinutes: null,
      material: null,
      trainer: { name: null, jobTitle: null },
      verifier: null,
    });
    const detail = {
      training: { ...detailOf([popescu]).training, ...asWritten },
    };
    mockApi({
      [`GET ${employeePath}/training-records`]: () =>
        Response.json({ items: [{ ...periodicRecord, training: asWritten }] }),
      [`GET ${trainingsPath}/${trainingId}`]: () => Response.json(detail),
      [`PUT ${trainingsPath}/${trainingId}`]: () => Response.json(detail),
    });
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/ssm`);
    const user = userEvent.setup();
    const item = await screen.findByTestId('training-record-item');
    expect(within(item).getByTestId('training-record-duration').textContent).toBe(
      'necompletată pe fișă'
    );
    expect(within(item).getByText('nume neînscris pe fișă')).toBeTruthy();
    await user.click(within(item).getByTestId('training-record-open'));
    expect(screen.getByTestId('training-material-text').textContent).toBe(
      'Material necompletat pe fișă'
    );

    await user.click(within(item).getByTestId('training-record-row-menu'));
    await user.click(await screen.findByTestId('training-record-edit'));
    const dialog = await screen.findByTestId('training-dialog');
    for (const field of ['training-duration', 'training-material', 'training-trainer-name']) {
      expect((within(dialog).getByTestId(field) as HTMLInputElement).value).toBe('');
    }
    await user.click(within(dialog).getByTestId('training-save'));

    expect(await screen.findByText('Instruirea a fost modificată.')).toBeTruthy();
    const [saved] = requests('PUT', `${trainingsPath}/${trainingId}`);
    expect(saved!.body).toMatchObject({
      source: 'paper',
      durationMinutes: null,
      material: null,
      trainer: { name: null, jobTitle: null },
    });
  });
});

describe("a client's trainings held", () => {
  it('marks a training typed from a paper sheet', async () => {
    mockApi({
      [`GET ${trainingsPath}`]: () =>
        Response.json(
          page([
            { ...heldWith(popescu), source: 'paper' },
            { ...heldWith(taranu), id: '6b7c8d9e-0f1a-4b2c-9d3e-4f5a6b7c8d9e' },
          ])
        ),
    });
    mountApp(authFixture(makeSession()).client, trainingsPage);
    const rows = await screen.findAllByTestId('trainings-row');
    expect(within(rows[0]!).getByText('SSM · Transcrisă de pe fișă')).toBeTruthy();
    expect(within(rows[1]!).getByText('SSM')).toBeTruthy();
    expect(within(rows[1]!).queryByText(/Transcrisă/)).toBeNull();
  });

  it('says in words what a paper sheet does not write in the list', async () => {
    mockApi({
      [`GET ${trainingsPath}`]: () =>
        Response.json(
          page([
            {
              ...heldWith(popescu),
              source: 'paper',
              durationMinutes: null,
              material: null,
              trainer: { name: null, jobTitle: 'Inspector SSM' },
            },
          ])
        ),
    });
    mountApp(authFixture(makeSession()).client, trainingsPage);
    const [row] = await screen.findAllByTestId('trainings-row');
    expect(within(row!).getByText('necompletată pe fișă')).toBeTruthy();
    expect(within(row!).getByText('nume neînscris pe fișă')).toBeTruthy();
    expect(within(row!).getByText('Inspector SSM')).toBeTruthy();
  });

  it("is a tab of the client's page, filtered by domain and phase in the URL", async () => {
    const held = heldWith(popescu, taranu);
    mockApi({
      [`GET ${trainingsPath}`]: (url) =>
        Response.json(url.searchParams.get('phase') === 'workplace' ? page([], 1) : page([held])),
    });
    const runtime = mountApp(authFixture(makeSession()).client, employeesPage);
    const user = userEvent.setup();
    await screen.findAllByTestId('employees-row');
    const tabs = screen.getAllByTestId('client-section');
    const labels = tabs.map((tab) => tab.textContent);
    const tab = labels.indexOf('Instruire și responsabili') + 1;
    expect(labels[tab]).toBe('Instruiri ținute');
    await user.click(tabs[tab]!);
    const rows = await screen.findAllByTestId('trainings-row');
    expect(runtime.router.state.location.pathname).toBe(trainingsPage);
    expect(screen.getByRole('heading', { name: 'Instruiri ținute' })).toBeTruthy();
    expect(
      within(screen.getByTestId('trainings-toolbar')).getByTestId('trainings-record')
    ).toBeTruthy();
    expect(within(rows[0]!).getByText('Periodică')).toBeTruthy();
    expect(within(rows[0]!).getByTestId('trainings-attendee-count').textContent).toBe(
      '2 participanți'
    );
    expect(within(rows[0]!).getByText('120 min (2 h)')).toBeTruthy();

    const historyLength = runtime.router.history.length;
    await user.click(
      screen.getAllByTestId('trainings-filter-domain').find((link) => link.dataset.domain === 'su')!
    );
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ domain: 'su' }));
    await user.click(await screen.findByTestId('trainings-filters'));
    await user.click(await screen.findByTestId('trainings-filters-phase-workplace'));
    await waitFor(() =>
      expect(runtime.router.state.location.searchStr).toBe('?domain=su&phase=workplace')
    );
    expect(runtime.router.history.length).toBe(historyLength);
    await user.keyboard('{Escape}');
    expect((await screen.findByTestId('trainings-empty-filtered')).textContent).toContain(
      'Nicio instruire SU nu se potrivește filtrelor alese.'
    );
    expect(screen.getByTestId('trainings-count').textContent).toBe('0 din 1 instruire');
    const asked = requests('GET', trainingsPath).at(-1)!.url.searchParams;
    expect(asked.getAll('domain')).toEqual(['su']);
    expect(asked.getAll('phase')).toEqual(['workplace']);
    expect(asked.get('sort')).toBe('heldOn');
    expect(asked.get('order')).toBe('desc');
  });

  it('records a periodic training for everyone in a post, from the checklist', async () => {
    mockApi({
      [`POST ${trainingsPath}`]: () => Response.json(detailOf([popescu, taranu]), { status: 201 }),
    });
    mountApp(authFixture(makeSession()).client, trainingsPage);
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

  it('keeps the dialog open while the training saves', async () => {
    let answer: (response: Response) => void = () => undefined;
    mockApi({
      [`POST ${trainingsPath}`]: () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    });
    mountApp(authFixture(makeSession()).client, trainingsPage);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('trainings-record'));
    const dialog = await screen.findByTestId('training-dialog');
    await user.selectOptions(within(dialog).getByTestId('training-phase'), 'introductory_general');
    await user.click((await within(dialog).findAllByTestId('training-attendee'))[0]!);
    await waitFor(() =>
      expect((within(dialog).getByTestId('training-duration') as HTMLInputElement).value).toBe(
        '120'
      )
    );
    await user.type(within(dialog).getByTestId('training-verifier-job-title'), 'Inspector SSM');
    await user.click(within(dialog).getByTestId('training-save'));
    await waitFor(() =>
      expect(within(dialog).getByTestId('training-save').textContent).toBe('Se salvează…')
    );

    await user.keyboard('{Escape}');
    expect(screen.getByTestId('training-dialog')).toBeTruthy();

    answer(
      Response.json({ error: 'validation_error', message: 'Invalid', issues: [] }, { status: 400 })
    );
    expect(await within(dialog).findByTestId('training-error')).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('training-dialog')).toBeNull());
  });

  it.each([
    ['', { job_positions: 401 }],
    [', whatever else failed', { job_positions: 404, employees: 401 }],
  ])(
    'tells an expired session why the training form did not load%s',
    async (_, failing: { job_positions: number; employees?: number }) => {
      const failure = (status: number) => () =>
        status === 401
          ? Response.json({ error: 'unauthorized', message: 'Expired' }, { status })
          : Response.json({ error: 'not_found', message: 'Gone' }, { status });
      mockApi({
        [`GET /clients/${clientId}/job-positions`]: failure(failing.job_positions),
        ...(failing.employees && { [`GET ${employeesPath}`]: failure(failing.employees) }),
      });
      mountApp(authFixture(makeSession()).client, trainingsPage);
      const user = userEvent.setup();
      await user.click(await screen.findByTestId('trainings-record'));
      expect((await screen.findByTestId('training-dialog-load-error')).textContent).toBe(
        sessionExpiredMessage
      );
    }
  );

  it('lists every current employee for an introductory training, and marks the field an API issue names', async () => {
    mockApi({
      [`POST ${trainingsPath}`]: () =>
        Response.json(
          {
            error: 'validation_error',
            message: 'Invalid',
            issues: [
              { path: 'trainer.jobTitle', message: 'String must contain at most 200 character(s)' },
            ],
          },
          { status: 400 }
        ),
    });
    mountApp(authFixture(makeSession()).client, trainingsPage);
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
    expect(
      await within(dialog).findByText('Valoarea nu a fost acceptată. Verifică acest câmp.')
    ).toBeTruthy();
    expect(within(dialog).queryByText(/must contain/)).toBeNull();
    expect(screen.getByTestId('training-dialog')).toBeTruthy();
  });

  it('deletes a training held after asking, naming everyone it concerns', async () => {
    const held = heldWith(popescu, taranu);
    let deleted = false;
    mockApi({
      [`GET ${trainingsPath}`]: () => Response.json(page(deleted ? [] : [held])),
      [`DELETE ${trainingsPath}/${trainingId}`]: () => {
        deleted = true;
        return new Response(null, { status: 204 });
      },
    });
    mountApp(authFixture(makeSession()).client, trainingsPage);
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

  it('stays open while a deletion runs, so its failure is shown', async () => {
    let fail: (response: Response) => void = () => undefined;
    mockApi({
      [`GET ${trainingsPath}`]: () => Response.json(page([heldWith(popescu, taranu)])),
      [`DELETE ${trainingsPath}/${trainingId}`]: () =>
        new Promise<Response>((resolve) => {
          fail = resolve;
        }),
    });
    mountApp(authFixture(makeSession()).client, trainingsPage);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('trainings-row-menu'));
    await user.click(await screen.findByTestId('trainings-delete'));
    const dialog = await screen.findByTestId('training-delete-dialog');
    await user.click(within(dialog).getByTestId('training-delete-confirm'));
    await waitFor(() =>
      expect(requests('DELETE', `${trainingsPath}/${trainingId}`)).toHaveLength(1)
    );
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('training-delete-dialog')).toBeTruthy();
    fail(Response.json({ error: 'Internal Server Error' }, { status: 500 }));
    expect((await screen.findByTestId('training-delete-error')).textContent).toBe(
      'Nu am putut șterge instruirea. Verifică conexiunea și încearcă din nou.'
    );
  });

  it.each([
    [
      'an expired session',
      () => Response.json({ error: 'unauthorized', message: 'Expired' }, { status: 401 }),
      sessionExpiredMessage,
    ],
    [
      'a read-only account',
      () =>
        Response.json(
          { error: 'forbidden', message: 'Read-only', reason: readOnlyReason },
          { status: 403 }
        ),
      readOnlyMessage,
    ],
  ])('tells %s why the training was not deleted', async (_, refusal, message) => {
    mockApi({
      [`GET ${trainingsPath}`]: () => Response.json(page([heldWith(popescu, taranu)])),
      [`DELETE ${trainingsPath}/${trainingId}`]: refusal,
    });
    mountApp(authFixture(makeSession()).client, trainingsPage);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('trainings-row-menu'));
    await user.click(await screen.findByTestId('trainings-delete'));
    const dialog = await screen.findByTestId('training-delete-dialog');
    await user.click(within(dialog).getByTestId('training-delete-confirm'));
    expect((await screen.findByTestId('training-delete-error')).textContent).toBe(message);
  });

  it('counts 25 attendees with "de", in the list and when deleting', async () => {
    mockApi({
      [`GET ${trainingsPath}`]: () =>
        Response.json(page([{ ...heldWith(popescu, taranu), attendeeCount: 25 }])),
    });
    mountApp(authFixture(makeSession()).client, trainingsPage);
    const user = userEvent.setup();
    const [row] = await screen.findAllByTestId('trainings-row');
    expect(within(row!).getByTestId('trainings-attendee-count').textContent).toBe(
      '25 de participanți'
    );
    await user.click(within(row!).getByTestId('trainings-row-menu'));
    await user.click(await screen.findByTestId('trainings-delete'));
    const dialog = await screen.findByTestId('training-delete-dialog');
    expect(within(dialog).getByTestId('training-delete-count').textContent).toBe(
      'Are 25 de participanți; ștergerea îi privește pe toți.'
    );
  });

  it.each([
    [{ signed: true, hasSignatures: true, printed: false }, true],
    [{ signed: false, hasSignatures: true, printed: false }, false],
    [{ source: 'paper', signed: false, hasSignatures: true, printed: true }, true],
  ])('locks a training by its signatures, %o', async (signing, editLocked) => {
    mockApi({
      [`GET ${trainingsPath}`]: () =>
        Response.json(page([{ ...heldWith(popescu, taranu), ...signing }])),
    });
    mountApp(authFixture(makeSession()).client, trainingsPage);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('trainings-row-menu'));
    expect((await screen.findByTestId('trainings-lock')).textContent).toBe(
      trainingLocks(signing).delete
    );
    expect(screen.getByTestId('trainings-edit').hasAttribute('data-disabled')).toBe(editLocked);
    expect(screen.getByTestId('trainings-delete').hasAttribute('data-disabled')).toBe(true);
  });
});

describe('training state in the employee lists', () => {
  const overdue = employee(taranu.id, 'Țăranu', 'Ștefan', undefined, {
    ssm: trainingStatus('overdue', '2026-06-01', '2025-12-01'),
    su: trainingStatus('due', '2026-10-30'),
  });
  const headerTexts = () =>
    screen.getAllByRole('columnheader').map((header) => header.textContent?.replace('⁠', ''));

  it("says each domain's state and due date in its own column on the client's list and filters by state", async () => {
    mockApi({ [`GET ${employeesPath}`]: () => Response.json(page([popescu, overdue])) });
    const runtime = mountApp(authFixture(makeSession()).client, `${employeesPage}?page=2`);
    const user = userEvent.setup();
    const rows = await screen.findAllByTestId('employees-row');
    expect(headerTexts().filter((text) => text?.startsWith('Instruire'))).toEqual([
      'Instruire SSM',
      'Instruire SU',
    ]);
    const first = within(rows[0]!);
    expect(first.getByTestId('training-status-ssm').dataset.state).toBe('current');
    expect(first.getByTestId('training-status-ssm').textContent).toBe('La zi');
    expect(first.getByTestId('training-status-ssm').className).toContain('bg-success');
    expect(first.getByTestId('training-due-ssm').textContent).toBe('până la 1 mar. 2027');
    expect(first.getByTestId('training-status-su').textContent).toBe('Neinstruit');
    expect(first.queryByTestId('training-due-su')).toBeNull();
    const second = within(rows[1]!);
    expect(second.getByTestId('training-status-ssm').dataset.state).toBe('overdue');
    expect(second.getByTestId('training-status-ssm').textContent).toBe('Depășită');
    expect(second.getByTestId('training-due-ssm').textContent).toBe('din 1 iun. 2026');
    expect(second.getByTestId('training-status-su').textContent).toBe('Scadentă');
    expect(second.getByTestId('training-due-su').textContent).toBe('până la 30 oct. 2026');

    const historyLength = runtime.router.history.length;
    await user.click(screen.getByTestId('employees-filters'));
    const panel = await screen.findByTestId('employees-filters-panel');
    expect(
      within(within(panel).getByRole('list', { name: 'Instruire SSM' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual([
      'De instruit (neinstruiți sau depășiți)',
      'Neinstruiți',
      'Depășită',
      'Scadentă în 30 de zile',
      'La zi',
    ]);
    await user.click(within(panel).getByTestId('employees-filters-ssmTraining-overdue'));
    await user.click(within(panel).getByTestId('employees-filters-suTraining-attention'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({
        ssmTraining: 'overdue',
        suTraining: 'attention',
      })
    );
    expect(runtime.router.history.length).toBe(historyLength);
    await waitFor(() => {
      const sent = requests('GET', employeesPath).at(-1)!.url.searchParams;
      expect(sent.getAll('ssmTraining')).toEqual(['overdue']);
      expect(sent.getAll('suTraining')).toEqual(['attention']);
      expect(sent.get('page')).toBe('1');
    });
    await user.click(within(panel).getByTestId('employees-filters-clear'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
  });

  it.each([
    ['attention=toTrain', 'De instruit, SSM sau SU'],
    ['trainingState=attention', 'De instruit, SSM sau SU'],
    ['trainingState=due', 'Instruire scadentă în 30 de zile, SSM sau SU'],
  ])(
    'opens filtered to those to train in either domain, as the clients list links to them: %s',
    async (search, label) => {
      mockApi({ [`GET ${employeesPath}`]: () => Response.json(page([popescu])) });
      mountApp(authFixture(makeSession()).client, `${employeesPage}?${search}`);
      await screen.findAllByTestId('employees-row');
      expect(screen.getByTestId('employees-applied-filters-attention').textContent).toContain(
        label
      );
      const sent = requests('GET', employeesPath).at(-1)!.url.searchParams;
      expect(sent.getAll('attention')).toHaveLength(1);
      expect(sent.has('trainingState')).toBe(false);
    }
  );

  it("drops an earlier link's filter from the address once it is removed", async () => {
    mockApi({ [`GET ${employeesPath}`]: () => Response.json(page([popescu])) });
    const runtime = mountApp(
      authFixture(makeSession()).client,
      `${employeesPage}?trainingState=attention&testState=pending`
    );
    const user = userEvent.setup();
    await screen.findAllByTestId('employees-row');
    await user.click(screen.getByTestId('employees-applied-filters-attention-remove'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ test: 'pending' }));
    await user.click(screen.getByTestId('employees-applied-filters-clear'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
    await waitFor(() => {
      const sent = requests('GET', employeesPath).at(-1)!.url.searchParams;
      expect(sent.has('attention')).toBe(false);
      expect(sent.has('test')).toBe(false);
    });
  });

  it('opens a dashboard link of one domain on that domain alone', async () => {
    mockApi({
      'GET /employees': () =>
        Response.json(page([{ ...overdue, client: { id: clientId, name: 'OMV PETROM SA' } }])),
      'GET /clients': () => Response.json(page([sampleClient])),
    });
    mountApp(authFixture(makeSession()).client, '/angajati?trainingState=overdue&domain=ssm');
    await screen.findAllByTestId('organization-employees-row');
    const sent = requests('GET', '/employees').at(-1)!.url.searchParams;
    expect(sent.getAll('ssmTraining')).toEqual(['overdue']);
    expect(sent.has('suTraining')).toBe(false);
    expect(sent.has('domain')).toBe(false);
    expect(
      screen.getByTestId('organization-employees-applied-filters-ssmTraining').textContent
    ).toContain('Depășită');
  });

  it('says when no one is in the state asked for, and shows everyone again', async () => {
    mockApi({
      [`GET ${employeesPath}`]: (url) =>
        Response.json(url.searchParams.get('ssmTraining') ? page([], 1) : page([popescu])),
    });
    const runtime = mountApp(
      authFixture(makeSession()).client,
      `${employeesPage}?ssmTraining=overdue`
    );
    const user = userEvent.setup();
    expect(await screen.findByText('Niciun lucrător nu se potrivește')).toBeTruthy();
    expect(screen.getByTestId('employees-applied-filters')).toBeTruthy();
    await user.click(screen.getByTestId('employees-empty-filtered-clear'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
    expect(await screen.findAllByTestId('employees-row')).toHaveLength(1);
  });

  it('shows a dash instead of a badge for a leaver, and no training filters', async () => {
    const leaver = {
      ...employee(ionescu.id, 'Ionescu', 'Ana', undefined, {
        ssm: trainingStatus(null),
        su: trainingStatus(null),
      }),
      status: 'terminated',
      terminatedAt: '2026-01-31',
    };
    mockApi({ [`GET ${employeesPath}`]: () => Response.json(page([leaver])) });
    mountApp(authFixture(makeSession()).client, `${employeesPage}?status=terminated`);
    const user = userEvent.setup();
    const [row] = await screen.findAllByTestId('employees-row');
    expect(within(row!).queryByTestId('training-status-ssm')).toBeNull();
    expect(within(row!).queryByTestId('training-status-su')).toBeNull();
    const headers = headerTexts();
    const cells = within(row!).getAllByRole('cell');
    expect(cells[headers.indexOf('Instruire SSM')]!.textContent).toBe('—');
    expect(cells[headers.indexOf('Instruire SU')]!.textContent).toBe('—');
    expect(cells[headers.indexOf('Data încetării')]!.textContent).toBe('31 ian. 2026');
    await user.click(screen.getByTestId('employees-filters'));
    const panel = await screen.findByTestId('employees-filters-panel');
    expect(within(panel).queryByRole('heading', { name: 'Instruire SSM' })).toBeNull();
    expect(within(panel).queryByRole('heading', { name: 'Testare' })).toBeNull();
    expect(within(panel).getByRole('heading', { name: 'Necesită atenție' })).toBeTruthy();
  });

  it("filters the organization's employees by state", async () => {
    mockApi({
      'GET /employees': () =>
        Response.json(page([{ ...overdue, client: { id: clientId, name: 'OMV PETROM SA' } }])),
      'GET /clients': () => Response.json(page([sampleClient])),
    });
    const runtime = mountApp(authFixture(makeSession()).client, '/angajati');
    const user = userEvent.setup();
    const [row] = await screen.findAllByTestId('organization-employees-row');
    expect(within(row!).getByTestId('training-status-ssm').textContent).toBe('Depășită');
    expect(within(row!).getByTestId('training-due-su').textContent).toBe('până la 30 oct. 2026');
    await user.click(screen.getByTestId('organization-employees-filters'));
    const panel = await screen.findByTestId('organization-employees-filters-panel');
    await user.click(
      within(panel).getByTestId('organization-employees-filters-suTraining-untrained')
    );
    await user.click(
      within(panel).getByTestId('organization-employees-filters-suTraining-current')
    );
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({
        suTraining: ['untrained', 'current'],
      })
    );
    expect(runtime.router.state.location.href).toBe(
      '/angajati?suTraining=untrained&suTraining=current'
    );
    await waitFor(() =>
      expect(requests('GET', '/employees').at(-1)!.url.searchParams.getAll('suTraining')).toEqual([
        'untrained',
        'current',
      ])
    );
  });
});

describe('dates typed into the dialog', () => {
  it('refuses a day after today', async () => {
    mockApi();
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/ssm`);
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
  domain: 'su',
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
  domain: 'su',
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
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/ssm`);
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
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/su`);
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

  it('says a paper result whose sheet names no examiner has none written', async () => {
    const tests = employeeTests(
      testStatus('passed', null, '2026-09-02'),
      testStatus('passed', null, '2026-09-02')
    );
    mockApi({
      [`GET ${testsPath}`]: () =>
        Response.json({
          ...tests,
          ssm: { ...tests.ssm, results: [{ ...paperResult, examiner: null }] },
        }),
    });
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/ssm`);
    const card = within(await screen.findByTestId('employee-tests'));
    expect((await card.findByTestId('tests-result-examiner')).textContent).toBe(
      'Examinator: nume neînscris pe fișă'
    );
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
          su: {
            ...tests.su,
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
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/su`);
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
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/ssm`);
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

  it('records a paper result whose sheet names no examiner', async () => {
    mockApi({
      [`GET ${testsPath}`]: () => Response.json(employeeTests(testStatus('pending', 'hiring'))),
      [`GET ${trainingsPath}/proposal`]: () =>
        Response.json(proposal({ trainer: { name: 'Dan Marin', jobTitle: null } })),
      [`POST ${testsPath}/results`]: () =>
        Response.json({ result: { ...paperResult, examiner: null } }, { status: 201 }),
    });
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/ssm`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('tests-record-paper'));
    const dialog = within(await screen.findByTestId('test-result-dialog'));
    const name = dialog.getByTestId('test-result-examiner-name') as HTMLInputElement;
    expect(name.placeholder).toBe('nume neînscris pe fișă');
    await user.clear(name);
    await user.click(dialog.getByTestId('test-result-submit'));
    await waitFor(() => expect(screen.queryByTestId('test-result-dialog')).toBeNull());
    expect(requests('POST', `${testsPath}/results`)[0]!.body).toMatchObject({
      test: 'hiring',
      examiner: null,
    });
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
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/su`);
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
      'Testul nu așteaptă acum lucrătorul'
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
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/ssm`);
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
      `${employeePage}/instruire/ssm`
    );
    const requestLists = [
      getListMySignaturesQueryKey(),
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
    tests: { ssm: testStatus('passed'), su: testStatus('annual_due', 'annual') },
  };
  const pending = {
    ...employee(ionescu.id, 'Ionescu', 'Ana'),
    tests: { ssm: testStatus('pending', 'hiring'), su: testStatus('pending', 'hiring') },
  };

  it('says in one line only the test that asks for action, and filters by test state', async () => {
    mockApi({
      [`GET ${employeesPath}`]: (url) =>
        Response.json(
          url.searchParams.get('test') === 'none' ? page([], 3) : page([popescu, tested, pending])
        ),
    });
    const runtime = mountApp(authFixture(makeSession()).client, employeesPage);
    const user = userEvent.setup();
    const rows = await screen.findAllByTestId('employees-row');
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers.filter((text) => text === 'Testare')).toHaveLength(1);
    expect(within(rows[0]!).getByTestId('test-status').textContent).toBe('—');
    const second = within(rows[1]!).getByTestId('test-status');
    expect(second.textContent).toBe('SU: anual scadent');
    expect(second.dataset.state).toBe('annual_due');
    expect(within(rows[2]!).getByTestId('test-status').textContent).toBe('De susținut');

    await user.click(screen.getByTestId('employees-filters'));
    const panel = await screen.findByTestId('employees-filters-panel');
    expect(
      within(within(panel).getByRole('list', { name: 'Testare' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['De susținut', 'Anual scadent', 'Neverificat pe fișă', 'La zi', 'Fără test']);
    await user.click(within(panel).getByTestId('employees-filters-test-pending'));
    await user.click(within(panel).getByTestId('employees-filters-test-unverified'));
    await waitFor(() =>
      expect(requests('GET', employeesPath).at(-1)!.url.searchParams.getAll('test')).toEqual([
        'pending',
        'unverified',
      ])
    );
    await user.click(within(panel).getByTestId('employees-filters-test-pending'));
    await user.click(within(panel).getByTestId('employees-filters-test-unverified'));
    await user.click(within(panel).getByTestId('employees-filters-test-none'));
    await user.keyboard('{Escape}');
    expect(await screen.findByText('Niciun lucrător nu se potrivește')).toBeTruthy();
    await user.click(screen.getByTestId('employees-empty-filtered-clear'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({}));
    expect(await screen.findAllByTestId('employees-row')).toHaveLength(3);
  });

  it.each([
    [{ ssm: 'passed', su: 'passed' }, 'La zi'],
    [{ ssm: 'passed', su: 'none' }, 'SU: fără test'],
    [{ ssm: 'none', su: 'none' }, '—'],
    [{ ssm: 'unverified', su: 'passed' }, 'Neverificat pe fișă'],
  ] as const)(
    'says "La zi" only when both domains passed, as the filter: %o',
    async (states, text) => {
      const row = {
        ...employee(taranu.id, 'Țăranu', 'Ștefan'),
        tests: { ssm: testStatus(states.ssm), su: testStatus(states.su) },
      };
      mockApi({ [`GET ${employeesPath}`]: () => Response.json(page([row])) });
      mountApp(authFixture(makeSession()).client, employeesPage);
      const [listed] = await screen.findAllByTestId('employees-row');
      expect(within(listed!).getByTestId('test-status').textContent).toBe(text);
    }
  );

  it("filters the organization's employees by test state, dropping a value it does not know", async () => {
    mockApi({
      'GET /employees': () =>
        Response.json(page([{ ...tested, client: { id: clientId, name: 'OMV PETROM SA' } }])),
      'GET /clients': () => Response.json(page([sampleClient])),
    });
    mountApp(authFixture(makeSession()).client, '/angajati?testState=garbage&test=garbage');
    const user = userEvent.setup();
    const [row] = await screen.findAllByTestId('organization-employees-row');
    expect(requests('GET', '/employees')[0]!.url.searchParams.has('test')).toBe(false);
    expect(within(row!).getByTestId('test-status').textContent).toBe('SU: anual scadent');
    await user.click(screen.getByTestId('organization-employees-filters'));
    await user.click(await screen.findByTestId('organization-employees-filters-test-annual_due'));
    await waitFor(() =>
      expect(requests('GET', '/employees').at(-1)!.url.searchParams.getAll('test')).toEqual([
        'annual_due',
      ])
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
      su: {
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
          su: {
            status: testStatus('passed', null, '2026-09-15', '2027-09-15'),
            results: [signedBy('signed', 'pending')],
            attempts: [],
          },
        }),
    });
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/su`);
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

  it('opens a stored sheet from a real link, shown inline in a tab', async () => {
    mockApi({ [`GET ${testsPath}`]: withResult(signedBy('pending', 'unassigned')) });
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/su`);
    await waitFor(() =>
      expect(screen.getByTestId('tests-sheet-preview').getAttribute('href')).toContain(
        '/files/download?'
      )
    );
    const preview = screen.getByTestId('tests-sheet-preview');
    const address = new URL(preview.getAttribute('href')!);
    expect(address.searchParams.get('source')).toBe(
      'http://127.0.0.1:54321/storage/v1/object/sign/documents/test-sheet'
    );
    expect(address.searchParams.get('name')).toBe('Fisa-de-test-TAPSI-Popescu-Ion-2026-10-21.pdf');
    expect(address.searchParams.get('disposition')).toBe('inline');
    expect(preview.getAttribute('target')).toBe('_blank');
    expect(requests('GET', `${resultPath}/sheet`)).toHaveLength(0);
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
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/su`);
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
    await waitFor(() =>
      expect(screen.getByTestId('tests-sheet-preview').getAttribute('href')).toContain(
        '/files/download?'
      )
    );
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
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/su`);
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
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/su`);
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
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/su`);
    expect(await screen.findByTestId('tests-sheet')).toBeTruthy();
    expect(screen.queryByTestId('tests-result-examiner-edit')).toBeNull();
    expect(screen.getAllByTestId('tests-sheet-paper')).toHaveLength(1);
  });
});

describe('the trainings list', () => {
  it('opens the row a worker links to, on the page that holds it, with each signature', async () => {
    const held = {
      ...heldWith(popescu, taranu),
      signatureState: 'pending',
      pendingTraineeSignatures: 1,
      pendingSignerSignatures: 1,
    };
    const detail = detailOf([popescu, taranu]);
    detail.training.records[0]!.signature = 'pending';
    detail.training.slotSignatures = { trainer: 'electronic', verifier: 'pending', admitter: null };
    mockApi({
      [`GET ${trainingsPath}`]: (url) =>
        Response.json({ ...page([held], 30), page: url.searchParams.get('open') ? 2 : 1 }),
      [`GET ${trainingsPath}/${trainingId}`]: () => Response.json(detail),
    });
    const runtime = mountApp(
      authFixture(makeSession()).client,
      `${trainingsPage}?domain=ssm&open=${trainingId}`
    );
    const details = await screen.findByTestId('training-details');
    expect(requests('GET', trainingsPath)[0]!.url.searchParams.get('open')).toBe(trainingId);
    await waitFor(() => expect(runtime.router.state.location.search).toMatchObject({ page: 2 }));
    expect(screen.getByTestId('trainings-open').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('trainings-signatures').textContent).toBe('2 de semnat');
    expect(
      within(details)
        .getAllByTestId('training-details-slot')
        .map((slot) => slot.textContent)
    ).toEqual(['Semnat', 'De semnat']);
    const attendees = within(details).getAllByTestId('trainings-attendee');
    expect(attendees.map((link) => link.textContent)).toEqual(['Popescu Ion', 'Țăranu Ștefan']);
    expect(attendees[1]!.getAttribute('href')).toBe(`${employeesPage}/${taranu.id}/instruire/ssm`);
    expect(
      within(details)
        .getAllByTestId('trainings-attendee-signature')
        .map((state) => state.textContent)
    ).toEqual(['De semnat', 'Semnat de mână']);
  });

  it('searches attendees by name and filters by the period, kept as two keys', async () => {
    mockApi({ [`GET ${trainingsPath}`]: () => Response.json(page([heldWith(popescu)], 4)) });
    const runtime = mountApp(
      authFixture(makeSession()).client,
      `${trainingsPage}?from=2026-01-01&to=2026-10-31`
    );
    const strip = await screen.findByTestId('trainings-applied-filters');
    expect(within(strip).getByTestId('trainings-applied-filters-period').textContent).toContain(
      '01.01.2026 – 31.10.2026'
    );
    await waitFor(() =>
      expect(screen.getByTestId('trainings-count').textContent).toBe('1 din 4 instruiri')
    );
    const asked = requests('GET', trainingsPath).at(-1)!.url.searchParams;
    expect([asked.get('from'), asked.get('to')]).toEqual(['2026-01-01', '2026-10-31']);

    const user = userEvent.setup();
    await user.type(screen.getByTestId('trainings-search'), 'Țăranu');
    await waitFor(() =>
      expect(requests('GET', trainingsPath).at(-1)!.url.searchParams.get('q')).toBe('Țăranu')
    );
    await user.click(within(strip).getByTestId('trainings-applied-filters-period-remove'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ q: 'Țăranu' }));
  });

  it("filters a worker's own trainings by the period, here, keeping the count of all", async () => {
    mockApi({
      [`GET ${employeePath}/training-records`]: () =>
        Response.json({ items: [periodicRecord, workplaceRecord] }),
    });
    mountApp(authFixture(makeSession()).client, `${employeePage}/instruire/ssm?from=2026-01-01`);
    const items = await screen.findAllByTestId('training-record-item');
    expect(items).toHaveLength(1);
    expect(within(items[0]!).getByText('Periodică')).toBeTruthy();
    expect(screen.getByTestId('training-records-count').textContent).toBe('1 din 2 instruiri');
    const user = userEvent.setup();
    await user.click(screen.getByTestId('training-records-applied-filters-clear'));
    await waitFor(() => expect(screen.getAllByTestId('training-record-item')).toHaveLength(2));
  });
});
