import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

import type { LatestCheckRun } from './latest-check-run';
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

const succeeded: LatestCheckRun = {
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
      },
      {
        clientId: firstAidBehind.clients[1]!.clientId,
        clientName: 'BETA CAFE SRL',
        status: 'queued',
        detail: null,
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
    },
    {
      clientId: firstAidBehind.clients[1]!.clientId,
      clientName: 'BETA CAFE SRL',
      status: 'skipped',
      detail: 'Ciorna are modificări făcute de mână, pe care regenerarea le-ar pierde.',
    },
  ],
});

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  run = succeeded as LatestCheckRun | null,
  behind = [] as unknown[],
  afterJob = [] as unknown[],
  start = (() => Response.json(job(), { status: 201 })) as () => Response,
  polls = [finishedJob] as unknown[],
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
    if (pathname === '/legislation/runs/latest') return Response.json(run);
    if (pathname === '/documents/behind') {
      return Response.json({ items: jobDone ? afterJob : behind });
    }
    if (pathname === '/documents/behind/regenerate' && method === 'POST') return start();
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

const mount = () => mountApp(authFixture(makeSession()).client, '/legislatie');

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

describe('the Legislație page', () => {
  it('is in the navigation of a specialist, titled in the breadcrumb', async () => {
    mockApi();
    mount();

    expect(await screen.findByTestId('legislation-page')).toBeTruthy();
    expect(screen.getByTestId('nav-legislatie').getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Legislație');
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    ).toEqual(['Documente în urmă', 'Modificări legislative', 'Acte urmărite']);
  });

  it('says quietly when the acts were read within two days', async () => {
    mockApi();
    mount();

    const line = await screen.findByTestId('last-check-ok');
    expect(line.textContent).toContain('Ultima verificare pe Portalul Legislativ');
    expect(line.textContent).toContain('14 acte citite, nicio modificare nouă, 1 act sărit');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('warns when the check never ran', async () => {
    mockApi({ run: null });
    mount();

    const notice = await screen.findByTestId('last-check-never');
    expect(notice.textContent).toContain('Verificarea nu a rulat încă');
  });

  it('warns when the last check failed, naming the acts it could not read', async () => {
    mockApi({
      run: {
        ...succeeded,
        status: 'failed',
        errors: [
          { actId: 'hg-1425-2006', message: 'Pagina nu a putut fi citită (HTTP 503).' },
          { actId: 'lege-unknown-2001', message: 'Data formei consolidate lipsește.' },
        ],
      },
    });
    mount();

    const notice = await screen.findByTestId('last-check-failed');
    expect(notice.textContent).toContain('Ultima verificare nu a reușit');
    await waitFor(() =>
      expect(
        screen.getAllByTestId('last-check-failed-act').map((item) => item.textContent)
      ).toEqual([
        'H.G. 1425/2006: Pagina nu a putut fi citită (HTTP 503).',
        'lege-unknown-2001: Data formei consolidate lipsește.',
      ])
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
    expect(screen.queryByTestId('behind-regenerate')).toBeNull();
  });

  it('lists the clients behind a template, with the hand-edited drafts that will be skipped', async () => {
    mockApi({ behind: [firstAidBehind] });
    mount();

    const type = await screen.findByTestId('behind-type');
    expect(within(type).getByRole('heading', { level: 3 }).textContent).toBe(
      'Decizia privind responsabilii cu primul ajutor'
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
      `/clients/${firstAidBehind.clients[0]!.clientId}/documents`
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
            message:
              'Documentul se regenerează deja pentru toți clienții. Așteptați să se termine.',
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
      'Documentul se regenerează deja pentru toți clienții. Așteptați să se termine.'
    );
    expect(screen.queryByTestId('behind-confirm-dialog')).toBeNull();
  });

  it('lists the legal changes by how they were resolved', async () => {
    mockApi();
    mount();

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
    mount();

    await waitFor(() => expect(screen.getAllByTestId('watched-act')).toHaveLength(3));
    const rows = screen.getAllByTestId('watched-act');
    expect(rows.map((row) => row.querySelector('td')!.textContent)).toEqual([
      'H.G. 1425/2006',
      'Legea 319/2006',
      'OMAI 163/2007',
    ]);
    expect(within(rows[1]!).getByRole('link').getAttribute('href')).toBe(
      'https://legislatie.just.ro/Public/DetaliiDocument/73772'
    );
    expect(rows[1]!.textContent).toContain('12.09.2026');
    expect(rows[1]!.textContent).toContain('03.11.2025');
    expect(within(rows[2]!).queryByRole('link')).toBeNull();
    expect(within(rows[2]!).getByTestId('watched-act-status').textContent).toBe('neverificat');
  });
});
