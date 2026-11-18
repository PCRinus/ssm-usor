import { createLegislationClient, type LegislationTables } from '../database';

export type Table = keyof LegislationTables;
export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface SentRequest {
  url: URL;
  body: ReturnType<typeof JSON.parse>;
}

export type Routes = Partial<
  Record<`${Table} ${Method}`, (request: SentRequest) => Response | Promise<Response>>
>;

export function fakeDatabase(routes: Routes) {
  const requests: (SentRequest & { route: string })[] = [];
  const fetchFake: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const route = `${url.pathname.replace('/rest/v1/', '')} ${init?.method ?? 'GET'}`;
    const request = { url, body: init?.body ? JSON.parse(String(init.body)) : null };
    requests.push({ ...request, route });
    const answer = routes[route as keyof Routes];
    if (!answer) throw new Error(`Unexpected request: ${route} ${url}`);
    return answer(request);
  };
  return {
    db: createLegislationClient('https://example.supabase.co', 'sb_secret_test', fetchFake),
    sent: (table: Table, method: Method): SentRequest[] =>
      requests
        .filter((request) => request.route === `${table} ${method}`)
        .map(({ url, body }) => ({ url, body })),
  };
}
