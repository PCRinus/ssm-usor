import type { AdminImportDetail, AdminImportList } from '@ssm-usor/contracts';
import type { Session } from '@supabase/supabase-js';
import { createMemoryHistory } from '@tanstack/react-router';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type AdminRuntime, createAdminRuntime } from '@/app/admin-runtime';
import App from '@/app/App';
import type { AuthClient } from '@/features/auth/auth-store';
import { createQueryClient } from '@/lib/query-client';

const encode = (value: unknown) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const session = {
  access_token: `${encode({ alg: 'HS256' })}.${encode({ sub: 'user-1', aal: 'aal2' })}.signature`,
  refresh_token: 'refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: {
    id: 'user-1',
    app_metadata: { role: 'admin' },
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-11-04T08:00:00Z',
    email: 'mircea@example.ro',
    factors: [
      {
        id: 'factor-1',
        factor_type: 'totp',
        status: 'verified',
        created_at: '2026-11-04T08:00:00Z',
        updated_at: '2026-11-04T08:00:00Z',
      },
    ],
  },
} as Session;

const client = {
  getSession: vi.fn(async () => ({ data: { session }, error: null })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  mfa: {
    listFactors: vi.fn(async () => ({ data: { all: session.user.factors ?? [] }, error: null })),
    unenroll: vi.fn(),
    enroll: vi.fn(),
    challengeAndVerify: vi.fn(),
  },
} as unknown as AuthClient;

const importId = '6f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const goneId = '7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const organizationId = '3b1d6d2a-1d4e-4d7b-9a40-8e3a7c1b2f10';

const list: AdminImportList = {
  items: [
    {
      id: importId,
      organization: { id: organizationId, name: 'Protecția Muncii Expert SRL' },
      rowDeleted: false,
      kind: 'client',
      status: 'confirmed',
      createdAt: '2026-11-03T08:00:00+00:00',
      endedAt: '2026-11-03T09:10:00+00:00',
      readingVersion: 'a1b2c3d4',
      flags: { unreadableFiles: 1, nothingFound: 0, emptyRequired: 2, checks: 4 },
      changedShare: 0.25,
      costUsd: 0.42,
      reportedAt: '2026-11-03T09:20:00+00:00',
      copy: {
        writtenAt: '2026-11-03T09:10:05+00:00',
        expiresAt: '2027-11-03T09:10:00+00:00',
        removedAt: null,
        completedAt: '2026-11-03T09:10:09+00:00',
      },
      partCopies: 1,
      incompletePartCopies: 1,
    },
    {
      id: goneId,
      organization: { id: organizationId, name: 'Protecția Muncii Expert SRL' },
      rowDeleted: true,
      kind: null,
      status: null,
      createdAt: null,
      endedAt: '2026-10-01T09:10:00+00:00',
      readingVersion: null,
      flags: null,
      changedShare: null,
      costUsd: null,
      reportedAt: null,
      copy: {
        writtenAt: '2026-10-01T09:10:05+00:00',
        expiresAt: '2027-10-01T09:10:00+00:00',
        removedAt: null,
        completedAt: '2026-10-01T09:10:12+00:00',
      },
      partCopies: 0,
      incompletePartCopies: 0,
    },
  ],
  page: 1,
  pageSize: 25,
  total: 60,
};

const detail: AdminImportDetail = {
  id: importId,
  organization: { id: organizationId, name: 'Protecția Muncii Expert SRL' },
  import: {
    kind: 'client',
    status: 'confirmed',
    failureReason: null,
    clientId: null,
    intoExistingClient: false,
    createdAt: '2026-11-03T08:00:00+00:00',
    startedAt: '2026-11-03T08:01:00+00:00',
    readyAt: '2026-11-03T08:20:00+00:00',
    confirmedAt: '2026-11-03T09:10:00+00:00',
    abandonedAt: null,
    failedAt: null,
    reportedAt: '2026-11-03T09:20:00+00:00',
    reportedBy: '0f7c8d96-479c-47b3-b49e-01f4555a0221',
    costUsd: 0.42,
    inputTokens: 120_000,
    cachedInputTokens: 30_000,
    outputTokens: 9_000,
    readingVersion: { models: { reading: 'gpt-5.2' }, prompts: 'a1b2c3d4e5f6' },
    readingFlags: {
      files: {
        total: 4,
        byKind: { decision: 2, pdf: 2 },
        unreadable: [{ file: 3, kind: 'pdf' }],
        setAside: 0,
        forEmployees: 0,
        otherCompany: 0,
      },
      found: { jobPositions: 5, employees: 12 },
      emptyRequired: ['client.cui'],
      checks: { quote_not_found: 4 },
    },
    quality: { client: { changed: 6, unticked: 4, kept: 10 } },
    flags: { unreadableFiles: 1, nothingFound: 0, emptyRequired: 1, checks: 4 },
    changedShare: 0.25,
  },
  parts: [
    {
      part: 'risk_evaluations',
      status: 'confirmed',
      attempt: 1,
      failureReason: null,
      readAt: '2026-11-03T08:40:00+00:00',
      confirmedAt: '2026-11-03T09:30:00+00:00',
      failedAt: null,
      reportedAt: null,
      reportedBy: null,
      costUsd: 0.12,
      readingVersion: null,
      readingFlags: { found: { factors: 12 }, checks: { 'factor.level_mismatch': 2 } },
      quality: null,
      flags: { unreadableFiles: 0, nothingFound: 0, emptyRequired: 0, checks: 2 },
      changedShare: null,
    },
  ],
  copies: [
    {
      id: 'c0c0c0c0-0000-4000-8000-000000000001',
      part: null,
      writtenAt: '2026-11-03T09:10:05+00:00',
      expiresAt: '2027-11-03T09:10:00+00:00',
      removedAt: null,
      completedAt: '2026-11-03T09:10:09+00:00',
    },
    {
      id: 'c0c0c0c0-0000-4000-8000-000000000002',
      part: 'risk_evaluations',
      writtenAt: '2026-11-03T09:30:05+00:00',
      expiresAt: '2027-11-03T09:30:00+00:00',
      removedAt: null,
      completedAt: null,
    },
  ],
  record: {
    import: importId,
    proposal: { client: { legalName: { options: [{ value: 'Construcții Vest SRL' }] } } },
    changes: { client: { legalName: 'Construcții Vest S.R.L.' } },
    usage: { costUsd: 0.42 },
  },
  partRecords: [],
  files: [
    { path: 'files/f1.pdf', sizeBytes: 120_000 },
    { path: 'record.json', sizeBytes: 2_048 },
  ],
};

const fetchMock = vi.fn<typeof fetch>();
const runtimes: AdminRuntime[] = [];

function mount(path: string) {
  const runtime = createAdminRuntime(
    client,
    createQueryClient(),
    createMemoryHistory({ initialEntries: [path] }),
    'http://localhost:5176'
  );
  runtimes.push(runtime);
  render(<App runtime={runtime} />);
  return runtime;
}

const requested = () =>
  fetchMock.mock.calls
    .map(([input]) => new URL(String(input)))
    .filter((url) => url.pathname !== '/api/impersonation');

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/impersonation') return Response.json({ impersonation: null });
    if (url.pathname === '/api/imports') return Response.json(list);
    if (url.pathname === `/api/imports/${importId}`) return Response.json(detail);
    if (url.pathname === `/api/imports/${importId}/files`) {
      return Response.json({
        url: 'https://example.supabase.co/storage/v1/object/sign/import-copies/x?token=t',
        expiresAt: '2026-11-05T10:01:00.000Z',
      });
    }
    if (url.pathname === `/api/imports/${goneId}`) {
      return Response.json({
        ...detail,
        id: goneId,
        import: null,
        parts: [],
        record: {
          import: goneId,
          kind: 'employees',
          status: 'abandoned',
          proposal: { people: [] },
        },
      });
    }
    return Response.json({ error: 'not_found', message: 'No such import.' }, { status: 404 });
  });
});

