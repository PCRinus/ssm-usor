import { describe, expect, it } from 'vitest';

import worker from './worker';

function envAnswering(response: Response) {
  return {
    ASSETS: { fetch: async () => response },
    SEARCH_INDEXING: 'allow',
  };
}

function redirect(location: string, status = 307) {
  return new Response(null, { status, headers: { location } });
}

describe('marketing worker', () => {
  it('makes the trailing-slash redirect permanent and keeps the query', async () => {
    const response = await worker.fetch(
      new Request('https://ssmusor.ro/preturi?x=1'),
      envAnswering(redirect('/preturi/?x=1'))
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('/preturi/?x=1');
  });

  it('leaves any other temporary redirect as it is', async () => {
    const response = await worker.fetch(
      new Request('https://ssmusor.ro/preturi/'),
      envAnswering(redirect('/preturi'))
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('/preturi');
  });

  it('passes a page through unchanged', async () => {
    const response = await worker.fetch(
      new Request('https://ssmusor.ro/preturi/'),
      envAnswering(new Response('<h1>Prețuri</h1>', { headers: { 'content-type': 'text/html' } }))
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('<h1>Prețuri</h1>');
  });
});
