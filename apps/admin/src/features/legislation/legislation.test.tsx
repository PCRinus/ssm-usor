import type {
  AdminLegalActList,
  AdminLegalChangeDetail,
  AdminLegalChangeList,
  AdminLegalCheckRunList,
} from '@ssm-usor/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { disposeAdmins, mountAdmin } from '@/test/admin-app';

import { wordDiff } from './word-diff';

const changeId = 'd1d1d1d1-0000-4000-8000-000000000001';
const versionId = 'a1a1a1a1-0000-4000-8000-000000000001';

const helmetOld =
  '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte casca de protecție omologată.';
const helmetNew =
  '(2) Pe timpul deplasării pe drumurile publice, conducătorii motocicletelor, mopedelor și persoanele transportate pe acestea au obligația să poarte pe cap cască de protecție omologată pentru motocicliști.';

const summary = {
  id: changeId,
  act: { id: 'oug-195-2002', name: 'O.U.G. 195/2002', portalId: 41006 },
  seenAt: '2026-11-07T03:20:00+00:00',
  consolidatedOn: '2026-11-06',
  comparedWith: '2026-08-25',
  outcome: 'quote_differs' as const,
  assessedAt: '2026-11-13T03:21:00+00:00',
  amendingAct: 'LEGE 207 03/11/2026',
  amendingActs: [{ name: 'Legea 207/2026', adoptedOn: '2026-11-03', portalId: 301234 }],
  resolution: 'open' as const,
  resolvedAt: null,
  resolvedByNote: null,
};

const list: AdminLegalChangeList = {
  items: [
    { ...summary, passageCount: 1 },
    {
      ...summary,
      id: 'd1d1d1d1-0000-4000-8000-000000000002',
      act: { id: 'lege-227-2015', name: 'Legea 227/2015', portalId: 171280 },
      consolidatedOn: '2026-10-25',
      comparedWith: '2026-10-18',
      outcome: 'no_impact',
      amendingActs: [{ name: 'Legea 204/2026', adoptedOn: '2026-10-22', portalId: null }],
      resolution: 'no_impact',
      resolvedAt: '2026-10-26T04:00:00+00:00',
      resolvedByNote: 'Modificarea adusă de Legea 204/2026 atinge art. 342.',
      passageCount: 0,
    },
  ],
};

const version = {
  id: versionId,
  typeKey: 'general_training_material',
  title: 'Material instruire generală',
  version: 4,
  kind: 'legal' as const,
  note: 'Art. 36 alin. (2) din O.U.G. 195/2002 preia forma din 6 noiembrie 2026.',
  createdAt: '2026-11-08T10:00:00+00:00',
};

const detail: AdminLegalChangeDetail = {
  ...summary,
  amendedUnits: [
    {
      unit: 'Art. 36 alin. (2)',
      subject: 'Alineatul (2), Articolul 36',
      operation: 'modified',
      date: '2026-11-06',
      amendingAct: 'Legea 207/2026',
    },
  ],
  review: ['Art. 6 is referred to without a quote and was amended.'],
  passages: [
    {
      id: 'f1f1f1f1-0000-4000-8000-000000000001',
      manifest: 'ssm',
      templateFile: '2.2_general_training_material.docx',
      typeKey: 'general_training_material',
      paragraph: 2048,
      citationForm: 'quote',
      locator: 'Art. 36 alin. (1) – (3)',
      article: '36',
      unit: 'Art. 36 alin. (2)',
      status: 'changed',
      oldText: helmetOld,
      newText: helmetNew,
      hunks: [],
    },
  ],
  resolvingVersion: null,
  candidateVersions: [version],
  awaitingAssessment: false,
  olderOpenChanges: [],
};

const olderChangeId = 'd1d1d1d1-0000-4000-8000-000000000003';

