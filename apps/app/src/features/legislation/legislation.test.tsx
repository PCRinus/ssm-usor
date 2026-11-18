import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LatestLegalCheckRunResponseRun, MeResponse } from '@/api/generated/api';
import { bodyOf, installFetchMock, mockApi, requestsTo } from '@/test/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { mountApp } from '@/test/mount';
import { meRecord, meResponse, organizationId } from '@/test/records';

import { summaryPollMs } from './regenerations-context';

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

const lawChangeId = '4f0d9a1e-6b2c-4c1d-9e3f-2a1b0c9d8e7f';

const acts = [
  {
    id: 'lege-319-2006',
    name: 'Legea 319/2006',
    portalId: 73772,
    portalStatus: 'in_force',
    verifiedConsolidatedOn: '2025-11-03',
    lastConsolidatedOn: '2026-09-12',
    lastAmendingAct: 'Legea 145/2026',
    lastCheckedAt: '2026-10-06T06:12:00Z',
    checkedByHandOn: null,
    subject: 'a securității și sănătății în muncă',
    domains: ['ssm'],
    citedIn: { documents: 12, quotes: 66 },
    openChange: { id: lawChangeId, outcome: 'quote_differs' },
  },
  {
    id: 'hg-1425-2006',
    name: 'H.G. 1425/2006',
    portalId: 77095,
    portalStatus: 'in_force',
    verifiedConsolidatedOn: '2025-11-03',
    lastConsolidatedOn: '2025-11-03',
    lastAmendingAct: null,
    lastCheckedAt: '2026-10-06T06:12:00Z',
    checkedByHandOn: null,
    subject:
      'pentru aprobarea Normelor metodologice de aplicare a prevederilor Legii securității și sănătății în muncă nr. 319/2006',
    domains: ['ssm'],
    citedIn: { documents: 14, quotes: 121 },
    openChange: null,
  },
  {
    id: 'lege-53-2003',
    name: 'Legea 53/2003',
    portalId: 41625,
    portalStatus: 'repealed',
    verifiedConsolidatedOn: '2024-01-10',
    lastConsolidatedOn: '2024-01-10',
    lastAmendingAct: null,
    lastCheckedAt: null,
    checkedByHandOn: '2026-10-07',
    subject: 'Codul muncii',
    domains: ['ssm'],
    citedIn: { documents: 5, quotes: 43 },
    openChange: null,
  },
  {
    id: 'omai-163-2007',
    name: 'OMAI 163/2007',
    portalId: null,
    portalStatus: null,
    verifiedConsolidatedOn: null,
    lastConsolidatedOn: null,
    lastAmendingAct: null,
    lastCheckedAt: null,
    checkedByHandOn: null,
    subject: 'pentru aprobarea Normelor generale de apărare împotriva incendiilor',
    domains: ['su'],
    citedIn: { documents: 17, quotes: 80 },
    openChange: null,
  },
  {
    id: 'lege-307-2006',
    name: 'Legea 307/2006',
    portalId: 75090,
    portalStatus: 'in_force',
    verifiedConsolidatedOn: null,
    lastConsolidatedOn: '2026-05-08',
    lastAmendingAct: null,
    lastCheckedAt: '2026-10-06T06:12:00Z',
    checkedByHandOn: null,
    subject: 'privind apărarea împotriva incendiilor',
    domains: ['ssm', 'su'],
    citedIn: { documents: 16, quotes: 20 },
    openChange: { id: '9e8d7c6b-5a49-4382-9172-6a5b4c3d2e1f', outcome: null },
  },
  {
    id: 'omai-106-2007',
    name: 'OMAI 106/2007',
    portalId: 80731,
    portalStatus: 'in_force',
    verifiedConsolidatedOn: null,
    lastConsolidatedOn: null,
    lastAmendingAct: null,
    lastCheckedAt: '2026-10-06T06:12:00Z',
    checkedByHandOn: null,
    subject: 'pentru aprobarea Criteriilor de stabilire a consiliilor locale',
    domains: ['su'],
    citedIn: { documents: 4, quotes: 0 },
    openChange: null,
  },
  {
    id: 'lege-126-1995',
    name: 'Legea 126/1995',
    portalId: 6350,
    portalStatus: 'in_force',
    verifiedConsolidatedOn: '2026-03-27',
    lastConsolidatedOn: '2026-03-27',
    lastAmendingAct: null,
    lastCheckedAt: '2026-10-06T06:12:00Z',
    checkedByHandOn: null,
    subject: 'privind regimul materiilor explozive',
    domains: [],
    citedIn: { documents: 0, quotes: 0 },
    openChange: null,
  },
];

const unassessed = {
  outcome: null,
  comparedWith: null,
  assessedAt: null,
  amendingActs: [],
  amendedUnits: [],
  passages: [],
  updatedDocuments: [],
};

const helmetBefore =
  '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte casca de protecție omologată.';
const helmetAfter =
  '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte pe cap cască de protecție omologată pentru această categorie de vehicul, cu elementele de siguranță cuplate în mod corespunzător.';

const helmetPassage = {
  id: 'a1b2c3d4-0000-4000-8000-000000000001',
  templateFile: '2.2_general_training_material.docx',
  document: {
    typeKey: 'general_training_material',
    title: 'Material de instruire introductiv-generală',
  },
  citationForm: 'quote',
  locator: 'Art. 36 alin. (1) – (3)',
  unit: 'Art. 36 alin. (2)',
  status: 'changed',
  oldText: helmetBefore,
  newText: helmetAfter,
  hunks: [],
};

const roadChange = {
  id: '3e9c8b0d-5a1b-4b0c-8d2e-19a0b9c8d7e6',
  act: { id: 'oug-195-2002', name: 'O.U.G. 195/2002', portalId: 41006 },
  seenAt: '2026-11-07T06:12:00Z',
  consolidatedOn: '2026-11-06',
  amendingAct: null,
  resolution: 'open',
  resolvedAt: null,
  resolvedByNote: null,
  outcome: 'quote_differs',
  comparedWith: '2026-08-25',
  assessedAt: '2026-11-13T03:18:00Z',
  amendingActs: [{ name: 'Legea 207/2026', adoptedOn: '2026-11-03' }],
  amendedUnits: [
    {
      unit: 'Art. 36 alin. (2)',
      operation: 'modified',
      date: '2026-11-06',
      amendingAct: 'Legea 207/2026',
    },
  ],
  passages: [helmetPassage],
  updatedDocuments: [],
};

const changes = [
  {
    id: lawChangeId,
    act: { id: 'lege-319-2006', name: 'Legea 319/2006', portalId: 73772 },
    seenAt: '2026-10-06T06:12:00Z',
    consolidatedOn: '2026-09-12',
    amendingAct: 'Legea 145/2026',
    resolution: 'open',
    resolvedAt: null,
    resolvedByNote: null,
    ...unassessed,
  },
  {
    id: '5a1e0b2f-7c3d-4d2e-8f40-3b2c1d0e9f8a',
    act: { id: 'hg-1425-2006', name: 'H.G. 1425/2006', portalId: 77095 },
    seenAt: '2026-08-01T06:12:00Z',
    consolidatedOn: '2026-07-20',
    amendingAct: 'H.G. 900/2026',
    resolution: 'no_impact',
    resolvedAt: '2026-08-01T06:13:00Z',
    resolvedByNote: null,
    ...unassessed,
  },
  {
    id: '6b2f1c3a-8d4e-4e3f-9a51-4c3d2e1f0a9b',
    act: { id: 'lege-319-2006', name: 'Legea 319/2006', portalId: 73772 },
    seenAt: '2026-06-02T06:12:00Z',
    consolidatedOn: '2026-05-30',
    amendingAct: 'O.U.G. 12/2026',
    resolution: 'template_version',
    resolvedAt: '2026-06-10T09:00:00Z',
    resolvedByNote: 'Articolul 20 este preluat în noua formulare.',
    ...unassessed,
  },
];

const succeeded: NonNullable<LatestLegalCheckRunResponseRun> = {
  id: '7c3a2d4b-9e5f-4f40-8b62-5d4e3f2a1b0c',
  startedAt: hoursAgo(3),
  finishedAt: hoursAgo(3),
  status: 'succeeded',
  actsChecked: 14,
  changesFound: 0,
  actsSkipped: 1,
  errors: null,
};

