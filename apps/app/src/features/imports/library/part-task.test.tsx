import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { installFetchMock } from '@/test/api';
import { authFixture, makeSession } from '@/test/auth-fixture';
import { importId, mockApi, readyDetail, requestsTo } from '@/test/import-fixture';
import { mountApp } from '@/test/mount';

installFetchMock();

const partFields = {
  status: 'failed',
  attempt: 1,
  failureReason: null,
  version: 0,
  counts: null,
  readAt: null,
  confirmedAt: null,
  expiresAt: null,
  credits: 25,
  changes: null,
  proposal: null,
};

const instructions = { ...partFields, part: 'instructions_ssm', domain: 'ssm', positionPosts: {} };
const risks = {
  ...partFields,
  part: 'risk_evaluations',
  postReferences: {},
  existingFactors: null,
};

function mockParts(parts: unknown[]) {
  mockApi((init, url) => {
    const method = init?.method ?? 'GET';
    if (url.pathname === `/imports/${importId}` && method === 'GET') {
      return Response.json({ import: readyDetail() });
    }
    if (url.pathname === `/imports/${importId}/library-parts`) {
      return Response.json({ parts, posts: [] });
    }
    if (url.pathname.endsWith('/retry') && method === 'POST')
      return new Response(null, { status: 204 });
    if (url.pathname === '/imports') return Response.json({ items: [] });
    return undefined;
  });
}

const mount = (page: string) =>
  mountApp(authFixture(makeSession()).client, `/clienti/import/${importId}/${page}`);

describe('a library part’s task page', () => {
  it.each([
    [
      'instructiuni/ssm',
      instructions,
      'instructions_ssm',
      'Nu am putut citi IPSSM',
      'Citirea instrucțiunilor proprii s-a oprit.',
      'Clientul și celelalte instrucțiuni rămân cum sunt.',
    ],
    [
      'evaluari-de-risc',
      risks,
      'risk_evaluations',
      'Nu am putut citi evaluările de risc',
      'Citirea evaluărilor de risc s-a oprit.',
      'Clientul și instrucțiunile proprii rămân cum sunt.',
    ],
  ])(
    'offers to read a failed part again, %s',
    async (page, part, name, title, fallback, untouched) => {
      mockParts([part]);
      mount(page);

      const failed = await screen.findByTestId('library-failed');
      expect(failed.textContent).toContain(title);
      expect(failed.textContent).toContain(fallback);
      expect(failed.textContent).toContain(`ți le returnăm. ${untouched}`);
      await userEvent.click(screen.getByTestId('library-retry'));

      await waitFor(() =>
        expect(requestsTo(`/imports/${importId}/library-parts/${name}/retry`, 'POST')).toHaveLength(
          1
        )
      );
      await waitFor(() =>
        expect(requestsTo(`/imports/${importId}/library-parts`).length).toBeGreaterThan(1)
      );
    }
  );

  it.each([
    ['instructiuni/ssm', risks, 'În documentația importată nu am găsit'],
    ['evaluari-de-risc', instructions, 'În documentația importată nu am găsit evaluări de risc.'],
  ])('says when the import has no such part, %s', async (page, other, text) => {
    mockParts([other]);
    mount(page);

    expect((await screen.findByTestId('library-task-missing')).textContent).toContain(text);
    expect(screen.getByTestId('library-back-to-import').getAttribute('href')).toBe(
      `/clienti/import/${importId}`
    );
  });

  it.each([
    ['instructiuni/ssm', instructions, 'Instrucțiunile le poți adăuga în Instrucțiuni proprii'],
    ['evaluari-de-risc', risks, 'Fișele le completezi pe pagina clientului'],
  ])('says an expired part can no longer be confirmed, %s', async (page, part, after) => {
    mockParts([{ ...part, status: 'ready', expiresAt: '2026-10-01T10:00:00+00:00' }]);
    mount(page);

    const expired = await screen.findByTestId('library-expired');
    expect(expired.textContent).toContain(
      'la 14 zile după crearea clientului, așa că nu mai poate fi confirmată.'
    );
    expect(expired.textContent).toContain(after);
  });
});