afterEach(() => {
  runtimes.splice(0).forEach((runtime) => runtime.dispose());
  vi.unstubAllGlobals();
});

describe('the imports list', () => {
  it('shows every import with its organization, flags, report and copy, and pages on', async () => {
    const runtime = mount('/imports');
    const rows = await screen.findAllByTestId('import-row');

    expect(rows).toHaveLength(2);
    const first = within(rows[0]!);
    expect(first.getByText('Client')).toBeTruthy();
    expect(first.getByText('Protecția Muncii Expert SRL')).toBeTruthy();
    expect(first.getByText('Confirmed')).toBeTruthy();
    expect(first.getByTestId('reported-badge')).toBeTruthy();
    expect(first.getByText('1 unreadable')).toBeTruthy();
    expect(first.getByText('2 empty required')).toBeTruthy();
    expect(first.getByText('4 checks')).toBeTruthy();
    expect(first.getByText('25%')).toBeTruthy();
    expect(first.getByText('$0.42')).toBeTruthy();
    expect(first.getByText('a1b2c3d4')).toBeTruthy();
    expect(rows[0]!.textContent).toContain('Until 3 Nov 2027');
    expect(rows[0]!.textContent).toContain('+ 1 part');
    expect(first.getByTestId('copy-incomplete').title).toBe('A copy has not finished writing');
    expect(within(rows[1]!).queryByTestId('copy-incomplete')).toBeNull();
    expect(within(rows[1]!).getByText('Row deleted')).toBeTruthy();
    expect(screen.getByTestId('pager-summary').textContent).toBe('1–25 of 60 imports');
    expect(requested()[0]!.search).toBe('?page=1&pageSize=25');

    await userEvent.setup().click(screen.getByTestId('pager-next'));
    await waitFor(() => expect(runtime.router.state.location.search).toEqual({ page: 2 }));
    await waitFor(() => expect(requested().at(-1)!.searchParams.get('page')).toBe('2'));
  });

  it('filters by kind, status, reports and copies through the address', async () => {
    const runtime = mount('/imports?page=2');
    await screen.findAllByTestId('import-row');
    const user = userEvent.setup();

    await user.selectOptions(screen.getByTestId('filter-kind'), 'client');
    await user.selectOptions(screen.getByTestId('filter-status'), 'row_deleted');
    await user.click(screen.getByTestId('filter-reported'));
    await user.click(screen.getByTestId('filter-has-copy'));

    await waitFor(() =>
      expect(runtime.router.state.location.search).toEqual({
        kind: 'client',
        status: 'row_deleted',
        reported: true,
        hasCopy: true,
      })
    );
    await waitFor(() =>
      expect(requested().at(-1)!.search).toBe(
        '?page=1&pageSize=25&kind=client&status=row_deleted&reported=true&hasCopy=true'
      )
    );
  });

  it('opens an import from its row', async () => {
    const runtime = mount('/imports');
    const [row] = await screen.findAllByTestId('import-row');
    await userEvent.setup().click(within(row!).getByText('Protecția Muncii Expert SRL'));
    await screen.findByTestId('import-title');
    expect(runtime.router.state.location.pathname).toBe(`/imports/${importId}`);
  });

  it('is reached from the home page and the top bar', async () => {
    fetchMock.mockImplementationOnce(async () =>
      Response.json({ id: 'user-1', email: 'mircea@example.ro' })
    );
    const runtime = mount('/');
    await userEvent.setup().click(await screen.findByTestId('home-imports'));
    await screen.findAllByTestId('import-row');
    expect(runtime.router.state.location.pathname).toBe('/imports');
    expect(screen.getByTestId('nav-imports').getAttribute('aria-current')).toBe('page');
  });
});