const acts: AdminLegalActList = {
  items: [
    {
      id: 'oug-195-2002',
      name: 'O.U.G. 195/2002',
      portalId: 41006,
      portalStatus: 'in_force',
      verifiedConsolidatedOn: '2026-08-25',
      lastConsolidatedOn: '2026-11-06',
      lastAmendingAct: 'LEGE 207 03/11/2026',
      lastCheckedAt: '2026-11-13T03:20:00+00:00',
      checkedByHandOn: null,
      openChanges: 1,
    },
    {
      id: 'lege-319-2006',
      name: 'Legea 319/2006',
      portalId: 73772,
      portalStatus: 'in_force',
      verifiedConsolidatedOn: '2021-07-25',
      lastConsolidatedOn: '2021-07-25',
      lastAmendingAct: null,
      lastCheckedAt: '2026-11-13T03:19:00+00:00',
      checkedByHandOn: '2026-10-01',
      openChanges: 0,
    },
  ],
};

const runs: AdminLegalCheckRunList = {
  items: [
    {
      id: 'e1e1e1e1-0000-4000-8000-000000000001',
      startedAt: '2026-11-13T03:17:00+00:00',
      finishedAt: '2026-11-13T03:21:00+00:00',
      status: 'failed',
      actsChecked: 36,
      changesFound: 1,
      actsSkipped: 1,
      errors: [
        {
          act: 'hg-1425-2006',
          kind: 'http_status',
          status: 503,
          message: 'The portal answered 503.',
        },
      ],
    },
  ],
  page: 1,
  pageSize: 25,
  total: 30,
};

const fetchMock = vi.fn<typeof fetch>();
let current: AdminLegalChangeDetail = detail;
let refusal: string | null = null;

const requests = () =>
  fetchMock.mock.calls
    .map(([input, init]) => ({
      url: new URL(String(input)),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    }))
    .filter((call) => call.url.pathname !== '/api/impersonation');

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  current = detail;
  refusal = null;
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    if (url.pathname === '/api/impersonation') return Response.json({ impersonation: null });
    if (url.pathname === '/api/me') return Response.json({ id: 'user-1', email: 'm@example.ro' });
    if (url.pathname === '/api/legislation/changes') return Response.json(list);
    if (refusal && method === 'POST') {
      current =
        refusal === 'older_change_open'
          ? { ...detail, olderOpenChanges: [{ id: olderChangeId, consolidatedOn: '2026-10-30' }] }
          : { ...detail, awaitingAssessment: true };
      return Response.json(
        { error: 'unprocessable', message: 'Refused.', reason: refusal },
        { status: 422 }
      );
    }
    if (url.pathname === `/api/legislation/changes/${changeId}/no-impact` && method === 'POST') {
      const { note } = JSON.parse(String(init?.body)) as { note: string };
      current = {
        ...detail,
        resolution: 'no_impact',
        resolvedAt: '2026-11-13T09:00:00+00:00',
        resolvedByNote: note,
        candidateVersions: [],
      };
      return Response.json(current);
    }
    if (url.pathname === `/api/legislation/changes/${changeId}/template-version`) {
      current = {
        ...detail,
        resolution: 'template_version',
        resolvedAt: '2026-11-13T09:00:00+00:00',
        resolvedByNote: version.note,
        resolvingVersion: version,
        candidateVersions: [],
      };
      return Response.json(current);
    }
    if (url.pathname === `/api/legislation/changes/${changeId}`) return Response.json(current);
    if (url.pathname === '/api/legislation/acts') return Response.json(acts);
    if (url.pathname === '/api/legislation/acts/lege-319-2006/verified-form') {
      return Response.json(
        { error: 'unprocessable', message: 'Open.', reason: 'open_changes_at_or_before' },
        { status: 422 }
      );
    }
    if (url.pathname.endsWith('/verified-form')) {
      return Response.json({ ...acts.items[0], verifiedConsolidatedOn: '2026-11-06' });
    }
    if (url.pathname === '/api/legislation/runs') return Response.json(runs);
    return Response.json({ error: 'not_found', message: 'No such route.' }, { status: 404 });
  });
});

afterEach(() => {
  disposeAdmins();
  vi.unstubAllGlobals();
});

describe('the word diff', () => {
  it('strikes the law’s old words and marks the new ones, as one replacement', () => {
    expect(
      wordDiff(
        'să poarte casca de protecție omologată.',
        'să poarte pe cap cască de protecție omologată pentru motocicliști.'
      )
    ).toEqual([
      { kind: 'same', text: 'să poarte ' },
      { kind: 'changed', deleted: 'casca', inserted: 'pe cap cască' },
      { kind: 'same', text: ' de protecție omologată ' },
      { kind: 'changed', deleted: '', inserted: 'pentru motocicliști' },
      { kind: 'same', text: '.' },
    ]);
  });
});

