import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PostHog } from 'posthog-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture, makeSession } from '@/test/auth-fixture';
import { employeeDetail } from '@/test/employee-import-fixture';
import {
  clientId,
  fetchMock,
  importId,
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
    { ...partFields, part: 'risk_evaluations', postReferences: {}, existingFactors: null },
  ],
  posts: [],
};

function mockImport(
  detail: ReturnType<typeof readyDetail> | ReturnType<typeof employeeDetail>,
  report: () => Response = () => new Response(null, { status: 204 })
) {
  mockApi((init, url) => {
    const method = init?.method ?? 'GET';
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

const received = 'Am primit semnalarea. Ne uităm la import.';

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  posthog.client = null;
  posthog.openSupportChat.mockReset().mockResolvedValue(true);
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
    expect(screen.queryByText(received)).toBeNull();
  });

  it('says the report was received when the support chat is not there', async () => {
    mockImport(readyDetail());
    mount(`/clienti/import/${importId}`);

    await userEvent.click(await reportButton());

    expect(await screen.findByText(received)).toBeTruthy();
    expect(requestsTo(`/imports/${importId}/report`, 'POST')).toHaveLength(1);
    expect(posthog.openSupportChat).not.toHaveBeenCalled();
  });

  it('says the report failed, and opens no support chat, when the API refuses it', async () => {
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
    expect(screen.queryByText(received)).toBeNull();
  });

  it('reports the employee import from its review page', async () => {
    mockImport(employeeDetail());
    mount(`/clienti/${clientId}/angajati/import/${importId}`);

    await screen.findByTestId('employee-hub');
    await userEvent.click(await reportButton());

    expect(await screen.findByText(received)).toBeTruthy();
    expect(requestsTo(`/imports/${importId}/report`, 'POST')).toHaveLength(1);
  });

  it.each([
    ['instructiuni/ssm', 'instructions_ssm'],
    ['evaluari-de-risc', 'risk_evaluations'],
  ])('reports the part on its own page, %s', async (page, part) => {
    mockImport(readyDetail());
    mount(`/clienti/import/${importId}/${page}`);

    await screen.findByTestId('library-task');
    await userEvent.click(await reportButton());

    expect(await screen.findByText(received)).toBeTruthy();
    expect(requestsTo(`/imports/${importId}/library-parts/${part}/report`, 'POST')).toHaveLength(1);
    expect(requestsTo(`/imports/${importId}/report`, 'POST')).toHaveLength(0);
  });
});