const jobId = '8d4b3e5c-0f6a-4a51-9c73-6e5f4a3b2c1d';
const firstAidBehind = {
  typeKey: 'decision_first_aid',
  title: 'Decizia privind responsabilii cu primul ajutor',
  set: 'occupational_safety',
  newestVersion: { version: 4, kind: 'correction', note: 'Diacriticele din antet sunt corectate.' },
  legalChanges: [] as { id: string; actName: string }[],
  runningJobId: null as string | null,
  clients: [
    {
      documentId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      clientId: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
      clientName: 'ALFA CONSTRUCT SRL',
      version: 3,
      editedDraft: false,
      behindTemplate: true,
      instructionChanges: [],
      status: 'issued',
      issueDate: '2026-10-14',
    },
    {
      documentId: '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f',
      clientId: '4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f80',
      clientName: 'BETA CAFE SRL',
      version: 2,
      editedDraft: true,
      behindTemplate: true,
      instructionChanges: [],
      status: 'draft',
      issueDate: '2026-09-02',
    },
  ],
};

const extinguisherBehind = {
  typeKey: 'fire_extinguisher_register',
  title: 'Registru de evidență a controlului stingătoarelor de incendiu',
  set: 'fire_safety',
  newestVersion: { version: 2, kind: 'legal', note: 'Rubricile urmează OMAI 163/2007.' },
  legalChanges: [{ id: lawChangeId, actName: 'OMAI 163/2007' }],
  runningJobId: null as string | null,
  clients: [
    {
      documentId: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
      clientId: firstAidBehind.clients[0]!.clientId,
      clientName: 'ALFA CONSTRUCT SRL',
      version: 1,
      editedDraft: false,
      behindTemplate: true,
      instructionChanges: [],
      status: 'draft',
      issueDate: '2026-10-14',
    },
  ],
};

const actNamesInTable = () =>
  screen
    .getAllByTestId('watched-act')
    .map((row) => within(row).getByTestId('watched-act-name').textContent);

const job = (overrides: Record<string, unknown> = {}) => ({
  job: {
    id: jobId,
    typeKey: 'decision_first_aid',
    requestedAt: hoursAgo(0),
    finishedAt: null,
    total: 2,
    done: 0,
    skipped: 0,
    failed: 0,
    items: [
      {
        clientId: firstAidBehind.clients[0]!.clientId,
        clientName: 'ALFA CONSTRUCT SRL',
        status: 'queued',
        detail: null,
        missing: [] as string[],
      },
      {
        clientId: firstAidBehind.clients[1]!.clientId,
        clientName: 'BETA CAFE SRL',
        status: 'queued',
        detail: null,
        missing: [] as string[],
      },
    ],
    ...overrides,
  },
});

const finishedJob = job({
  finishedAt: hoursAgo(0),
  done: 1,
  skipped: 1,
  items: [
    {
      clientId: firstAidBehind.clients[0]!.clientId,
      clientName: 'ALFA CONSTRUCT SRL',
      status: 'done',
      detail: null,
      missing: [],
    },
    {
      clientId: firstAidBehind.clients[1]!.clientId,
      clientName: 'BETA CAFE SRL',
      status: 'skipped',
      detail: 'Ciorna are modificări făcute de mână, pe care regenerarea le-ar pierde.',
      missing: [],
    },
  ],
});

const lackingJob = job({
  finishedAt: hoursAgo(0),
  skipped: 1,
  failed: 1,
  items: [
    {
      clientId: firstAidBehind.clients[0]!.clientId,
      clientName: 'ALFA CONSTRUCT SRL',
      status: 'failed',
      detail:
        'Lipsesc date de care documentul are nevoie. Completează-le pe pagina clientului, apoi regenerează documentul.',
      missing: ['client.trainingSchedule', 'positions.equipment'],
    },
    finishedJob.job.items[1],
  ],
});

const alfaReadiness = {
  ready: false,
  missing: ['client.trainingSchedule', 'responsible.first_aid', 'positions.equipment'],
  currentEmployeeCount: 4,
  hints: [],
  workersRepresentativeClash: null,
  undecidedJobPositions: [
    { id: '6c7d8e9f-0a1b-4c2d-8e3f-4a5b6c7d8e9f', name: 'Sudor', undecided: ['equipment'] },
  ],
  incompleteRiskEvaluations: [],
};

const runningEntry = (overrides: Record<string, unknown> = {}) => ({
  id: jobId,
  typeKey: 'decision_first_aid',
  set: 'occupational_safety',
  requestedBy: 'user-one',
  total: 1,
  done: 0,
  skipped: 0,
  failed: 0,
  ...overrides,
});

// `before` answers the summary's running jobs in turn until a regeneration is asked for, `after`
// from then on; the documents list turns to `afterJob` once the jobs are no longer running.
function mockLegislationApi({
  run = succeeded as LatestLegalCheckRunResponseRun,
  behind = [] as unknown[],
  afterJob = [] as unknown[],
  start = (() => Response.json(job(), { status: 201 })) as () => Response,
  startAll = (() =>
    Response.json({ jobs: [runningEntry()], notStarted: [] }, { status: 201 })) as () => Response,
  before = [[]] as unknown[][],
  after = [[]] as unknown[][],
  read = (() => Response.json(finishedJob)) as () => Response,
  readiness = alfaReadiness as unknown,
  legalChanges = changes as unknown[],
  watchedActs = acts as unknown[],
  me = specialist as MeResponse,
} = {}) {
  let started = false;
  let sawRunning = false;
  let jobDone = false;
  let beforeCount = 0;
  let afterCount = 0;
  const pick = (answers: unknown[][], index: number) =>
    answers[Math.min(index, answers.length - 1)] ?? [];
  mockApi(
    (init, { pathname }) => {
      const method = init?.method ?? 'GET';
      if (pathname === '/legislation/acts') return Response.json({ items: watchedActs });
      if (pathname === '/legislation/changes') return Response.json({ items: legalChanges });
      if (pathname === '/legislation/runs/latest') return Response.json({ run });
      if (pathname === '/documents/behind') {
        return Response.json({ items: jobDone ? afterJob : behind });
      }
      if (pathname === '/documents/behind/summary') {
        const running = started ? pick(after, afterCount++) : pick(before, beforeCount++);
        if (running.length > 0) sawRunning = true;
        else if (sawRunning) jobDone = true;
        const items = (jobDone ? afterJob : behind) as (typeof firstAidBehind)[];
        const count = (set: string) =>
          items
            .filter((type) => type.set === set)
            .reduce((total, type) => total + type.clients.length, 0);
        return Response.json({
          counts: {
            occupational_safety: count('occupational_safety'),
            fire_safety: count('fire_safety'),
          },
          running,
        });
      }
      if (pathname === '/documents/behind/regenerate' && method === 'POST') {
        started = true;
        return start();
      }
      if (pathname === '/documents/behind/regenerate-all' && method === 'POST') {
        started = true;
        return startAll();
      }
      if (pathname === `/clients/${firstAidBehind.clients[0]!.clientId}/documents/readiness`) {
        return Response.json(readiness);
      }
      if (pathname === `/documents/regeneration-jobs/${jobId}`) {
        jobDone = true;
        return read();
      }
    },
    { me }
  );
}

const specialist = meRecord({
  profile: { ...meResponse.profile, fullName: 'Ana Ionescu' },
  membership: { ...meResponse.membership, role: 'specialist' },
});

const mount = (path = '/legislatie') => mountApp(authFixture(makeSession()).client, path);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

installFetchMock();

const failedRun: NonNullable<LatestLegalCheckRunResponseRun> = {
  ...succeeded,
  status: 'failed',
  errors: [
    {
      act: 'lege-319-2006',
      kind: 'http_status',
      status: 520,
      message: 'https://legislatie.just.ro/Public/DetaliiDocument/73772 answered 520.',
    },
    {
      act: 'lege-53-2003',
      kind: 'http_status',
      status: 520,
      message: 'https://legislatie.just.ro/Public/DetaliiDocument/41625 answered 520.',
    },
    {
      act: 'hg-1425-2006',
      kind: 'http_status',
      status: 522,
      message: 'https://legislatie.just.ro/Public/DetaliiDocument/77095 answered 522.',
    },
    {
      act: 'omai-163-2007',
      kind: 'fetch',
      message: 'https://legislatie.just.ro/Public/DetaliiDocument/1 could not be fetched: timeout',
    },
    { act: 'lege-unknown-2001', message: 'Page 1 has no act heading (S_DEN).' } as never,
  ],
};