describe('the legal changes', () => {
  it('lists every change with its form, outcome, amending act and resolution, filtered through the address', async () => {
    const runtime = mountAdmin('/legislation');
    const rows = await screen.findAllByTestId('legal-change-row');

    expect(rows).toHaveLength(2);
    const first = within(rows[0]!);
    expect(first.getByText('O.U.G. 195/2002')).toBeTruthy();
    expect(first.getByText('6 Nov 2026')).toBeTruthy();
    expect(first.getByText('vs 25 Aug 2026')).toBeTruthy();
    expect(first.getByText('Quote differs')).toBeTruthy();
    expect(first.getByText('Legea 207/2026')).toBeTruthy();
    expect(first.getByText('Open')).toBeTruthy();
    expect(within(rows[1]!).getByText(/atinge art\. 342/)).toBeTruthy();

    const user = userEvent.setup();
    await user.selectOptions(screen.getByTestId('filter-change-status'), 'open');
    await user.selectOptions(screen.getByTestId('filter-change-outcome'), 'unassessed');
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({
        status: 'open',
        outcome: 'unassessed',
      })
    );
    await waitFor(() =>
      expect(requests().at(-1)!.url.search).toBe('?status=open&outcome=unassessed')
    );
  });

  it('is reached from the home page and the top bar', async () => {
    const runtime = mountAdmin('/');
    await userEvent.setup().click(await screen.findByTestId('home-legislation'));
    await screen.findAllByTestId('legal-change-row');
    expect(runtime.router.state.location.pathname).toBe('/legislation');
    expect(screen.getByTestId('nav-legislation').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('tab-changes').getAttribute('aria-current')).toBe('page');
  });
});

describe('a legal change', () => {
  it('shows the amended units, the review, and the law’s old and new text of each passage', async () => {
    mountAdmin(`/legislation/changes/${changeId}`);
    await screen.findByTestId('change-title');

    expect(screen.getByTestId('change-units').textContent).toContain(
      'Art. 36 alin. (2)modified 6 Nov 2026 by Legea 207/2026'
    );
    expect(screen.getByTestId('change-review').textContent).toContain('Art. 6 is referred to');
    const passage = screen.getByTestId('change-passage');
    expect(passage.textContent).toContain('2.2_general_training_material.docx');
    expect(passage.textContent).toContain('Art. 36 alin. (1) – (3)');
    const diff = within(passage).getByTestId('passage-diff');
    expect([...diff.querySelectorAll('del')].map((node) => node.textContent)).toEqual([
      'Removed: casca',
    ]);
    expect([...diff.querySelectorAll('ins')].map((node) => node.textContent)).toEqual([
      'Added: pe cap cască',
      'Added: pentru motocicliști',
    ]);
    const amending = screen.getByRole('link', { name: 'Legea 207/2026' });
    expect(amending.getAttribute('href')).toBe(
      'https://legislatie.just.ro/Public/DetaliiDocument/301234'
    );
  });

  it('says a passage the check could not compare was not compared, with no diff', async () => {
    current = {
      ...detail,
      passages: detail.passages.map((passage) => ({ ...passage, status: 'uncompared' as const })),
    };
    mountAdmin(`/legislation/changes/${changeId}`);

    const passage = await screen.findByTestId('change-passage');
    expect(passage.textContent).toContain('Could not be compared');
    expect(passage.textContent).toContain('The check could not compare this unit’s text');
    expect(within(passage).queryByTestId('passage-diff')).toBeNull();
  });

  it('is marked as no impact with a note members read', async () => {
    mountAdmin(`/legislation/changes/${changeId}`);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('mark-no-impact'));
    const dialog = await screen.findByTestId('no-impact-dialog');
    expect(within(dialog).getByLabelText('Note for members, in Romanian')).toBeTruthy();

    await user.click(within(dialog).getByTestId('no-impact-submit'));
    expect(within(dialog).getByTestId('no-impact-note-error')).toBeTruthy();
    expect(requests().some((call) => call.method === 'POST')).toBe(false);

    await user.type(
      within(dialog).getByTestId('no-impact-note'),
      '  Art. 36 alin. (2) nu e citat ca regulă.  '
    );
    await user.click(within(dialog).getByTestId('no-impact-submit'));

    expect((await screen.findByTestId('change-note')).textContent).toBe(
      'Art. 36 alin. (2) nu e citat ca regulă.'
    );
    const post = requests().find((call) => call.method === 'POST')!;
    expect(post.url.pathname).toBe(`/api/legislation/changes/${changeId}/no-impact`);
    expect(post.body).toEqual({ note: 'Art. 36 alin. (2) nu e citat ca regulă.' });
  });

  it('is resolved by a template version registered after it', async () => {
    mountAdmin(`/legislation/changes/${changeId}`);
    const user = userEvent.setup();
    const [candidate] = await screen.findAllByTestId('candidate-version');
    expect(candidate!.textContent).toContain('Material instruire generală · version 4');

    await user.click(within(candidate!).getByRole('button', { name: 'Resolve by this version' }));
    await user.click(await screen.findByTestId('link-version-submit'));

    const resolution = await screen.findByTestId('change-resolution');
    expect(resolution.textContent).toContain('Answered by');
    const post = requests().find((call) => call.method === 'POST')!;
    expect(post.url.pathname).toBe(`/api/legislation/changes/${changeId}/template-version`);
    expect(post.body).toEqual({ templateVersionId: versionId });
  });
});

