import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LatestLegalCheckRunResponseRun } from '@/api/generated/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

import { pollIntervalMs } from './regeneration-job';

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

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
  },
];

const changes = [
  {
    id: '4f0d9a1e-6b2c-4c1d-9e3f-2a1b0c9d8e7f',
    act: { id: 'lege-319-2006', name: 'Legea 319/2006', portalId: 73772 },
    seenAt: '2026-10-06T06:12:00Z',
    consolidatedOn: '2026-09-12',
    amendingAct: 'Legea 145/2026',
    resolution: 'open',
    resolvedAt: null,
    resolvedByNote: null,
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
  newestVersion: { version: 4, kind: 'correction', note: 'Diacriticele din antet sunt corectate.' },
  runningJobId: null as string | null,
  clients: [
    {
      documentId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
      clientId: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
      clientName: 'ALFA CONSTRUCT SRL',
      version: 3,
      editedDraft: false,
    },
    {
      documentId: '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f',
      clientId: '4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f80',
      clientName: 'BETA CAFE SRL',
      version: 2,
      editedDraft: true,
    },
  ],
};

const extinguisherBehind = {
  typeKey: 'fire_extinguisher_register',
  title: 'Registru de evidență a controlului stingătoarelor de incendiu',
  newestVersion: { version: 2, kind: 'legal', note: 'Rubricile urmează OMAI 163/2007.' },
  runningJobId: null as string | null,
  clients: [
    {
      documentId: '5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
      clientId: firstAidBehind.clients[0]!.clientId,
      clientName: 'ALFA CONSTRUCT SRL',
      version: 1,
      editedDraft: false,
    },
  ],
};

const actNamesInTable = () =>
  screen.getAllByTestId('watched-act').map((row) => row.querySelector('td')!.textContent);

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
  workersRepresentativeClash: null,
  undecidedJobPositions: [
    { id: '6c7d8e9f-0a1b-4c2d-8e3f-4a5b6c7d8e9f', name: 'Sudor', undecided: ['equipment'] },
  ],
  incompleteRiskEvaluations: [],
};

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  run = succeeded as LatestLegalCheckRunResponseRun,
  behind = [] as unknown[],
  afterJob = [] as unknown[],
  start = (() => Response.json(job(), { status: 201 })) as () => Response,
  polls = [finishedJob] as unknown[],
  readiness = alfaReadiness as unknown,
} = {}) {
  let jobDone = false;
  let pollCount = 0;
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (pathname === '/me') {
      return Response.json({
        user: { id: 'user-one', email: 'review@example.test' },
        profile: { fullName: 'Ana Ionescu', professionalTitle: null },
        membership: {
          organization: { id: '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10', name: 'Safety' },
          role: 'specialist',
        },
      });
    }
    if (pathname === '/legislation/acts') return Response.json({ items: acts });
    if (pathname === '/legislation/changes') return Response.json({ items: changes });
    if (pathname === '/legislation/runs/latest') return Response.json({ run });
    if (pathname === '/documents/behind') {
      return Response.json({ items: jobDone ? afterJob : behind });
    }
    if (pathname === '/documents/behind/regenerate' && method === 'POST') return start();
    if (pathname === `/clients/${firstAidBehind.clients[0]!.clientId}/documents/readiness`) {
      return Response.json(readiness);
    }
    if (pathname === `/documents/regeneration-jobs/${jobId}`) {
      const answer = polls[Math.min(pollCount, polls.length - 1)] as ReturnType<typeof job>;
      pollCount += 1;
      if (answer.job.finishedAt) jobDone = true;
      return Response.json(answer);
    }
    throw new Error(`Unexpected request: ${method} ${pathname}`);
  });
}

const requests = (path: string, method: string) =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === path && (init?.method ?? 'GET') === method
  );

