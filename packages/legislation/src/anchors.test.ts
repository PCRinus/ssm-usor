import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { parseActText } from './act-text';
import { articleAnchors, portalAnchorReader } from './anchors';

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

const respond = (pages: Record<string, string>) =>
  vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    const page = pages[url.pathname + url.search];
    return page === undefined
      ? new Response('', { status: 302 })
      : new Response(page, { status: 200 });
  });

describe('the anchors of an act’s articles', () => {
  it('are the portal’s element ids on the act’s page', () => {
    const anchors = articleAnchors(parseActText(fixture('lege-319-2006.html'), 73772));
    expect(anchors.find((anchor) => anchor.article === '23')).toEqual({
      annex: null,
      article: '23',
      path: '/Public/DetaliiDocument/73772',
      anchor: 'id_artA294',
    });
    expect(anchors.every((anchor) => /^id_(?:art|anx)A\d+$/.test(anchor.anchor))).toBe(true);
    expect(new Set(anchors.map((anchor) => anchor.article)).size).toBe(anchors.length);
  });

  it('point at the document of their own that holds the norms an act approves', async () => {
    const read = portalAnchorReader({
      fetch: respond({
        '/Public/DetaliiDocument/76337': fixture('hg-1425-2006-text.html'),
        '/Public/DetaliiDocumentAfis/252029': fixture('hg-1425-2006-norms.html'),
      }),
      pauseMs: 0,
    });
    const { consolidatedOn, anchors } = await read(76337);
    expect(consolidatedOn).toBe('2022-03-07');
    expect(anchors.find((anchor) => anchor.article === '98')).toEqual({
      annex: 'Anexa',
      article: '98',
      path: '/Public/DetaliiDocument/252029',
      anchor: 'id_artA1076',
    });
  });

  it('point at the text view of an act too large for its page, never at a relay', async () => {
    const read = portalAnchorReader({
      fetch: respond({
        '/Public/DetaliiDocument/109854': fixture('lege-286-2009-page.html'),
        '/Public/DetaliiDocumentAfis/314314': fixture('codul-penal-text.html'),
      }),
      pauseMs: 0,
      origin: 'https://relay.example.com',
    });
    const { anchors } = await read(109854);
    expect(anchors.find((anchor) => anchor.article === '349')).toMatchObject({
      annex: null,
      path: '/Public/DetaliiDocumentAfis/314314',
    });
  });
});