describe('a legal change that cannot be resolved yet', () => {
  it('lists the act’s older open changes and offers no way to resolve it before them', async () => {
    current = {
      ...detail,
      olderOpenChanges: [
        { id: olderChangeId, consolidatedOn: '2026-10-30' },
        { id: 'd1d1d1d1-0000-4000-8000-000000000004', consolidatedOn: '2026-11-02' },
      ],
    };
    mountAdmin(`/legislation/changes/${changeId}`);

    const older = await screen.findByTestId('change-older-open');
    expect(older.textContent).toContain('Resolve the older open changes of this act first');
    expect(
      within(older).getByRole('link', { name: 'Form of 30 Oct 2026' }).getAttribute('href')
    ).toBe(`/legislation/changes/${olderChangeId}`);
    expect(screen.getByTestId<HTMLButtonElement>('mark-no-impact').disabled).toBe(true);
    const candidate = screen.getByTestId('candidate-version');
    expect(
      within(candidate).getByRole<HTMLButtonElement>('button', { name: 'Resolve by this version' })
        .disabled
    ).toBe(true);
  });

  it('waits for the daily check to assess it', async () => {
    current = { ...detail, outcome: null, assessedAt: null, awaitingAssessment: true };
    mountAdmin(`/legislation/changes/${changeId}`);

    expect((await screen.findByTestId('change-awaiting-assessment')).textContent).toContain(
      'has not assessed this change yet'
    );
    expect(screen.getByTestId<HTMLButtonElement>('mark-no-impact').disabled).toBe(true);
    expect(screen.queryByTestId('change-older-open')).toBeNull();
  });

  it.each([
    ['older_change_open', 'An older change of this act is still open', 'change-older-open'],
    ['change_not_assessed', 'has not assessed this change yet', 'change-awaiting-assessment'],
  ])(
    'explains the database’s %s refusal and reads the change again',
    async (reason, words, notice) => {
      refusal = reason;
      mountAdmin(`/legislation/changes/${changeId}`);
      const user = userEvent.setup();
      await user.click(await screen.findByTestId('mark-no-impact'));
      const dialog = await screen.findByTestId('no-impact-dialog');
      await user.type(within(dialog).getByTestId('no-impact-note'), 'Fără impact asupra textelor.');
      await user.click(within(dialog).getByTestId('no-impact-submit'));

      expect((await within(dialog).findByTestId('no-impact-error')).textContent).toContain(words);
      await screen.findByTestId(notice);
      expect(screen.getByTestId<HTMLButtonElement>('mark-no-impact').disabled).toBe(true);
    }
  );
});

