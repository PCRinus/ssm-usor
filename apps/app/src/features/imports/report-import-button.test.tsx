import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PostHog } from 'posthog-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { employeeDetail } from '@/test/employee-import-fixture';
import {
  clientId,
  fetchMock,
  importDetail,
  importId,
  meResponse,
  mockApi,
  readyDetail,
  requestsTo,
} from '@/test/import-fixture';
import { disposeRuntimes, mountApp } from '@/test/mount';

const { posthog } = vi.hoisted(() => ({
  posthog: {
    client: null as PostHog | null,
    openSupportChat: vi.fn<(client: PostHog) => Promise<boolean>>(),
  },
}));
vi.mock('@/app/observability/posthog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/observability/posthog')>()),
  loadPostHog: () => Promise.resolve(posthog.client),
  openSupportChat: posthog.openSupportChat,
  stopPostHog: () => {},
}));

function fakePostHog() {
  return {
    opt_in_capturing: vi.fn(),
    startSessionRecording: vi.fn(),
    identify: vi.fn(),
    resetGroups: vi.fn(),
    unregister: vi.fn(),
    group: vi.fn(),
    register: vi.fn(),
    capture: vi.fn(),
    setIdentity: vi.fn(),
    conversations: {
      isAvailable: () => true,
      getTickets: () => Promise.resolve({ results: [] }),
    },
  };
}

const client = {
  id: clientId,
  legalName: 'Brutăria Spicul Auriu SRL',
  cui: '31458207',
  vatPayer: true,
  caenCode: '1071',
  tradeRegisterNumber: 'J32/412/2013',
  countyCode: 'SB',
  locality: 'Sibiu',
  addressLine: 'Str. Morilor nr. 14',
  legalRepresentativeName: null,
  declaredEmployeeCount: 0,
  currentEmployeeCount: 0,
  stage: 'client',
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  promotedAt: null,
  createdAt: '2026-09-17T10:00:00+00:00',
  updatedAt: '2026-09-17T10:00:00+00:00',
  archivedAt: null,
};

const partFields = {
  status: 'failed',
  attempt: 1,
  failureReason: 'Citirea s-a oprit înainte de final.',
  version: 0,
  counts: null,
  readAt: null,
  confirmedAt: null,
  expiresAt: null,
  credits: 25,
  changes: null,
  proposal: null,
};

const libraryParts = {
  parts: [
    { ...partFields, part: 'instructions_ssm', domain: 'ssm', positionPosts: {} },
    { ...partFields, part: 'instructions_su', domain: 'su', credits: 10, positionPosts: {} },
    { ...partFields, part: 'risk_evaluations', postReferences: {}, existingFactors: null },
  ],
  posts: [],
};

let me: unknown = meResponse;

function mockImport(
  detail: ReturnType<typeof importDetail> | ReturnType<typeof employeeDetail>,
  report: () => Response = () => new Response(null, { status: 204 })
) {
  mockApi((init, url) => {
    const method = init?.method ?? 'GET';
    if (url.pathname === '/me') return Response.json(me);
    if (url.pathname === '/me/support-identity') {
      return Response.json({ distinctId: 'user-one', hash: 'support-hash' });
    }
    if (url.pathname === `/imports/${importId}` && method === 'GET') {
      return Response.json({ import: detail });
    }
    if (url.pathname.startsWith(`/imports/${importId}/`) && url.pathname.endsWith('/report')) {
      return report();
    }
    if (url.pathname === `/imports/${importId}/library-parts`) return Response.json(libraryParts);
    if (url.pathname === '/imports') return Response.json({ items: [] });
    if (url.pathname === '/clients') {
      return Response.json({ items: [], page: 1, pageSize: 25, total: 0 });
    }
    if (url.pathname === `/clients/${clientId}`) {
      return Response.json({ client, canDelete: false });
    }
    if (
      url.pathname === `/clients/${clientId}/job-positions` ||
      url.pathname === `/clients/${clientId}/workplaces`
    ) {
      return Response.json({ items: [] });
    }
    if (url.pathname === `/clients/${clientId}/found-sheets`) {
      return Response.json({ items: [], total: 0 });
    }
    return undefined;
  });
}

const mount = (path: string) => mountApp(authFixture(makeSession()).client, path);

const reportButton = () =>
  screen.findByRole('button', { name: 'Raportează o problemă cu importul' });