const mount = (path = '/legislatie') => mountApp(authFixture(makeSession()).client, path);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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
  it('opens on the documents to update, with the other tabs beside it', async () => {
    mockApi();
    const runtime = mount();

    expect(await screen.findByTestId('legislation-page')).toBeTruthy();
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/legislatie/documente')
    );
    expect(screen.getByTestId('nav-legislatie').getAttribute('aria-current')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Legislație');
    const tabs = screen.getAllByTestId('legislation-section');
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Documente de actualizat',
      'Modificări',
      'Acte urmărite',
    ]);
    expect(tabs[0]!.getAttribute('aria-current')).toBe('page');
    expect(await screen.findByTestId('documents-behind-empty')).toBeTruthy();
  });

  it('opens Legislație in the navigation on its tabs, the current one marked', async () => {
    mockApi();
    const runtime = mount();
    const user = userEvent.setup();

    const group = await screen.findByTestId('nav-legislatie-group');
    const entries = within(group).getAllByTestId('nav-sub-entry');
    expect(entries.map((entry) => [entry.textContent, entry.getAttribute('href')])).toEqual([
      ['Documente de actualizat', '/legislatie/documente'],
      ['Modificări', '/legislatie/modificari'],
      ['Acte urmărite', '/legislatie/acte'],
    ]);
    await waitFor(() => expect(entries[0]!.getAttribute('aria-current')).toBe('page'));

    await user.click(entries[2]!);
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/legislatie/acte'));
    expect(entries[2]!.getAttribute('aria-current')).toBe('page');
    expect(entries[0]!.getAttribute('aria-current')).toBeNull();
    expect(entries[2]!.getAttribute('data-active')).toBe('true');

    await user.click(screen.getByTestId('nav-dashboard'));
    await waitFor(() => expect(runtime.router.state.location.pathname).toBe('/dashboard'));
    expect(group.closest('[data-open]')?.getAttribute('data-open')).toBe('false');
    await waitFor(() => expect(screen.queryByTestId('nav-legislatie-group')).toBeNull());
  });

  it('keeps the title and the last check above every tab', async () => {
    mockApi();
    const runtime = mount();
    const user = userEvent.setup();

    await user.click((await screen.findAllByTestId('legislation-section'))[1]!);
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe('/legislatie/modificari')
    );
    expect(await screen.findAllByTestId('legal-change')).toHaveLength(3);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Legislație');
    expect(screen.getByTestId('last-check-ok')).toBeTruthy();

    await user.click(screen.getAllByTestId('legislation-section')[2]!);
    expect(await screen.findAllByTestId('watched-act')).toHaveLength(4);
    expect(screen.getByTestId('last-check-ok')).toBeTruthy();
    expect(screen.queryByTestId('legal-change')).toBeNull();
  });

  it('says quietly when the acts were read within two days', async () => {
    mockApi();
    mount();

    const line = await screen.findByTestId('last-check-ok');
    expect(line.textContent).toMatch(
      /^Verificat pe \d{1,2} \S+ \d{4} la \d{2}:\d{2} · 14 acte citite$/
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('counts the new changes the last check found', async () => {
    mockApi({ run: { ...succeeded, actsChecked: 50, changesFound: 2 } });
    mount();

    expect((await screen.findByTestId('last-check-ok')).textContent).toMatch(
      / · 50 de acte citite · 2 modificări noi$/
    );
  });

  it('warns when the check never ran', async () => {
    mockApi({ run: null });
    mount();

    const notice = await screen.findByTestId('last-check-never');
    expect(notice.textContent).toContain('Verificarea nu a rulat încă');
  });

  it('says when a check is running', async () => {
    mockApi({ run: { ...succeeded, status: 'running', finishedAt: null } });
    mount();

    expect((await screen.findByTestId('last-check-running')).textContent).toMatch(
      /^Verificarea rulează din \d{1,2} \S+ \d{4} la \d{2}:\d{2}\.$/
    );
  });

  it('says in one line that the last check failed, with the causes behind "Detalii"', async () => {
    mockApi({ run: failedRun });
    mount();
    const user = userEvent.setup();

    const notice = await screen.findByTestId('last-check-failed');
    expect(notice.textContent).toMatch(
      /^Ultima verificare nu a reușit \(\d{1,2} \S+, \d{2}:\d{2}\): 5 acte nu au putut fi citite\./
    );
    const details = within(notice).getByTestId('last-check-details');
    const panel = document.getElementById(details.getAttribute('aria-controls')!)!;
    expect(details.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);

    await user.click(details);
    expect(details.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    await waitFor(() =>
      expect(
        within(notice)
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
    expect(notice.textContent).not.toMatch(/https?:|answered|fetched/);
  });

  it('says that a check stopped as a whole, without acts', async () => {
    mockApi({
      run: {
        ...succeeded,
        status: 'failed',
        errors: [{ act: null, kind: 'other', message: 'Could not save the acts.' }],
      },
    });
    mount();
    const user = userEvent.setup();

    const notice = await screen.findByTestId('last-check-failed');
    expect(notice.textContent).toContain(': verificarea s-a oprit înainte de final.');
    await user.click(within(notice).getByTestId('last-check-details'));
    expect(within(notice).getByTestId('last-check-failure-group').textContent).toBe(
      'Verificarea s-a oprit înainte de final'
    );
  });

  it('warns when the acts were last read more than two days ago', async () => {
    mockApi({ run: { ...succeeded, startedAt: hoursAgo(60), finishedAt: hoursAgo(60) } });
    mount();

    const notice = await screen.findByTestId('last-check-stale');
    expect(notice.textContent).toContain('Verificarea nu a mai rulat de peste două zile');
  });

  it('says so when no document is behind its template', async () => {
    mockApi();
    mount();

    expect(await screen.findByTestId('documents-behind-empty')).toBeTruthy();
    expect(screen.queryByTestId('behind-set')).toBeNull();
    expect(screen.queryByTestId('behind-regenerate')).toBeNull();
  });

  it('groups the documents to update under SSM and PSI', async () => {
    mockApi({ behind: [extinguisherBehind, firstAidBehind] });
    mount();

    await waitFor(() => expect(screen.getAllByTestId('behind-set')).toHaveLength(2));
    const [ssm, psi] = screen.getAllByTestId('behind-set');
    expect(within(ssm!).getByRole('heading', { level: 2 }).textContent).toBe('Documente SSM');
    expect(
      within(ssm!)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual(['SSMDecizia privind responsabilii cu primul ajutor']);
    expect(within(psi!).getByRole('heading', { level: 2 }).textContent).toBe('Documente PSI');
    expect(
      within(psi!)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent)
    ).toEqual(['PSIRegistru de evidență a controlului stingătoarelor de incendiu']);
    expect(within(ssm!).getByTestId('behind-type-set').textContent).toBe('SSM');
    expect(within(psi!).getByTestId('behind-type-set').textContent).toBe('PSI');
    expect(within(psi!).getByRole('link').getAttribute('href')).toBe(
      `/clients/${extinguisherBehind.clients[0]!.clientId}/fire-safety-documents?section=registers&focus=fire_extinguisher_register`
    );
  });

  it('lists the clients behind a template, with the hand-edited drafts that will be skipped', async () => {
    mockApi({ behind: [firstAidBehind] });
    mount();

    const type = await screen.findByTestId('behind-type');
    expect(within(type).getByRole('heading', { level: 3 }).textContent).toBe(
      'SSMDecizia privind responsabilii cu primul ajutor'
    );
    expect(type.textContent).toContain('Corectură');
    expect(type.textContent).toContain('Versiunea 4 a șablonului');
    expect(within(type).getByTestId('behind-note').textContent).toBe(
      'Diacriticele din antet sunt corectate.'
    );
    const clients = within(type).getAllByTestId('behind-client');
    expect(clients.map((client) => client.textContent)).toEqual([
      'ALFA CONSTRUCT SRLpe versiunea 3',
      'BETA CAFE SRLpe versiunea 2ciornă editată manual – va fi sărită',
    ]);
    expect(within(clients[0]!).getByRole('link').getAttribute('href')).toBe(
      `/clients/${firstAidBehind.clients[0]!.clientId}/documents?section=decisions&focus=decision_first_aid`
    );
    expect(within(type).getByTestId('behind-regenerate').textContent).toBe(
      'Regenerează pentru toți clienții (2)'
    );
  });

  it('regenerates a type for every client and follows the job to its end', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const running = job({
      done: 1,
      items: [{ ...job().job.items[0], status: 'done' }, job().job.items[1]],
    });
    mockApi({ behind: [firstAidBehind], polls: [running, finishedJob] });
    mount();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.click(await screen.findByTestId('behind-regenerate'));
    const dialog = await screen.findByTestId('behind-confirm-dialog');
    expect(dialog.textContent).toContain('pentru 1 client');
    expect(dialog.textContent).toContain('1 ciornă editată manual este sărită');
    await user.click(within(dialog).getByTestId('behind-confirm'));

    expect(await screen.findByTestId('regeneration-progress')).toBeTruthy();
    expect(requests('/documents/behind/regenerate', 'POST')).toHaveLength(1);
    expect(
      JSON.parse(String(requests('/documents/behind/regenerate', 'POST')[0]![1]!.body))
    ).toEqual({ typeKey: 'decision_first_aid' });
    expect(screen.queryByTestId('behind-regenerate')).toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId('regeneration-progress').textContent).toContain(
        'Se regenerează: 1 din 2 clienți'
      )
    );

    await vi.advanceTimersByTimeAsync(pollIntervalMs);
    const result = await screen.findByTestId('regeneration-result');
    expect(screen.getByTestId('regeneration-result-counts').textContent).toContain(
      'Din 2 clienți: 1 regenerat, 1 sărit, 0 eșuate.'
    );
    expect(within(result).getAllByTestId('regeneration-left-out')[0]!.textContent).toBe(
      'BETA CAFE SRL (sărit): Ciorna are modificări făcute de mână, pe care regenerarea le-ar pierde.'
    );
    await waitFor(() => expect(screen.queryAllByTestId('behind-client')).toHaveLength(0));
    expect(screen.getByTestId('behind-type').textContent).toContain(
      'Niciun client nu mai are acest document în urmă.'
    );
  });

  it('lists what a client failed for as the rows of the generation form, each starting the way back to its document', async () => {
    mockApi({ behind: [{ ...firstAidBehind, runningJobId: jobId }], polls: [lackingJob] });
    const runtime = mount();
    const user = userEvent.setup();

    expect((await screen.findByTestId('regeneration-result-counts')).textContent).toContain(
      'Din 2 clienți: 0 regenerate, 1 sărit, 1 eșuat.'
    );
    expect(screen.getAllByTestId('regeneration-left-out').map((item) => item.textContent)).toEqual([
      'BETA CAFE SRL (sărit): Ciorna are modificări făcute de mână, pe care regenerarea le-ar pierde.',
    ]);
    const lacking = screen.getByTestId('regeneration-lacking');
    expect(within(lacking).getByTestId('regeneration-lacking-client').textContent).toBe(
      'ALFA CONSTRUCT SRL'
    );
    expect(lacking.textContent).toContain(
      'Nu am putut regenera documentul. Completează mai întâi:'
    );
    const rows = await within(lacking).findAllByTestId('regeneration-missing-row');
    const alfaId = firstAidBehind.clients[0]!.clientId;
    expect(rows.map((row) => [row.textContent, row.getAttribute('href')])).toEqual([
      [
        'Programul instruirii periodiceIntervalele pe categorii, prima lună, durata și zilele.',
        `/clients/${alfaId}/training?focus=training-schedule`,
      ],
      [
        'Sudor · echipament de protecțieArticolele postului, sau că nu are nevoie de echipament.',
        `/clients/${alfaId}/job-positions/6c7d8e9f-0a1b-4c2d-8e3f-4a5b6c7d8e9f#protective-equipment`,
      ],
    ]);

    vi.spyOn(console, 'error').mockImplementation(() => {});
    await user.click(rows[0]!);
    await waitFor(() =>
      expect(runtime.router.state.location.pathname).toBe(`/clients/${alfaId}/training`)
    );
    expect(JSON.parse(sessionStorage.getItem('ssm-usor:way-back')!)).toMatchObject({
      clientId: alfaId,
      to: 'document',
      typeKey: 'decision_first_aid',
    });
  });

  it('picks up a regeneration already running when the page opens', async () => {
    mockApi({
      behind: [{ ...firstAidBehind, runningJobId: jobId }],
      polls: [job({ done: 1 })],
    });
    mount();

    expect((await screen.findByTestId('regeneration-progress')).textContent).toContain(
      'Se regenerează: 1 din 2 clienți'
    );
    expect(screen.queryByTestId('behind-regenerate')).toBeNull();
    expect(requests('/documents/behind/regenerate', 'POST')).toHaveLength(0);
  });

  it('shows the reason the API gives when a regeneration cannot start', async () => {
    mockApi({
      behind: [firstAidBehind],
      start: () =>
        Response.json(
          {
            error: 'conflict',
            message: 'Documentul se regenerează deja pentru toți clienții. Așteaptă să se termine.',
            reason: 'regeneration_running',
          },
          { status: 409 }
        ),
    });
    mount();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('behind-regenerate'));
    await user.click(await screen.findByTestId('behind-confirm'));

    expect((await screen.findByTestId('behind-regenerate-error')).textContent).toBe(
      'Documentul se regenerează deja pentru toți clienții. Așteaptă să se termine.'
    );
    expect(screen.queryByTestId('behind-confirm-dialog')).toBeNull();
  });

  it('lists the legal changes by how they were resolved', async () => {
    mockApi();
    mount('/legislatie/modificari');

    await waitFor(() => expect(screen.getAllByTestId('legal-change')).toHaveLength(3));
    const [open, noImpact, answered] = screen.getAllByTestId('legal-change');
    expect(within(open!).getByTestId('legal-change-resolution').textContent).toBe('În verificare');
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

  it('lists the watched acts by name, each linking to its portal page', async () => {
    mockApi();
    mount('/legislatie/acte');

    await waitFor(() => expect(screen.getAllByTestId('watched-act')).toHaveLength(4));
    const rows = screen.getAllByTestId('watched-act');
    expect(actNamesInTable()).toEqual([
      'H.G. 1425/2006',
      'Legea 53/2003',
      'Legea 319/2006',
      'OMAI 163/2007',
    ]);
    expect(within(rows[2]!).getByRole('link').getAttribute('href')).toBe(
      'https://legislatie.just.ro/Public/DetaliiDocument/73772'
    );
    expect(rows[2]!.textContent).toContain('12.09.2026');
    expect(rows[2]!.textContent).toContain('03.11.2025');
    expect(within(rows[1]!).getByTestId('watched-act-status').textContent).toBe('abrogat');
    expect(within(rows[3]!).queryByRole('link')).toBeNull();
    expect(within(rows[3]!).getByTestId('watched-act-status').textContent).toBe('neverificat');
    expect(screen.getByTestId('pager-summary').textContent).toBe('1–4 din 4 acte');
  });

  it('sorts the watched acts by any column, keeping the sort in the address', async () => {
    mockApi();
    const runtime = mount('/legislatie/acte');
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByTestId('watched-act')).toHaveLength(4));

    await user.click(screen.getByTestId('sort-status'));
    await waitFor(() =>
      expect(actNamesInTable()).toEqual([
        'Legea 53/2003',
        'H.G. 1425/2006',
        'Legea 319/2006',
        'OMAI 163/2007',
      ])
    );
    expect(runtime.router.state.location.search).toEqual({ sort: 'status' });

    await user.click(screen.getByTestId('sort-consolidated'));
    await user.click(screen.getByTestId('sort-consolidated'));
    await waitFor(() =>
      expect(actNamesInTable()).toEqual([
        'Legea 319/2006',
        'H.G. 1425/2006',
        'Legea 53/2003',
        'OMAI 163/2007',
      ])
    );
    expect(runtime.router.state.location.search).toEqual({ sort: 'consolidated', order: 'desc' });
    expect(screen.getByTestId('sort-consolidated').closest('th')!.getAttribute('aria-sort')).toBe(
      'descending'
    );
  });

  it('opens the watched acts sorted as the address says', async () => {
    mockApi();
    mount('/legislatie/acte?sort=read&order=desc');

    await waitFor(() =>
      expect(actNamesInTable()).toEqual([
        'Legea 53/2003',
        'H.G. 1425/2006',
        'Legea 319/2006',
        'OMAI 163/2007',
      ])
    );
  });
});