describe('the watched acts', () => {
  it('lists the acts, sorts them by a column and records a verified form no later than the last seen', async () => {
    const runtime = mountAdmin('/legislation/acts');
    let rows = await screen.findAllByTestId('legal-act-row');
    expect(rows.map((row) => within(row).getAllByRole('link')[0]!.textContent)).toEqual([
      'Legea 319/2006',
      'O.U.G. 195/2002',
    ]);
    expect(within(rows[0]!).getByText('1 Oct 2026')).toBeTruthy();

    const user = userEvent.setup();
    await user.click(screen.getByTestId('sort-verified'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ sort: 'verified' }));
    rows = screen.getAllByTestId('legal-act-row');
    expect(within(rows[0]!).getByText('Legea 319/2006')).toBeTruthy();
    await user.click(screen.getByTestId('sort-verified'));
    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({ sort: 'verified', order: 'desc' })
    );
    rows = screen.getAllByTestId('legal-act-row');
    expect(within(rows[0]!).getByText('O.U.G. 195/2002')).toBeTruthy();

    await user.click(within(rows[0]!).getByTestId('record-verified-form'));
    const dialog = await screen.findByTestId('verified-form-dialog');
    const input = within(dialog).getByTestId<HTMLInputElement>('verified-form-date');
    expect(input.value).toBe('2026-11-06');
    expect(input.max).toBe('2026-11-06');
    const blocking = await within(dialog).findByTestId('verified-form-open-changes');
    expect(
      within(blocking).getByRole('link', { name: 'Form of 6 Nov 2026' }).getAttribute('href')
    ).toBe(`/legislation/changes/${changeId}`);
    const submit = within(dialog).getByTestId<HTMLButtonElement>('verified-form-submit');
    expect(submit.disabled).toBe(true);
    await user.clear(input);
    await user.type(input, '2026-12-01');
    expect(submit.disabled).toBe(true);
    await user.clear(input);
    await user.type(input, '2026-11-05');
    expect(within(dialog).queryByTestId('verified-form-open-changes')).toBeNull();
    await user.click(submit);

    await waitFor(() => expect(screen.queryByTestId('verified-form-dialog')).toBeNull());
    const put = requests().find((call) => call.method === 'PUT')!;
    expect(put.url.pathname).toBe('/api/legislation/acts/oug-195-2002/verified-form');
    expect(put.body).toEqual({ consolidatedOn: '2026-11-05' });
  });
});

describe('the verified form', () => {
  it('says a date before the form verified now corrects it', async () => {
    mountAdmin('/legislation/acts');
    const rows = await screen.findAllByTestId('legal-act-row');
    const user = userEvent.setup();
    await user.click(within(rows[1]!).getByTestId('record-verified-form'));
    const dialog = await screen.findByTestId('verified-form-dialog');
    expect(within(dialog).queryByTestId('verified-form-moves-back')).toBeNull();

    const input = within(dialog).getByTestId('verified-form-date');
    await user.clear(input);
    await user.type(input, '2026-08-01');

    expect(within(dialog).getByTestId('verified-form-moves-back').textContent).toContain(
      'before the form verified now, 25 Aug 2026'
    );
  });

  it('says to resolve the act’s open changes first when the database refuses the form', async () => {
    mountAdmin('/legislation/acts');
    const rows = await screen.findAllByTestId('legal-act-row');
    const user = userEvent.setup();
    await user.click(within(rows[0]!).getByTestId('record-verified-form'));
    const dialog = await screen.findByTestId('verified-form-dialog');
    await user.click(within(dialog).getByTestId('verified-form-submit'));

    expect((await within(dialog).findByTestId('verified-form-error')).textContent).toContain(
      'still open. Resolve it first.'
    );
  });
});

describe('the runs', () => {
  it('lists the runs with their errors and pages on', async () => {
    const runtime = mountAdmin('/legislation/runs');
    const [row] = await screen.findAllByTestId('legal-run-row');

    expect(within(row!).getByText('Failed')).toBeTruthy();
    expect(within(row!).getByTestId('run-errors').textContent).toContain(
      'The portal answered 503.'
    );
    expect(screen.getByTestId('pager-summary').textContent).toBe('1–25 of 30 runs');

    await userEvent.setup().click(screen.getByTestId('pager-next'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ page: 2 }));
    await waitFor(() => expect(requests().at(-1)!.url.searchParams.get('page')).toBe('2'));
  });
});
