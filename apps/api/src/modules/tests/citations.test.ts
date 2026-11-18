import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { citationReferences, linkCitation } from './citations';

const seeded = readFileSync(
  new URL(
    '../../../../../supabase/migrations/20261020100100_built_in_test_questions.sql',
    import.meta.url
  ),
  'utf8'
);
const builtInCitations = [
  ...seeded.matchAll(/^ {2}\('[0-9a-f-]{36}', .*, '((?:[^']|'')*)'\)[,;]$/gm),
].map((match) => match[1]!.replaceAll("''", "'"));

describe("the built-in questions' citations", () => {
  it('name a watched act, or the provider’s own instructions, which stay plain text', () => {
    expect(builtInCitations).toHaveLength(32);
    const plain = builtInCitations.filter((citation) =>
      citationReferences(citation).every((part) => part.act === null)
    );
    expect(plain).toEqual([
      'I.P.S.S.M., art. 78',
      'IPSU, art. 164 alin. (2) lit. a)',
      'IPSU, art. 163 alin. (2) lit. a) și art. 165 alin. (2) lit. b)',
      'IPSU, art. 151',
      'IPSU, art. 166 lit. b)',
    ]);
  });

  it('link every article they cite to the act until its anchors are read', () => {
    for (const citation of builtInCitations) {
      for (const part of linkCitation(citationReferences(citation), new Map())) {
        if (part.act === null) expect(part).toMatchObject({ url: null, target: null });
        else {
          expect(part.target).toBe('act');
          expect(part.url).toMatch(
            /^https:\/\/legislatie\.just\.ro\/Public\/DetaliiDocument\/\d+$/
          );
        }
      }
    }
  });

  it('link an article of the norms an act approves to the norms’ own document', () => {
    const anchors = new Map([
      [
        'omai-712-2005',
        [
          { annex: null, article: '1', path: '/Public/DetaliiDocument/63056', anchor: 'id_artA27' },
          {
            annex: 'Anexa',
            article: '1',
            path: '/Public/DetaliiDocument/80501',
            anchor: 'id_artA14',
          },
          {
            annex: 'Anexa',
            article: '14',
            path: '/Public/DetaliiDocument/80501',
            anchor: 'id_artA89',
          },
        ],
      ],
    ]);
    const parts = linkCitation(citationReferences('O.M.A.I. 712/2005, art. 14 și 15'), anchors);
    expect(parts.map((part) => [part.text, part.target, part.url])).toEqual([
      ['O.M.A.I. 712/2005', 'act', 'https://legislatie.just.ro/Public/DetaliiDocument/63056'],
      [', ', null, null],
      ['art. 14', 'article', 'https://legislatie.just.ro/Public/DetaliiDocument/80501#id_artA89'],
      [' și ', null, null],
      ['15', 'act', 'https://legislatie.just.ro/Public/DetaliiDocument/63056'],
    ]);
    expect(
      linkCitation(citationReferences('O.M.A.I. 712/2005, art. 1'), anchors).at(-1)?.target
    ).toBe('act');
  });

  it('link an annex to the annex', () => {
    const anchors = new Map([
      [
        'hg-971-2006',
        [{ annex: '2', article: null, path: '/Public/DetaliiDocument/74127', anchor: 'id_anxA9' }],
      ],
    ]);
    expect(
      linkCitation(citationReferences('H.G. 971/2006, anexa 2'), anchors).at(-1)
    ).toMatchObject({
      annex: '2',
      target: 'annex',
      url: 'https://legislatie.just.ro/Public/DetaliiDocument/74127#id_anxA9',
    });
  });
});
