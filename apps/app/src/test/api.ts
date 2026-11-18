import { afterEach, beforeEach, vi } from 'vitest';

import type { MeResponse } from '@/api/generated/api';

import { meRecord } from './records';
import { disposeRuntimes } from './runtimes';

export type Route = (
  init: RequestInit | undefined,
  url: URL
) => Response | Promise<Response> | undefined;

export const fetchMock = vi.fn<typeof fetch>();

export function mockApi(
  route: Route,
  { me = meRecord() }: { me?: MeResponse | Pick<MeResponse, 'user'> | null } = {}
) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const answer = route(init, url);
    if (answer) return answer;
    if (url.pathname === '/me' && me) return Response.json(me);
    throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url.pathname}`);
  });
}

// Vitest runs these files without isolation, so the mock and the runtimes a test leaves behind
// would otherwise answer and refetch in the next file. Teardown hooks run in reverse: call this
// after a file's own afterEach so runtimes are disposed first, and before a beforeEach that sets
// the mock's answers, which the reset here would otherwise wipe.
export function installFetchMock() {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
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