describe('an import', () => {
  it('shows its header, flags, quality, report, parts and its copy side by side, loaded once', async () => {
    mount(`/imports/${importId}`);

    expect((await screen.findByTestId('import-title')).textContent).toBe('Client import');
    const flags = screen.getByTestId('import-flags');
    expect(flags.textContent).toContain('file 3 (pdf)');
    expect(flags.textContent).toContain('client.cui');
    expect(flags.textContent).toContain('quote_not_found 4');
    expect(screen.getByTestId('import-reports').textContent).toContain(
      '0f7c8d96-479c-47b3-b49e-01f4555a0221'
    );
    expect(screen.getByTestId('import-part').textContent).toContain('Risk evaluations');
    expect(screen.getByTestId('import-part').textContent).toContain('factor.level_mismatch 2');
    const sideBySide = screen.getByTestId('copy-side-by-side');
    expect(within(sideBySide).getByTestId('copy-proposal').textContent).toContain(
      'Construcții Vest SRL'
    );
    expect(within(sideBySide).getByTestId('copy-changes').textContent).toContain(
      'Construcții Vest S.R.L.'
    );
    expect(screen.getAllByTestId('copy-file').map((row) => row.textContent)).toEqual([
      expect.stringContaining('files/f1.pdf'),
      expect.stringContaining('record.json'),
    ]);
    expect(requested().filter((url) => url.pathname === `/api/imports/${importId}`)).toHaveLength(
      1
    );
  });

  it('marks a copy that has not finished writing, and says the clean-up retries it', async () => {
    mount(`/imports/${importId}`);

    const [own, part] = await screen.findAllByTestId('copy-row');
    expect(within(own!).queryByTestId('copy-incomplete')).toBeNull();
    expect(part!.textContent).toContain('Risk evaluations');
    expect(within(part!).getByTestId('copy-incomplete').textContent).toBe('Incomplete');
    expect(part!.textContent).toContain(
      'The copy has not finished writing; the daily clean-up retries it.'
    );
  });

  it('opens a file of the copy through a short-lived link, in a tab of its own', async () => {
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    const open = vi.fn(() => tab);
    vi.stubGlobal('open', open);
    mount(`/imports/${importId}`);
    const [file] = await screen.findAllByTestId('copy-file');

    await userEvent.setup().click(within(file!).getByRole('button', { name: 'Open' }));

    await waitFor(() =>
      expect(tab.location.href).toBe(
        'https://example.supabase.co/storage/v1/object/sign/import-copies/x?token=t'
      )
    );
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(tab.opener).toBeNull();
    expect(requested().at(-1)!.search).toBe('?path=files%2Ff1.pdf');
  });

  it('shows what the copy holds of an import whose row is gone', async () => {
    mount(`/imports/${goneId}`);
    expect((await screen.findByTestId('import-title')).textContent).toBe('Employees import');
    expect(screen.getByTestId('row-deleted')).toBeTruthy();
    expect(screen.getByTestId('copy-proposal').textContent).toContain('people');
    expect(screen.getAllByTestId('copy-row')[1]!.textContent).toContain(
      'with the import’s row gone the clean-up will not retry it'
    );
  });

  it('says so for an import with neither row nor copy', async () => {
    mount('/imports/aaaaaaaa-0000-4000-8000-00000000ffff');
    expect((await screen.findByTestId('import-not-found')).textContent).toContain('No such import');
  });
});