const emailDialog = () => screen.findByTestId('report-problem-dialog');

const recorded = 'Am primit semnalarea și ne uităm la import.';

const failedAt = '2026-10-28T09:30:00+00:00';
const failureReason = 'Citirea s-a oprit din cauza unei erori.';

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  posthog.client = null;
  posthog.openSupportChat.mockReset().mockResolvedValue(true);
  me = meResponse;
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('reporting a problem with an import', () => {
  it('records the report on the client import and opens the support chat after it', async () => {
    const fake = fakePostHog();
    posthog.client = fake as unknown as PostHog;
    mockImport(readyDetail());
    mount(`/clienti/import/${importId}`);

    await screen.findByTestId('import-review-hub');
    await waitFor(() => expect(fake.setIdentity).toHaveBeenCalled());
    await userEvent.click(await reportButton());

    await waitFor(() => expect(posthog.openSupportChat).toHaveBeenCalledWith(fake));
    const [reported] = requestsTo(`/imports/${importId}/report`, 'POST');
    expect(reported).toBeDefined();
    expect(
      fetchMock.mock.invocationCallOrder[fetchMock.mock.calls.indexOf(reported!)]
    ).toBeLessThan(posthog.openSupportChat.mock.invocationCallOrder[0]!);
    expect(screen.queryByTestId('report-problem-dialog')).toBeNull();
  });

  it('says the report was recorded and gives the support address when the chat cannot open', async () => {
    const fake = fakePostHog();
    posthog.client = fake as unknown as PostHog;
    posthog.openSupportChat.mockResolvedValue(false);
    mockImport(readyDetail());
    mount(`/clienti/import/${importId}`);

    await waitFor(() => expect(fake.setIdentity).toHaveBeenCalled());
    await userEvent.click(await reportButton());

    const dialog = await emailDialog();
    expect(dialog.textContent).toContain(recorded);
    expect(within(dialog).getByTestId('report-problem-email').textContent).toBe(
      'contact@ssmusor.ro'
    );
    expect(requestsTo(`/imports/${importId}/report`, 'POST')).toHaveLength(1);
  });

  it('records the report and gives the support address when PostHog is off', async () => {
    mockImport(readyDetail());
    mount(`/clienti/import/${importId}`);

    await userEvent.click(await reportButton());

    expect((await emailDialog()).textContent).toContain(recorded);
    expect(requestsTo(`/imports/${importId}/report`, 'POST')).toHaveLength(1);
    expect(posthog.openSupportChat).not.toHaveBeenCalled();
  });

  it('says the report failed, and opens neither the chat nor the address, when the API refuses it', async () => {
    const fake = fakePostHog();
    posthog.client = fake as unknown as PostHog;
    mockImport(readyDetail(), () =>
      Response.json({ code: 'internal_error', message: 'Boom.' }, { status: 500 })
    );
    mount(`/clienti/import/${importId}`);

    await waitFor(() => expect(fake.setIdentity).toHaveBeenCalled());
    await userEvent.click(await reportButton());

    expect(
      await screen.findByText('Nu am putut trimite semnalarea. Încearcă din nou.')
    ).toBeTruthy();
    expect(posthog.openSupportChat).not.toHaveBeenCalled();
    expect(screen.queryByTestId('report-problem-dialog')).toBeNull();
  });

  it('reports a client import whose reading stopped, from its notice', async () => {
    mockImport(importDetail({ status: 'failed', failedAt, failureReason }));
    mount(`/clienti/import/${importId}`);

    const notice = await screen.findByTestId('import-failed');
    await userEvent.click(
      await within(notice).findByRole('button', { name: 'Raportează o problemă cu importul' })
    );

    await emailDialog();
    expect(requestsTo(`/imports/${importId}/report`, 'POST')).toHaveLength(1);
  });

  it('reports the employee import from its review page', async () => {
    mockImport(employeeDetail());
    mount(`/clienti/${clientId}/angajati/import/${importId}`);

    await screen.findByTestId('employee-hub');
    await userEvent.click(await reportButton());

    await emailDialog();
    expect(requestsTo(`/imports/${importId}/report`, 'POST')).toHaveLength(1);
  });

  it('reports an employee import whose reading stopped, from its notice', async () => {
    mockImport(employeeDetail({ status: 'failed', failedAt, failureReason }));
    mount(`/clienti/${clientId}/angajati/import/${importId}`);

    const notice = await screen.findByTestId('employee-processing-failed');
    await userEvent.click(
      await within(notice).findByRole('button', { name: 'Raportează o problemă cu importul' })
    );

    await emailDialog();
    expect(requestsTo(`/imports/${importId}/report`, 'POST')).toHaveLength(1);
  });

  it('keeps the button on the client import after the client is created', async () => {
    mockImport(
      importDetail({
        status: 'confirmed',
        confirmedAt: failedAt,
        client: { id: clientId, legalName: client.legalName },
        libraryParts: [{ part: 'instructions_ssm', status: 'ready', expiresAt: null }],
      })
    );
    mount(`/clienti/import/${importId}`);

    await screen.findByTestId('import-confirmed-hub');
    await userEvent.click(await reportButton());

    await emailDialog();
    expect(requestsTo(`/imports/${importId}/report`, 'POST')).toHaveLength(1);
  });

  it('keeps the button on a confirmed client import with nothing left to confirm', async () => {
    mockImport(
      importDetail({
        status: 'confirmed',
        confirmedAt: failedAt,
        client: { id: clientId, legalName: client.legalName },
      })
    );
    mount(`/clienti/import/${importId}`);

    await screen.findByTestId('import-processing');
    await userEvent.click(await reportButton());

    await emailDialog();
    expect(requestsTo(`/imports/${importId}/report`, 'POST')).toHaveLength(1);
  });

  it('keeps the button on a confirmed employee import', async () => {
    mockImport(employeeDetail({ status: 'confirmed', confirmedAt: failedAt }));
    mount(`/clienti/${clientId}/angajati/import/${importId}`);

    await screen.findByTestId('employee-processing');
    await userEvent.click(await reportButton());

    await emailDialog();
    expect(requestsTo(`/imports/${importId}/report`, 'POST')).toHaveLength(1);
  });

  it.each([
    ['instructiuni/ssm', 'instructions_ssm'],
    ['instructiuni/su', 'instructions_su'],
    ['evaluari-de-risc', 'risk_evaluations'],
  ])('reports the part on its own page, %s', async (page, part) => {
    mockImport(readyDetail());
    mount(`/clienti/import/${importId}/${page}`);

    await screen.findByTestId('library-task');
    await userEvent.click(await reportButton());

    await emailDialog();
    expect(requestsTo(`/imports/${importId}/library-parts/${part}/report`, 'POST')).toHaveLength(1);
    expect(requestsTo(`/imports/${importId}/report`, 'POST')).toHaveLength(0);
  });

  const confirmed = importDetail({
    status: 'confirmed',
    confirmedAt: failedAt,
    client: { id: clientId, legalName: client.legalName },
    libraryParts: [{ part: 'instructions_ssm', status: 'ready', expiresAt: null }],
  });

  it.each([
    ['the client review', readyDetail(), `/clienti/import/${importId}`, 'import-review-hub'],
    [
      'a stopped client import',
      importDetail({ status: 'failed', failedAt, failureReason }),
      `/clienti/import/${importId}`,
      'import-failed',
    ],
    ['a confirmed client import', confirmed, `/clienti/import/${importId}`, 'import-confirmed-hub'],
    ['a part', readyDetail(), `/clienti/import/${importId}/evaluari-de-risc`, 'library-task'],
    [
      'the employee review',
      employeeDetail(),
      `/clienti/${clientId}/angajati/import/${importId}`,
      'employee-hub',
    ],
    [
      'a stopped employee import',
      employeeDetail({ status: 'failed', failedAt, failureReason }),
      `/clienti/${clientId}/angajati/import/${importId}`,
      'employee-processing-failed',
    ],
  ])(
    'shows no button on %s to an admin impersonating the member',
    async (_, detail, path, page) => {
      me = {
        ...meResponse,
        user: { id: 'platform-admin', email: 'admin@example.test' },
        impersonation: {
          targetMemberId: 'user-one',
          targetOrganizationId: meResponse.membership.organization.id,
        },
      };
      mockImport(detail);
      mount(path);

      await screen.findByTestId(page);
      await waitFor(() => expect(requestsTo('/me')).not.toHaveLength(0));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(
        screen.queryByRole('button', { name: 'Raportează o problemă cu importul' })
      ).toBeNull();
    }
  );
});
