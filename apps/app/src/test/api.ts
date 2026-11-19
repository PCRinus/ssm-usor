import { setupStepIds } from '@ssm-usor/contracts';
import { afterEach, beforeEach, expect, onTestFinished, vi } from 'vitest';

import type {
  DashboardSummary,
  DocumentsBehindSummary,
  ImportListResponse,
  MeResponse,
  ReleaseListResponse,
  SetupGuide,
} from '@/api/generated/api';

import { quietSummary } from './dashboard-fixture';
import { clientId, meRecord, meResponse } from './records';
import { disposeRuntimes } from './runtimes';

export type Route = (
  init: RequestInit | undefined,
  url: URL
) => Response | Promise<Response> | undefined;

export const fetchMock = vi.fn<typeof fetch>();

export const finishedSetupGuide: SetupGuide = {
  steps: setupStepIds.map((id) => ({ id, state: 'done', canDo: true })),
  next: null,
  clientId,
  ownerName: meResponse.profile.fullName,
  organizationHasClients: true,
  closed: false,
  finished: true,
};

// Keyed by path and query exactly as the shell asks, so a page's own read of the same path stays
// unrouted and its test must answer it.
const shellReads: Record<string, () => unknown> = {
  '/releases': () => ({ items: [] }) satisfies ReleaseListResponse,
  '/me/setup': () => finishedSetupGuide,
  '/documents/behind/summary': () =>
    ({
      counts: { occupational_safety: 0, fire_safety: 0 },
      running: [],
    }) satisfies DocumentsBehindSummary,
  '/imports?kind=all&withOpenParts=true': () => ({ items: [] }) satisfies ImportListResponse,
};

// The dashboard's own read, not the shell's: answered because mountApp lands on /dashboard.
const landingPageReads: Record<string, () => unknown> = {
  '/dashboard/summary': () => quietSummary satisfies DashboardSummary,
};

const defaultReads = { ...shellReads, ...landingPageReads };

const unroutedRequests: string[] = [];

export const takeUnroutedRequests = () => unroutedRequests.splice(0);

export function mockApi(
  route: Route,
  { me = meRecord() }: { me?: MeResponse | Pick<MeResponse, 'user'> | null } = {}
) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const answer = route(init, url);
    if (answer) return answer;
    if (url.pathname === '/me' && me) return Response.json(me);
    const method = init?.method ?? 'GET';
    const defaultRead = method === 'GET' ? defaultReads[`${url.pathname}${url.search}`] : undefined;
    if (defaultRead) return Response.json(defaultRead());
    unroutedRequests.push(`${method} ${url.pathname}${url.search}`);
    throw new Error(`Unexpected request: ${method} ${url.pathname}`);
  });
}

// Vitest runs these files without isolation, so the mock and the runtimes a test leaves behind
// would otherwise answer and refetch in the next file. Teardown hooks run in reverse: call this
// after a file's own afterEach so runtimes are disposed first, and before a beforeEach that sets
// the mock's answers, which the reset here would otherwise wipe.
export function installFetchMock() {
  beforeEach(() => {
    fetchMock.mockReset();
    unroutedRequests.length = 0;
    vi.stubGlobal('fetch', fetchMock);
    // React Query catches the refusal and the page shows its error state, so only this check fails
    // the test. Not an afterEach: one that throws skips RTL's cleanup, and without isolation the
    // next tests in the worker then find this page still mounted.
    onTestFinished(() => {
      expect([...new Set(takeUnroutedRequests())], 'requests nobody routed').toEqual([]);
    });
  });
  afterEach(() => {
    disposeRuntimes();
    vi.unstubAllGlobals();
  });
}

export const requestsTo = (pathname: string, method = 'GET') =>
  fetchMock.mock.calls.filter(
    ([input, init]) =>
      new URL(String(input)).pathname === pathname && (init?.method ?? 'GET') === method
  );

export const bodyOf = (pathname: string, method: string, index = 0) =>
  JSON.parse(String(requestsTo(pathname, method)[index]?.[1]?.body)) as unknown;

export const bodiesOf = (pathname: string, method: string) =>
  requestsTo(pathname, method).map(([, init]) =>
    init?.body ? (JSON.parse(String(init.body)) as unknown) : null
  );