describe('the Legislație page', () => {
  it('opens on the SSM documents to update, with the SU ones, the changes and the acts beside it', async () => {
    mockLegislationApi({ behind: [firstAidBehind] });
    const runtime = mount();

    expect(await screen.findByTestId('legislation-page')).toBeTruthy();
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/legislatie/documente-ssm')
    );
    expect(screen.getByTestId('nav-legislatie').getAttribute('aria-current')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Legislație');
    const tabs = screen.getAllByTestId('legislation-section');
    await waitFor(() =>
      expect(tabs.map((tab) => tab.textContent)).toEqual([
        'Documente SSM de actualizat2 documente de actualizat',
        'Documente SU de actualizat',
        'Modificări',
        'Acte urmărite',
      ])
    );
    expect(tabs[0]!.getAttribute('aria-current')).toBe('page');
    expect(await screen.findByTestId('behind-table')).toBeTruthy();
  });

  it('sends the address of the tab before the split to the SSM documents', async () => {
    mockLegislationApi();
    const runtime = mount('/legislatie/documente');

    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/legislatie/documente-ssm')
    );
  });

  it('opens Legislație in the navigation on its tabs, with the count on the tab that has one', async () => {
    mockLegislationApi({ behind: [firstAidBehind] });
    const runtime = mount();
    const user = userEvent.setup();

    const group = await screen.findByTestId('nav-legislatie-group');
    const entries = within(group).getAllByTestId('nav-sub-entry');
    await waitFor(() =>
      expect(entries.map((entry) => [entry.textContent, entry.getAttribute('href')])).toEqual([
        ['SSM de actualizat2 documente de actualizat', '/legislatie/documente-ssm'],
        ['SU de actualizat', '/legislatie/documente-su'],
        ['Modificări', '/legislatie/modificari'],
        ['Acte urmărite', '/legislatie/acte'],
      ])
    );
    expect(entries[0]!.getAttribute('aria-current')).toBe('page');
    expect(screen.queryByTestId('nav-legislatie-count')).toBeNull();

    await user.click(entries[3]!);
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/legislatie/acte'));
    expect(entries[3]!.getAttribute('aria-current')).toBe('page');
    expect(entries[0]!.getAttribute('aria-current')).toBeNull();

    await user.click(screen.getByTestId('nav-dashboard'));
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/dashboard'));
    await waitFor(() => expect(screen.queryByTestId('nav-legislatie-group')).toBeNull());
    expect(screen.getByTestId('nav-legislatie-count').textContent).toBe(
      '2 documente de actualizat'
    );
  });

  it('keeps the title and the last check above every tab', async () => {
    mockLegislationApi();
    const runtime = mount();
    const user = userEvent.setup();

    await user.click((await screen.findAllByTestId('legislation-section'))[2]!);
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/legislatie/modificari')
    );
    expect(await screen.findAllByTestId('legal-change')).toHaveLength(3);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Legislație');
    expect(screen.getByTestId('last-check-ok')).toBeTruthy();

    await user.click(screen.getAllByTestId('legislation-section')[3]!);
    expect(await screen.findAllByTestId('watched-act')).toHaveLength(7);
    expect(screen.getByTestId('last-check-ok')).toBeTruthy();
    expect(screen.queryByTestId('legal-change')).toBeNull();
  });

  it('says in one line when the acts were read, how many, the new changes and those in analysis', async () => {
    mockLegislationApi();
    mount();

    expect((await screen.findByTestId('last-check-ok')).textContent).toMatch(
      /^Verificat (azi|ieri) la \d{2}:\d{2}$/
    );
    expect(screen.getByTestId('last-check-acts').textContent).toBe('14');
    expect(screen.getByTestId('last-check-new-changes').textContent).toBe('niciuna');
    const analysis = await screen.findByTestId('last-check-in-analysis');
    expect(analysis.textContent).toBe('2 modificări');
    expect(analysis.getAttribute('href')).toBe('/legislatie/modificari');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('links the new changes the last check found', async () => {
    mockLegislationApi({ run: { ...succeeded, actsChecked: 50, changesFound: 2 } });
    mount();

    const found = await screen.findByTestId('last-check-new-changes');
    expect(found.textContent).toBe('2');
    expect(found.getAttribute('href')).toBe('/legislatie/modificari');
  });

  it('warns when the check never ran', async () => {
    mockLegislationApi({ run: null });
    mount();

    expect((await screen.findByTestId('last-check-never')).textContent).toBe(
      'Verificarea nu a rulat încă'
    );
    expect(screen.getByTestId('last-check').textContent).toContain('Acte cititeniciunul');
  });

  it('says when a check is running and how many acts it has read', async () => {
    mockLegislationApi({
      run: { ...succeeded, status: 'running', finishedAt: null, actsChecked: 5 },
    });
    mount();

    expect((await screen.findByTestId('last-check-running')).textContent).toMatch(
      /^Verificarea rulează din \d{2}:\d{2}$/
    );
    await waitFor(() => expect(screen.getByTestId('last-check-acts').textContent).toBe('5 din 7'));
  });

  it('says in one line that the last check failed, with the causes behind "Detalii"', async () => {
    mockLegislationApi({ run: { ...failedRun, startedAt: hoursAgo(0), actsChecked: 2 } });
    mount();
    const user = userEvent.setup();

    expect((await screen.findByTestId('last-check-failed')).textContent).toBe(
      'Verificarea de azi nu a reușit'
    );
    await waitFor(() => expect(screen.getByTestId('last-check-acts').textContent).toBe('2 din 7'));
    const details = screen.getByTestId('last-check-details');
    const panel = document.getElementById(details.getAttribute('aria-controls')!)!;
    expect(details.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);

    await user.click(details);
    expect(details.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    await waitFor(() =>
      expect(
        within(panel)
          .getAllByTestId('last-check-failure-group')
          .map((group) => [
            group.querySelector('p')!.textContent,
            within(group).queryByTestId('last-check-failure-acts')?.textContent,
          ])
      ).toEqual([
        ['Portalul a răspuns 520 (2 acte)', 'Legea 53/2003, Legea 319/2006'],
        ['Portalul a răspuns 522 (1 act)', 'H.G. 1425/2006'],
        ['Portalul nu a răspuns (1 act)', 'OMAI 163/2007'],
        ['Altă eroare (1 act)', 'lege-unknown-2001'],
      ])
    );
    expect(panel.textContent).not.toMatch(/https?:|answered|fetched/);
  });

  it('says that a check stopped as a whole, without acts', async () => {
    mockLegislationApi({
      run: {
        ...succeeded,
        status: 'failed',
        errors: [{ act: null, kind: 'other', message: 'Could not save the acts.' }],
      },
    });
    mount();
    const user = userEvent.setup();

    await screen.findByTestId('last-check-failed');
    await user.click(screen.getByTestId('last-check-details'));
    expect(screen.getByTestId('last-check-failure-group').textContent).toBe(
      'Verificarea s-a oprit înainte de final'
    );
  });

  it('warns when the acts were last read more than two days ago', async () => {
    mockLegislationApi({
      run: { ...succeeded, startedAt: hoursAgo(80), finishedAt: hoursAgo(80) },
    });
    mount();

    expect((await screen.findByTestId('last-check-stale')).textContent).toMatch(
      /^Ultima verificare: \d{1,2} \S+( \d{4})?, acum \d zile$/
    );
  });

  it('says the documents of a set are up to date, keeping both tabs', async () => {
    mockLegislationApi({ behind: [extinguisherBehind] });
    mount();

    expect((await screen.findByTestId('documents-behind-empty')).textContent).toContain(
      'Documentele SSM sunt la zi'
    );
    expect(screen.queryByTestId('behind-regenerate-all')).toBeNull();
    expect(screen.getAllByTestId('legislation-section')).toHaveLength(4);
  });

  it('lists the documents of a set, each with its version, what changed and its clients', async () => {
    mockLegislationApi({ behind: [extinguisherBehind, firstAidBehind] });
    mount('/legislatie/documente-su');

    const [type] = await screen.findAllByTestId('behind-type');
    expect(screen.getAllByTestId('behind-type')).toHaveLength(1);
    expect(screen.getByTestId('behind-summary').textContent).toBe('1 document la 1 client');
    expect(within(type!).getByTestId('behind-title').textContent).toBe(
      'Registru de evidență a controlului stingătoarelor de incendiu'
    );
    expect(within(type!).getByTestId('behind-version').textContent).toBe(
      'Versiunea 2 · Modificare legislativă'
    );
    expect(within(type!).getByTestId('behind-note').textContent).toBe(
      'Rubricile urmează OMAI 163/2007.'
    );
    const change = within(type!).getByTestId('behind-legal-change');
    expect(change.textContent).toBe('Vezi modificarea OMAI 163/2007');
    expect(change.getAttribute('href')).toBe(`/legislatie/modificari#modificare-${lawChangeId}`);
    expect(within(type!).getByTestId('behind-clients-toggle').textContent).toBe('1 client');
  });

  it('opens the clients of a document, saying what regenerating does to each', async () => {
    mockLegislationApi({ behind: [firstAidBehind] });
    mount();
    const user = userEvent.setup();

    const toggle = await screen.findByTestId('behind-clients-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('behind-client')).toBeNull();
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).not.toBeNull();
    const clients = screen.getAllByTestId('behind-client');
    expect(clients.map((client) => client.textContent)).toEqual([
      'ALFA CONSTRUCT SRLVersiunea 3Emis pe 14.10.2026primește o ciornă nouă, de emis',
      'BETA CAFE SRLVersiunea 2Ciornă editată de mânărămâne neatinsă; o regenerezi de pe pagina clientului',
    ]);
    expect(within(clients[0]!).getByRole('link').getAttribute('href')).toBe(
      `/clienti/${firstAidBehind.clients[0]!.clientId}/documente-ssm?section=decisions&focus=decision_first_aid`
    );
  });

  it('says what moved in the instructions of a document behind them alone', async () => {
    const themesBehind = {
      typeKey: 'training_themes',
      title: 'Tematica și programul de instruire',
      set: 'occupational_safety',
      newestVersion: { version: 2, kind: 'layout', note: null },
      legalChanges: [],
      runningJobId: null,
      clients: [
        {
          ...firstAidBehind.clients[0]!,
          documentId: '6f7a8b9c-0d1e-4f2a-8b3c-4d5e6f7a8b9c',
          status: 'draft',
          behindTemplate: false,
          instructionChanges: [
            {
              code: 'module_version',
              title: 'Lucrul la înălțime',
              newestVersionAt: '2026-10-12T09:30:00+00:00',
            },
          ],
        },
      ],
    };
    mockLegislationApi({ behind: [themesBehind] });
    mount();
    const user = userEvent.setup();

    const type = await screen.findByTestId('behind-type');
    expect(within(type).getByTestId('behind-version').textContent).toBe('Instrucțiuni schimbate');
    expect(within(type).getByTestId('behind-note').textContent).toBe(
      'Instrucțiunea „Lucrul la înălțime” are o versiune nouă din 12.10.2026.'
    );
    expect(within(type).queryByTestId('behind-legal-change')).toBeNull();

    await user.click(within(type).getByTestId('behind-regenerate'));
    const dialog = await screen.findByTestId('behind-confirm-dialog');
    expect(dialog.textContent).toContain(
      'Îl refacem cu instrucțiunile de acum, cu datele de azi ale clientului.'
    );
  });

  it('takes a run still running after two days for a stale check', async () => {
    mockLegislationApi({
      run: { ...succeeded, status: 'running', startedAt: hoursAgo(80), finishedAt: null },
    });
    mount();

    expect(await screen.findByTestId('last-check-stale')).toBeTruthy();
    expect(screen.queryByTestId('last-check-running')).toBeNull();
  });

  it('regenerates one document for its clients and follows the job to its end', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockLegislationApi({
      behind: [firstAidBehind],
      after: [[runningEntry({ total: 2, done: 1 })], []],
    });
    mount();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.click(
      await screen.findByRole('button', {
        name: 'Regenerează Decizia privind responsabilii cu primul ajutor',
      })
    );
    const dialog = await screen.findByTestId('behind-confirm-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe(
      'Regenerezi Decizia privind responsabilii cu primul ajutor la 1 client?'
    );
    expect(
      within(dialog)
        .getAllByTestId('behind-confirm-line')
        .map((line) => line.textContent)
    ).toEqual([
      '1 document emis, la ALFA CONSTRUCT SRL, rămâne în vigoare. Primește o ciornă nouă, pe care o emiți de pe pagina clientului.',
      'Ciorna editată de mână de la BETA CAFE SRL rămâne neatinsă, ca să nu pierzi ce ai scris în ea.',
    ]);
    expect(within(dialog).getByTestId('behind-confirm').textContent).toBe(
      'Regenerează la 1 client'
    );
    await user.click(within(dialog).getByTestId('behind-confirm'));

    const progress = await screen.findByTestId('regeneration-progress');
    expect(bodyOf('/documents/behind/regenerate', 'POST')).toEqual({
      typeKey: 'decision_first_aid',
    });
    expect(screen.queryByTestId('behind-regenerate-all')).toBeNull();
    await waitFor(() =>
      expect(progress.textContent).toContain('Se regenerează: 1 din 2 documente')
    );
    expect(screen.getByTestId('regeneration-progress-counts').textContent).toBe(
      '1 regenerat, 0 sărite, 0 eșuate.'
    );
    expect(screen.getByTestId('behind-state').textContent).toBe('Se regenerează');
    expect(requestsTo(`/documents/regeneration-jobs/${jobId}`)).toHaveLength(0);

    await act(() => vi.advanceTimersByTimeAsync(summaryPollMs));
    const result = await screen.findByTestId('regeneration-result');
    expect(requestsTo(`/documents/regeneration-jobs/${jobId}`)).toHaveLength(1);
    expect(screen.getByTestId('regeneration-result-counts').textContent).toBe(
      'Regenerarea s-a încheiat: 1 din 2 documente'
    );
    const [drafts] = within(result).getAllByTestId('regeneration-drafts');
    expect(drafts!.textContent).toContain('ALFA CONSTRUCT SRL');
    expect(drafts!.textContent).toContain('Decizia privind responsabilii cu primul ajutor');
    expect(within(drafts!).getAllByRole('link')[0]!.getAttribute('href')).toBe(
      `/clienti/${firstAidBehind.clients[0]!.clientId}/documente-ssm`
    );
    expect(within(result).getByTestId('regeneration-left-out').textContent).toContain(
      'Ciorna are modificări făcute de mână'
    );
    await waitFor(() => expect(screen.getByTestId('documents-behind-empty')).toBeTruthy());
    expect(screen.queryByTestId('regeneration-toast')).toBeNull();

    await user.click(screen.getByTestId('regeneration-result-close'));
    expect(screen.queryByTestId('regeneration-result')).toBeNull();
  });

  it('regenerates every document of the set at once, after saying what happens to each', async () => {
    mockLegislationApi({ behind: [firstAidBehind, extinguisherBehind] });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('behind-regenerate-all'));
    const dialog = await screen.findByTestId('behind-confirm-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe(
      'Regenerezi 1 document SSM la 1 client?'
    );
    expect(dialog.textContent).toContain(
      'Le refacem pe versiunea nouă a șabloanelor și a instrucțiunilor, cu datele de azi ale clienților.'
    );
    expect(
      within(dialog)
        .getAllByTestId('behind-confirm-line')
        .map((line) => line.textContent)
    ).toEqual([
      '1 document emis, „Decizia privind responsabilii cu primul ajutor” la ALFA CONSTRUCT SRL, rămâne în vigoare. Primește o ciornă nouă, pe care o emiți de pe pagina clientului.',
      'Ciorna editată de mână a documentului „Decizia privind responsabilii cu primul ajutor”, la BETA CAFE SRL, rămâne neatinsă, ca să nu pierzi ce ai scris în ea.',
    ]);
    await user.click(within(dialog).getByTestId('behind-confirm'));

    expect(bodyOf('/documents/behind/regenerate-all', 'POST')).toEqual({
      set: 'occupational_safety',
    });
    expect(await screen.findByTestId('regeneration-result')).toBeTruthy();
  });

  it('names the documents that did not start when the queue failed part way', async () => {
    mockLegislationApi({
      behind: [firstAidBehind],
      startAll: () =>
        Response.json({ jobs: [runningEntry()], notStarted: ['event_registers'] }, { status: 201 }),
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('behind-regenerate-all'));
    await user.click(await screen.findByTestId('behind-confirm'));

    expect((await screen.findByTestId('behind-not-started')).textContent).toBe(
      'Nu au pornit: Registrele de evidență a evenimentelor. Regenerează-le din nou.'
    );
  });

  it('follows the regeneration already under way when the API says it is running', async () => {
    mockLegislationApi({
      behind: [firstAidBehind],
      startAll: () =>
        Response.json(
          {
            error: 'conflict',
            message: 'Documentele se regenerează deja. Așteaptă să se termine.',
            reason: 'regeneration_running',
          },
          { status: 409 }
        ),
      after: [[runningEntry({ requestedBy: 'colleague' })]],
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('behind-regenerate-all'));
    await user.click(await screen.findByTestId('behind-confirm'));

    expect(await screen.findByTestId('regeneration-progress')).toBeTruthy();
    expect(screen.queryByTestId('behind-regenerate-error')).toBeNull();
  });

  it('follows the jobs that started when the request itself failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockLegislationApi({
      behind: [firstAidBehind],
      startAll: () => Response.json({ error: 'internal' }, { status: 500 }),
      after: [[runningEntry()]],
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('behind-regenerate-all'));
    await user.click(await screen.findByTestId('behind-confirm'));

    expect(await screen.findByTestId('regeneration-progress')).toBeTruthy();
    expect(screen.queryByTestId('behind-regenerate-error')).toBeNull();
  });

  it('follows the jobs an admin started as the member when the request itself failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockLegislationApi({
      behind: [firstAidBehind],
      me: {
        ...specialist,
        impersonation: {
          targetMemberId: 'member-two',
          targetOrganizationId: organizationId,
          expiresAt: '2099-01-01T00:00:00Z',
          targetName: 'Ana Ionescu',
        },
      },
      startAll: () => Response.json({ error: 'internal' }, { status: 500 }),
      after: [[runningEntry({ requestedBy: 'member-two' })]],
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('behind-regenerate-all'));
    await user.click(await screen.findByTestId('behind-confirm'));

    expect(await screen.findByTestId('regeneration-progress')).toBeTruthy();
    expect(screen.queryByTestId('behind-regenerate-error')).toBeNull();
  });

  it('tells on another page that the regeneration ended, leading back to its result', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockLegislationApi({ behind: [firstAidBehind], after: [[runningEntry()], []] });
    const runtime = mount();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.click(await screen.findByTestId('behind-regenerate-all'));
    await user.click(await screen.findByTestId('behind-confirm'));
    expect(await screen.findByTestId('regeneration-progress')).toBeTruthy();
    await user.click(screen.getAllByTestId('legislation-section')[3]!);
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/legislatie/acte'));

    await act(() => vi.advanceTimersByTimeAsync(summaryPollMs));
    expect((await screen.findByTestId('regeneration-toast-title')).textContent).toBe(
      '1 document SSM regenerat'
    );
    expect(screen.getByTestId('regeneration-toast-description').textContent).toBe(
      '1 ciornă nouă de emis, la 1 client.'
    );
    expect(screen.getByTestId('regeneration-toast-shortfall').textContent).toBe(
      '1 nu s-a putut regenera.'
    );

    await user.click(screen.getByRole('button', { name: 'Vezi rezultatul' }));
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/legislatie/documente-ssm')
    );
    expect(await screen.findByTestId('regeneration-result')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('regeneration-toast')).toBeNull());
  });

  it('picks up after a reload the regeneration this tab started', async () => {
    sessionStorage.setItem(
      `ssm-usor:regenerations:user-one:${organizationId}`,
      JSON.stringify([
        {
          id: 'regeneration-before-reload',
          set: 'occupational_safety',
          scope: 'all',
          jobIds: [jobId],
          titles: { decision_first_aid: firstAidBehind.title },
          edited: 1,
          notStarted: [],
          startedAt: 0,
        },
      ])
    );
    mockLegislationApi({ behind: [firstAidBehind] });
    mount('/legislatie/acte');

    expect((await screen.findByTestId('regeneration-toast-title')).textContent).toBe(
      '1 document SSM regenerat'
    );
    await waitFor(() =>
      expect(sessionStorage.getItem(`ssm-usor:regenerations:user-one:${organizationId}`)).toBeNull()
    );
  });

  it('lets go of a job it can no longer read instead of following it for ever', async () => {
    mockLegislationApi({
      behind: [firstAidBehind],
      read: () =>
        Response.json(
          { error: 'not_found', message: 'Această regenerare nu există.' },
          { status: 404 }
        ),
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('behind-regenerate-all'));
    await user.click(await screen.findByTestId('behind-confirm'));

    await waitFor(() =>
      expect(requestsTo(`/documents/regeneration-jobs/${jobId}`)).toHaveLength(1)
    );
    await waitFor(() => expect(screen.queryByTestId('regeneration-progress')).toBeNull());
    expect(screen.queryByTestId('regeneration-result')).toBeNull();
    expect(screen.getByTestId('behind-regenerate-all')).toBeTruthy();
  });

  it('says so when the result of a job cannot be read', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockLegislationApi({
      behind: [firstAidBehind],
      read: () => Response.json({ error: 'internal' }, { status: 500 }),
    });
    mount();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.click(await screen.findByTestId('behind-regenerate-all'));
    await user.click(await screen.findByTestId('behind-confirm'));
    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect((await screen.findByTestId('regeneration-result-unread')).textContent).toBe(
      'Nu am putut afla rezultatul unui document; dacă e încă în urmă, apare în listă.'
    );
  });

  it("refreshes the list when another member's regeneration ends while the tab is open", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockLegislationApi({
      behind: [firstAidBehind],
      before: [[runningEntry({ requestedBy: 'colleague', total: 2, done: 1 })], []],
    });
    mount();

    expect((await screen.findByTestId('regeneration-progress')).textContent).toContain(
      'Se regenerează: 1 din 2 documente'
    );
    expect(screen.queryByTestId('behind-regenerate-all')).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(summaryPollMs));
    expect(await screen.findByTestId('documents-behind-empty')).toBeTruthy();
    expect(screen.queryByTestId('regeneration-progress')).toBeNull();
    expect(screen.queryByTestId('regeneration-toast')).toBeNull();
  });

  it('lists what a client failed for as the rows of the generation form, each starting the way back to its document', async () => {
    mockLegislationApi({
      behind: [firstAidBehind],
      read: () => Response.json(lackingJob),
    });
    const runtime = mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('behind-regenerate-all'));
    await user.click(await screen.findByTestId('behind-confirm'));
    expect((await screen.findByTestId('regeneration-result-counts')).textContent).toBe(
      'Regenerarea s-a încheiat: 0 din 2 documente'
    );
    expect(screen.getByTestId('regeneration-left-out').textContent).toContain('BETA CAFE SRL');
    const lacking = screen.getByTestId('regeneration-lacking');
    expect(within(lacking).getByTestId('regeneration-lacking-client').textContent).toBe(
      'ALFA CONSTRUCT SRL'
    );
    expect(lacking.textContent).toContain(
      'Decizia privind responsabilii cu primul ajutor nu s-a regenerat'
    );
    const rows = await within(lacking).findAllByTestId('regeneration-missing-row');
    const alfaId = firstAidBehind.clients[0]!.clientId;
    expect(rows.map((row) => [row.textContent, row.getAttribute('href')])).toEqual([
      [
        'Programul instruirii periodiceIntervalele pe categorii, prima lună, durata și zilele.',
        `/clienti/${alfaId}/instruire?focus=training-schedule`,
      ],
      [
        'Sudor · echipament de protecțieArticolele postului, sau că nu are nevoie de echipament.',
        `/clienti/${alfaId}/posturi/6c7d8e9f-0a1b-4c2d-8e3f-4a5b6c7d8e9f#protective-equipment`,
      ],
    ]);

    vi.spyOn(console, 'error').mockImplementation(() => {});
    await user.click(rows[0]!);
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(`/clienti/${alfaId}/instruire`)
    );
    expect(JSON.parse(sessionStorage.getItem('ssm-usor:way-back')!)).toMatchObject({
      clientId: alfaId,
      to: 'document',
      typeKey: 'decision_first_aid',
    });
  });

  it('shows the reason the API gives when a regeneration cannot start', async () => {
    mockLegislationApi({
      behind: [firstAidBehind],
      start: () =>
        Response.json(
          {
            error: 'conflict',
            message:
              'Fiecare ciornă a acestui document e editată de mână. Regenerează-le de pe pagina fiecărui client.',
            reason: 'nothing_behind',
          },
          { status: 409 }
        ),
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('behind-regenerate'));
    await user.click(await screen.findByTestId('behind-confirm'));

    expect((await screen.findByTestId('behind-regenerate-error')).textContent).toBe(
      'Fiecare ciornă a acestui document e editată de mână. Regenerează-le de pe pagina fiecărui client.'
    );
    expect(screen.queryByTestId('behind-confirm-dialog')).toBeNull();
  });

  it('lists the legal changes by how they were resolved', async () => {
    mockLegislationApi();
    mount('/legislatie/modificari');

    await waitFor(() => expect(screen.getAllByTestId('legal-change')).toHaveLength(3));
    const [open, noImpact, answered] = screen.getAllByTestId('legal-change');
    expect(within(open!).getByTestId('legal-change-resolution').textContent).toBe('În analiză');
    expect(open!.textContent).toContain('Forma consolidată din 12.09.2026, după Legea 145/2026.');
    expect(within(noImpact!).getByTestId('legal-change-resolution').textContent).toBe(
      'Fără impact asupra documentelor'
    );
    expect(within(answered!).getByTestId('legal-change-resolution').textContent).toBe(
      'Șablon actualizat'
    );
    expect(within(answered!).getByTestId('legal-change-note').textContent).toBe(
      'Articolul 20 este preluat în noua formulare.'
    );
  });

  it('says a change not yet compared with the verified form has not been analysed yet', async () => {
    mockLegislationApi();
    mount('/legislatie/modificari');

    await waitFor(() => expect(screen.getAllByTestId('legal-change')).toHaveLength(3));
    const [open, noImpact, answered] = screen.getAllByTestId('legal-change');
    expect(within(open!).getByTestId('legal-change-status').textContent).toBe(
      'Modificarea nu a fost încă analizată.'
    );
    expect(within(noImpact!).queryByTestId('legal-change-status')).toBeNull();
    expect(within(answered!).queryByTestId('legal-change-status')).toBeNull();
    expect(within(open!).queryByTestId('legal-change-passages')).toBeNull();
    expect(within(open!).queryByTestId('legal-change-units')).toBeNull();
  });

  it("shows what a change amended and the law's old and new text of the passage it touched", async () => {
    mockLegislationApi({ legalChanges: [roadChange] });
    mount('/legislatie/modificari');

    const change = await screen.findByTestId('legal-change');
    expect(change.textContent).toContain('Forma consolidată din 06.11.2026, după Legea 207/2026.');
    expect(within(change).getByTestId('legal-change-resolution').textContent).toBe('În analiză');
    expect(within(change).getByTestId('legal-change-units').textContent).toBe(
      'Modificări:art. 36 alin. (2)'
    );
    expect(within(change).getByTestId('legal-change-status').textContent).toBe(
      'Modifică un text citat în documente.'
    );
    const passage = within(change).getByTestId('legal-change-passage');
    expect(within(passage).getByTestId('legal-change-passage-place').textContent).toBe(
      'Citat în Material de instruire introductiv-generală, art. 36 alin. (1) – (3)'
    );
    expect(passage.textContent).not.toContain('.docx');
    const diff = within(passage).getByTestId('law-diff');
    expect(diff.querySelectorAll('del')).toHaveLength(1);
    expect(diff.querySelector('del')!.textContent).toBe('eliminat: casca');
    expect([...diff.querySelectorAll('ins')].map((ins) => ins.textContent)).toEqual([
      'adăugat: pe cap cască',
      'adăugat: pentru această categorie de vehicul, cu elementele de siguranță cuplate în mod corespunzător',
    ]);
    expect(within(passage).queryByTestId('legal-change-passage-toggle')).toBeNull();
    expect(within(change).getByTestId('law-diff-legend')).toBeTruthy();
  });

  it("writes a superscript label in the law's text as the law prints it", async () => {
    mockLegislationApi({
      legalChanges: [
        {
          ...roadChange,
          passages: [
            {
              ...helmetPassage,
              unit: 'Art. 36 alin. (2^1)',
              locator: 'Art. 36 alin. (2^1)',
              oldText: '(2^1) a^1) casca de protecție;',
              newText: '(2^1) a^1) casca de protecție omologată;',
            },
          ],
        },
      ],
    });
    mount('/legislatie/modificari');

    const passage = await screen.findByTestId('legal-change-passage');
    expect(passage.textContent).not.toContain('^');
    expect(within(passage).getByTestId('law-diff').textContent).toBe(
      '(2¹) a¹) casca de protecție adăugat: omologată;'
    );
    expect(within(passage).getByTestId('legal-change-passage-place').textContent).toBe(
      'Citat în Material de instruire introductiv-generală, art. 36 alin. (2¹)'
    );
  });

  it('names a place a passage is cited once, however often the document cites it there', async () => {
    mockLegislationApi({
      legalChanges: [
        {
          ...roadChange,
          passages: ['2', '3', '4'].map((last) => ({
            ...helmetPassage,
            id: `a1b2c3d4-0000-4000-8000-00000000000${last}`,
          })),
        },
      ],
    });
    mount('/legislatie/modificari');

    const passage = await screen.findByTestId('legal-change-passage');
    expect(within(passage).getAllByTestId('legal-change-passage-place')).toHaveLength(1);
  });

  it("leaves out the legend when no passage has the law's text", async () => {
    mockLegislationApi({
      legalChanges: [
        {
          ...roadChange,
          passages: [{ ...helmetPassage, status: 'missing', oldText: null, newText: null }],
        },
      ],
    });
    mount('/legislatie/modificari');

    const passage = await screen.findByTestId('legal-change-passage');
    expect(passage.textContent).toContain('Prevederea nu apare în textul legii.');
    expect(screen.getByTestId('legal-change-passages').textContent).not.toContain(
      'cuvintele tăiate'
    );
    expect(screen.queryByTestId('law-diff')).toBeNull();
  });

  it('shows a text in full while neither its old nor its new form is long', async () => {
    const sentence = 'Conducătorii de vehicule respectă regulile de circulație. '.repeat(8);
    mockLegislationApi({
      legalChanges: [
        {
          ...roadChange,
          passages: [{ ...helmetPassage, oldText: sentence, newText: `${sentence}Text nou.` }],
        },
      ],
    });
    mount('/legislatie/modificari');

    const passage = await screen.findByTestId('legal-change-passage');
    expect(within(passage).getByTestId('law-diff')).toBeTruthy();
    expect(within(passage).queryByTestId('legal-change-passage-toggle')).toBeNull();
  });

  it('keeps a long text behind "Ce s-a schimbat"', async () => {
    const longer = (text: string) =>
      `${text}\n(3) ${'Conducătorii de vehicule respectă regulile. '.repeat(12)}`;
    mockLegislationApi({
      legalChanges: [
        {
          ...roadChange,
          passages: [
            { ...helmetPassage, oldText: longer(helmetBefore), newText: longer(helmetAfter) },
          ],
        },
      ],
    });
    mount('/legislatie/modificari');

    const toggle = await screen.findByTestId('legal-change-passage-toggle');
    expect(toggle.textContent).toBe('Ce s-a schimbat');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const text = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(text.hidden).toBe(true);
    expect(screen.queryByTestId('law-diff')).toBeNull();
    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(text.hidden).toBe(false);
    expect(within(text).getByTestId('law-diff')).toBeTruthy();
  });

  it('shows a unit quoted in two documents once, naming both', async () => {
    mockLegislationApi({
      legalChanges: [
        {
          ...roadChange,
          passages: [
            helmetPassage,
            {
              ...helmetPassage,
              id: 'a1b2c3d4-0000-4000-8000-000000000002',
              templateFile: 'retired.docx',
              document: null,
              citationForm: 'reference',
              locator: null,
            },
          ],
        },
      ],
    });
    mount('/legislatie/modificari');

    const passage = await screen.findByTestId('legal-change-passage');
    expect(screen.getAllByTestId('legal-change-passage')).toHaveLength(1);
    expect(
      within(passage)
        .getAllByTestId('legal-change-passage-place')
        .map((place) => place.textContent)
    ).toEqual([
      'Citat în Material de instruire introductiv-generală, art. 36 alin. (1) – (3)',
      'Trimitere într-un document',
    ]);
  });

  it('says a change being checked amended an article the documents refer to', async () => {
    mockLegislationApi({ legalChanges: [{ ...roadChange, outcome: 'needs_review' }] });
    mount('/legislatie/modificari');

    const change = await screen.findByTestId('legal-change');
    expect(within(change).getByTestId('legal-change-resolution').textContent).toBe('În analiză');
    expect(within(change).getByTestId('legal-change-status').textContent).toBe(
      'Modifică un articol la care trimit documentele.'
    );
  });

  it('names the documents a template version updated, beside its note', async () => {
    mockLegislationApi({
      legalChanges: [
        {
          ...roadChange,
          resolution: 'template_version',
          resolvedAt: '2026-11-14T09:00:00Z',
          resolvedByNote: 'Obligația de a purta casca este preluată în noua formulare.',
          passages: [
            helmetPassage,
            {
              ...helmetPassage,
              id: 'a1b2c3d4-0000-4000-8000-000000000002',
              templateFile: '6_protective_equipment_list.docx',
              document: {
                typeKey: 'protective_equipment_list',
                title: 'Lista internă de dotare cu echipament individual de protecție',
              },
            },
          ],
          updatedDocuments: [
            {
              typeKey: 'general_training_material',
              title: 'Material de instruire introductiv-generală',
            },
          ],
        },
      ],
    });
    mount('/legislatie/modificari');

    const change = await screen.findByTestId('legal-change');
    expect(within(change).getByTestId('legal-change-resolution').textContent).toBe(
      'Șablon actualizat'
    );
    expect(within(change).getByTestId('legal-change-note').textContent).toBe(
      'Obligația de a purta casca este preluată în noua formulare.'
    );
    expect(within(change).getByTestId('legal-change-documents').textContent).toBe(
      'Șablon nou pentru: Material de instruire introductiv-generală'
    );
    expect(within(change).getByTestId('law-diff')).toBeTruthy();
  });

  it('names no updated document when no template version is linked to the change', async () => {
    mockLegislationApi({
      legalChanges: [
        {
          ...roadChange,
          resolution: 'template_version',
          resolvedAt: '2026-11-14T09:00:00Z',
          resolvedByNote: 'Obligația de a purta casca este preluată în noua formulare.',
        },
      ],
    });
    mount('/legislatie/modificari');

    const change = await screen.findByTestId('legal-change');
    expect(within(change).getByTestId('legal-change-note')).toBeTruthy();
    expect(within(change).queryByTestId('legal-change-documents')).toBeNull();
  });

  it('shows the note of a change with no impact, with the articles it amended', async () => {
    mockLegislationApi({
      legalChanges: [
        {
          ...roadChange,
          act: { id: 'lege-227-2015', name: 'Legea 227/2015', portalId: 171282 },
          resolution: 'no_impact',
          resolvedAt: '2026-11-13T03:18:00Z',
          resolvedByNote:
            'Modificarea adusă de Legea 204/2026 atinge art. 342; niciun text citat în documente nu s-a schimbat.',
          outcome: 'no_impact',
          amendingActs: [{ name: 'Legea 204/2026', adoptedOn: null }],
          amendedUnits: [
            ...['Art. 342', 'Art. 343', 'Art. 109^2'].map((unit) => ({
              unit,
              operation: 'modified',
              date: '2026-10-25',
              amendingAct: 'Legea 204/2026',
            })),
            { unit: 'Art. 400', operation: 'repealed', date: '2026-10-25', amendingAct: null },
          ],
          passages: [],
        },
      ],
    });
    mount('/legislatie/modificari');

    const change = await screen.findByTestId('legal-change');
    expect(within(change).getByTestId('legal-change-resolution').textContent).toBe(
      'Fără impact asupra documentelor'
    );
    expect(within(change).getByTestId('legal-change-note').textContent).toContain(
      'niciun text citat în documente nu s-a schimbat'
    );
    expect(
      [...within(change).getByTestId('legal-change-units').children].map(
        (group) => group.textContent
      )
    ).toEqual(['Modificări:art. 342, art. 343 și art. 109²', 'Abrogări:art. 400']);
    expect(within(change).queryByTestId('legal-change-status')).toBeNull();
    expect(within(change).queryByTestId('legal-change-passages')).toBeNull();
  });

  it('lists the acts with a change under review first, then by name', async () => {
    mockLegislationApi();
    mount('/legislatie/acte');

    await waitFor(() => expect(screen.getAllByTestId('watched-act')).toHaveLength(7));
    expect(actNamesInTable()).toEqual([
      'Legea 307/2006',
      'Legea 319/2006',
      'H.G. 1425/2006',
      'Legea 53/2003',
      'Legea 126/1995',
      'OMAI 106/2007',
      'OMAI 163/2007',
    ]);
    expect(screen.getByTestId('watched-acts-count').textContent).toBe('7 acte');
    expect(screen.getByTestId('pager-summary').textContent).toBe('1–7 din 7 acte');
    expect(screen.getByTestId('sort-name')).toBeTruthy();
    expect(screen.getByTestId('sort-consolidated')).toBeTruthy();
    expect(screen.getByTestId('sort-cited')).toBeTruthy();
    expect(screen.queryByTestId('sort-status')).toBeNull();
    expect(screen.queryByTestId('sort-domain')).toBeNull();
  });

  it('shows each act with its subject, domain, state, consolidated form and citations', async () => {
    mockLegislationApi();
    mount('/legislatie/acte');
    await waitFor(() => expect(screen.getAllByTestId('watched-act')).toHaveLength(7));
    const row = (name: string) =>
      screen
        .getAllByTestId('watched-act')
        .find((each) => within(each).getByTestId('watched-act-name').textContent === name)!;
    const cells = (name: string) =>
      [...row(name).querySelectorAll('td')].map((cell) => cell.textContent);

    expect(
      within(row('Legea 319/2006'))
        .getByRole('link', { name: /Legea 319/ })
        .getAttribute('href')
    ).toBe('https://legislatie.just.ro/Public/DetaliiDocument/73772');
    expect(cells('Legea 319/2006')).toEqual([
      'Legea 319/2006a securității și sănătății în muncă',
      'SSM',
      'În analizăModifică un text citat în documente.',
      '12.09.2026documentele: 03.11.2025',
      '12 documente66 de preluări',
    ]);
    expect(cells('Legea 307/2006')).toEqual([
      'Legea 307/2006privind apărarea împotriva incendiilor',
      'SSM, SU',
      'În analizăModificarea nu a fost încă analizată.',
      '08.05.2026documentele: forma de bază',
      '16 documente20 de preluări',
    ]);
    expect(cells('Legea 53/2003')[2]).toBe('Abrogat');
    expect(cells('OMAI 106/2007').slice(1)).toEqual([
      'SU',
      'În vigoare',
      'Forma de bază',
      '4 documentedoar trimiteri',
    ]);
    expect(cells('OMAI 163/2007').slice(2, 4)).toEqual(['Neverificat', '—']);
    expect(within(row('OMAI 163/2007')).queryByRole('link')).toBeNull();
    expect(cells('Legea 126/1995').slice(1)).toEqual(['—', 'În vigoare', '27.03.2026', '—']);

    const status = (name: string) => within(row(name)).getByTestId('watched-act-status');
    expect(status('Legea 319/2006').getAttribute('data-slot')).toBe('badge');
    expect(status('Legea 53/2003').getAttribute('data-slot')).toBe('badge');
    expect(status('OMAI 163/2007').getAttribute('data-slot')).toBeNull();
    expect(status('OMAI 163/2007').className).not.toContain('muted');
    expect(status('H.G. 1425/2006').className).not.toContain('muted');
  });

  it("links a change's outcome to the change on Modificări", async () => {
    mockLegislationApi();
    const runtime = mount('/legislatie/acte');
    const user = userEvent.setup();
    const links = await screen.findAllByTestId('watched-act-change');
    expect(links.map((link) => link.textContent)).toEqual([
      'Modificarea nu a fost încă analizată.',
      'Modifică un text citat în documente.',
    ]);
    expect(links[0]!.getAttribute('href')).toBe(
      '/legislatie/modificari#modificare-9e8d7c6b-5a49-4382-9172-6a5b4c3d2e1f'
    );

    await user.click(links[1]!);
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/legislatie/modificari')
    );
    expect(runtime.router.state.location.hash).toBe(`modificare-${lawChangeId}`);
    await waitFor(() =>
      expect(document.getElementById(`modificare-${lawChangeId}`)?.textContent).toContain(
        'Legea 319/2006'
      )
    );
  });

  it('sorts by name, consolidated form and citations, keeping the sort in the address', async () => {
    mockLegislationApi();
    const runtime = mount('/legislatie/acte');
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByTestId('watched-act')).toHaveLength(7));

    await user.click(screen.getByTestId('sort-name'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ sort: 'name' }));
    expect(actNamesInTable()).toEqual([
      'H.G. 1425/2006',
      'Legea 53/2003',
      'Legea 126/1995',
      'Legea 307/2006',
      'Legea 319/2006',
      'OMAI 106/2007',
      'OMAI 163/2007',
    ]);

    await user.click(screen.getByTestId('sort-consolidated'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({
        sort: 'consolidated',
        order: 'desc',
      })
    );
    expect(actNamesInTable()).toEqual([
      'Legea 319/2006',
      'Legea 307/2006',
      'Legea 126/1995',
      'H.G. 1425/2006',
      'Legea 53/2003',
      'OMAI 106/2007',
      'OMAI 163/2007',
    ]);
    await user.click(screen.getByTestId('sort-consolidated'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ sort: 'consolidated' })
    );
    expect(actNamesInTable().slice(-2)).toEqual(['OMAI 106/2007', 'OMAI 163/2007']);

    await user.click(screen.getByTestId('sort-cited'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ sort: 'cited', order: 'desc' })
    );
    expect(actNamesInTable()).toEqual([
      'OMAI 163/2007',
      'Legea 307/2006',
      'H.G. 1425/2006',
      'Legea 319/2006',
      'Legea 53/2003',
      'OMAI 106/2007',
      'Legea 126/1995',
    ]);
    expect(screen.getByTestId('sort-cited').closest('th')!.getAttribute('aria-sort')).toBe(
      'descending'
    );
  });

  it('opens sorted as the address says, and in the default order for a sort it no longer has', async () => {
    mockLegislationApi();
    const runtime = mount('/legislatie/acte?sort=cited');
    await waitFor(() => expect(actNamesInTable()[0]).toBe('Legea 126/1995'));

    await act(() =>
      runtime.router.navigate({ to: '/legislatie/acte', search: { sort: 'read' } as never })
    );
    await waitFor(() => expect(actNamesInTable()[0]).toBe('Legea 307/2006'));
  });

  it('filters by domain and state from the Filtre panel, counting what is left', async () => {
    mockLegislationApi();
    const runtime = mount('/legislatie/acte');
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByTestId('watched-act')).toHaveLength(7));

    await user.click(screen.getByTestId('watched-acts-filters'));
    const panel = await screen.findByTestId('watched-acts-filters-panel');
    for (const name of ['SSM', 'SU', 'În analiză', 'În vigoare', 'Abrogat', 'Neverificat']) {
      expect(within(panel).getByRole('checkbox', { name })).toBeTruthy();
    }
    await user.click(within(panel).getByRole('checkbox', { name: 'SU' }));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ domain: 'su' }));
    expect(actNamesInTable()).toEqual(['Legea 307/2006', 'OMAI 106/2007', 'OMAI 163/2007']);
    expect(screen.getByTestId('watched-acts-count').textContent).toBe('3 din 7 acte');

    await user.click(within(panel).getByRole('checkbox', { name: 'În analiză' }));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ domain: 'su', status: 'open' })
    );
    expect(actNamesInTable()).toEqual(['Legea 307/2006']);
  });

  it('offers only the states some act is in, and keeps one the address chose', async () => {
    mockLegislationApi({ watchedActs: acts.filter((each) => each.portalStatus !== 'repealed') });
    const user = userEvent.setup();
    mount('/legislatie/acte?status=unchecked');
    await waitFor(() => expect(actNamesInTable()).toEqual(['OMAI 163/2007']));

    await user.click(screen.getByTestId('watched-acts-filters'));
    const panel = await screen.findByTestId('watched-acts-filters-panel');
    expect(within(panel).queryByRole('checkbox', { name: 'Abrogat' })).toBeNull();
    expect(within(panel).getByRole('checkbox', { name: 'Neverificat' })).toBeTruthy();
  });

  it('keeps a state the address chose though no act is in it, and says nothing matches', async () => {
    mockLegislationApi({ watchedActs: acts.filter((each) => each.portalStatus !== 'repealed') });
    mount('/legislatie/acte?status=repealed');
    expect(await screen.findByTestId('watched-acts-empty-filtered')).toBeTruthy();
    expect(screen.getByTestId('watched-acts-applied-filters').textContent).toContain('Abrogat');
  });

  it('searches by number, name or subject, ignoring dots, spaces and diacritics', async () => {
    mockLegislationApi();
    const runtime = mount('/legislatie/acte');
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByTestId('watched-act')).toHaveLength(7));

    await user.type(screen.getByTestId('watched-acts-search'), 'hg 1425');
    await waitFor(() => expect(actNamesInTable()).toEqual(['H.G. 1425/2006']));
    expect(runtime.router.state.location.search).toEqual({ q: 'hg 1425' });
    expect(screen.getByTestId('watched-acts-count').textContent).toBe('1 din 7 acte');

    await user.clear(screen.getByTestId('watched-acts-search'));
    await user.type(screen.getByTestId('watched-acts-search'), 'aparare');
    await waitFor(() => expect(actNamesInTable()).toEqual(['Legea 307/2006', 'OMAI 163/2007']));

    await user.clear(screen.getByTestId('watched-acts-search'));
    await user.type(screen.getByTestId('watched-acts-search'), 'codul muncii');
    await waitFor(() => expect(actNamesInTable()).toEqual(['Legea 53/2003']));
  });

  it.each([
    ['Legea nr. 319/2006', ['Legea 319/2006']],
    ['HG nr 1425', ['H.G. 1425/2006']],
    ['Legea 319 din 2006', ['Legea 319/2006']],
    ['ordinul 163', ['OMAI 163/2007']],
    ['ordin 106/2007', ['OMAI 106/2007']],
    ['ordinul', ['OMAI 106/2007', 'OMAI 163/2007']],
  ])('finds the act cited in full as „%s”', async (q, names) => {
    mockLegislationApi();
    mount(`/legislatie/acte?q=${encodeURIComponent(JSON.stringify(q))}`);
    await waitFor(() => expect(actNamesInTable()).toEqual(names));
  });

  it('says when nothing matches, and clears only the filters', async () => {
    mockLegislationApi();
    const runtime = mount('/legislatie/acte?domain=su&q=1425');
    const user = userEvent.setup();
    const empty = await screen.findByTestId('watched-acts-empty-filtered');
    expect(empty.textContent).toContain('Niciun act nu se potrivește');
    expect(screen.getByTestId('watched-acts-count').textContent).toBe('0 din 7 acte');

    await user.click(screen.getByTestId('watched-acts-empty-clear'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ q: '1425' }));
    expect(actNamesInTable()).toEqual(['H.G. 1425/2006']);
  });

  it('says that no act is watched yet before the first check', async () => {
    mockLegislationApi({ watchedActs: [] });
    mount('/legislatie/acte');
    const empty = await screen.findByTestId('watched-acts-empty');
    expect(empty.textContent).toContain('Niciun act urmărit încă');
    expect(screen.queryByTestId('watched-acts-search')).toBeNull();
    expect(screen.queryByTestId('watched-acts-filters')).toBeNull();
  });

  it('shows 25 acts a page and starts again from the first page on a new search', async () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      ...acts[1]!,
      id: `hg-${index + 1}-2006`,
      name: `H.G. ${index + 1}/2006`,
    }));
    mockLegislationApi({ watchedActs: many });
    const runtime = mount('/legislatie/acte');
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByTestId('watched-act')).toHaveLength(25));
    expect(screen.getByTestId('pager-summary').textContent).toBe('1–25 din 30 de acte');

    await user.click(screen.getByTestId('pager-next'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ page: 2 }));
    expect(actNamesInTable()).toEqual([
      'H.G. 26/2006',
      'H.G. 27/2006',
      'H.G. 28/2006',
      'H.G. 29/2006',
      'H.G. 30/2006',
    ]);

    await user.type(screen.getByTestId('watched-acts-search'), 'hg 2');
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ q: 'hg 2' }));
    expect(screen.getByTestId('pager-summary').textContent).toBe('1–11 din 11 acte');
  });
});
