import { describe, expect, it } from 'vitest';

import {
  confirmSummary,
  flagLines,
  identicalSentence,
  isOpenPart,
  type LibraryPart,
  partDescription,
  type ProposedInstruction,
  type ProposedPosition,
  rowState,
  sourceQuote,
  undecidedPositions,
  undecidedReasons,
  withChange,
} from './library-model';

const body = (text: string) => ({ blocks: [{ kind: 'article' as const, paragraphs: [text] }] });

const instruction = (
  key: string,
  overrides: Partial<ProposedInstruction> = {}
): ProposedInstruction => ({
  key,
  file: 'Dosar/IPSSM.docx',
  number: 'XIII.I',
  writtenTitle: 'Instrucțiuni proprii privind utilizarea mașinii de tocat',
  title: 'Utilizarea mașinii de tocat',
  category: 'work_equipment',
  body: body('Mașina de tocat se pornește numai cu capacul montat și cu mâinile uscate.'),
  articleCount: 1,
  sourceNumbers: [4],
  location: { file: 'Dosar/IPSSM.docx', start: 0, end: 10, firstParagraph: 2, lastParagraph: 3 },
  status: 'new',
  match: null,
  choice: null,
  posts: ['theme-1'],
  flags: [],
  sameAs: [],
  ...overrides,
});

const match = {
  moduleId: 'm-1',
  title: 'Scări metalice',
  similarity: 0.7,
  decidedBy: 'overlap' as const,
  differences: [],
};

const positionPosts = { 'theme-1': 'position-1', 'theme-2': 'position-2', 'theme-3': null };

const part = (overrides: Partial<LibraryPart> = {}): LibraryPart => ({
  part: 'instructions_ssm',
  domain: 'ssm',
  status: 'to_review',
  attempt: 1,
  failureReason: null,
  version: 0,
  changes: null,
  counts: { identical: 7, similar: 1, new: 2, unread: 0 },
  positionPosts,
  readAt: '2026-11-02T09:00:00Z',
  confirmedAt: null,
  expiresAt: null,
  credits: 25,
  proposal: null,
  ...overrides,
});

describe('a proposed instruction as the member left it', () => {
  it("takes the themes' posts, the proposed title and the pack's text until the member changes them", () => {
    const row = rowState(
      instruction('i-1', { posts: ['theme-1', 'theme-3'] }),
      undefined,
      positionPosts
    );
    expect(row).toMatchObject({
      included: true,
      usesLibrary: false,
      title: 'Utilizarea mașinii de tocat',
      posts: ['position-1'],
      edited: { title: false, posts: false, body: false },
    });
  });

  it('keeps the library module of a similar one unless the member adds it as new', () => {
    const similar = instruction('i-2', { status: 'similar', match, choice: 'use_existing' });
    expect(rowState(similar, undefined, positionPosts).usesLibrary).toBe(true);
    const added = rowState(
      similar,
      { choice: 'add_new', title: 'Scări (Brutăria)' },
      positionPosts
    );
    expect(added).toMatchObject({
      usesLibrary: false,
      choice: 'add_new',
      title: 'Scări (Brutăria)',
    });
    expect(added.edited.title).toBe(true);
  });

  it('drops a change set back to what the proposal says', () => {
    expect(withChange({ title: 'Altul', posts: [] }, 'title', undefined)).toEqual({ posts: [] });
    expect(withChange({}, 'included', false)).toEqual({ included: false });
  });
});

describe('what confirming does', () => {
  it('counts the modules added, those used as they are and the posts they go on', () => {
    const instructions = [
      instruction('i-1'),
      instruction('i-2', { status: 'identical', match, posts: ['theme-1', 'theme-2'] }),
      instruction('i-3', { status: 'similar', match, choice: 'use_existing', posts: ['theme-2'] }),
      instruction('i-4'),
    ];
    const changes = {
      instructions: { 'i-3': { choice: 'add_new' as const }, 'i-4': { included: false } },
    };
    expect(confirmSummary(instructions, changes, positionPosts)).toEqual({
      created: 2,
      used: 1,
      posts: 2,
    });
  });
});

describe('the task on the hub', () => {
  it('says what is left to check, and that it waits for the client', () => {
    expect(partDescription(part(), false)).toBe(
      'De verificat: 2 noi și una asemănătoare. 7 deja în bibliotecă. Le confirmi după client.'
    );
    expect(
      partDescription(
        part({ status: 'nothing_new', counts: { identical: 3, similar: 0, new: 0, unread: 0 } }),
        true
      )
    ).toBe('Nimic nou: toate sunt deja în biblioteca ta.');
  });

  it('is open until confirmed or 14 days after the client', () => {
    const now = Date.parse('2026-11-10T00:00:00Z');
    expect(isOpenPart({ status: 'to_review', expiresAt: '2026-11-16T10:00:00Z' }, now)).toBe(true);
    expect(isOpenPart({ status: 'failed', expiresAt: null }, now)).toBe(true);
    expect(isOpenPart({ status: 'to_review', expiresAt: '2026-11-09T10:00:00Z' }, now)).toBe(false);
    expect(isOpenPart({ status: 'confirmed', expiresAt: '2026-11-16T10:00:00Z' }, now)).toBe(false);
    expect(partDescription(part({ expiresAt: '2026-11-09T10:00:00Z' }), true, now)).toBe(
      'A expirat pe 9 noiembrie, la 14 zile după crearea clientului.'
    );
  });

  it('counts the identical ones in a sentence', () => {
    expect(identicalSentence(7)).toBe('7 instrucțiuni din pachet sunt deja în biblioteca ta');
    expect(identicalSentence(1)).toBe('O instrucțiune din pachet este deja în biblioteca ta');
  });
});

describe('the posts the themes leave undecided', () => {
  const position = (overrides: Partial<ProposedPosition>): ProposedPosition => ({
    key: 'theme-1',
    post: 'BRUTAR',
    variant: '',
    clientPost: 'Brutar',
    citations: [],
    resolution: { kind: 'resolved', instructions: ['i-1'] },
    missing: [],
    ...overrides,
  });

  it('lists the undecided ones and those that match none of the posts, saying why', () => {
    const cut = position({
      resolution: {
        kind: 'undecided',
        reasons: [{ kind: 'cuts_instruction', instruction: 'i-1' }],
      },
    });
    const stranger = position({ key: 'theme-3', post: 'PAZNIC', clientPost: null });
    expect(undecidedPositions([position({}), cut, stranger])).toEqual([cut, stranger]);
    expect(undecidedReasons(cut, () => 'Utilizarea mașinii de tocat')).toEqual([
      'Intervalul citat taie în două instrucțiunea „Utilizarea mașinii de tocat”.',
    ]);
    expect(undecidedReasons(stranger, () => undefined)).toEqual([
      'Postul din tematică nu se potrivește cu niciunul dintre posturile clientului.',
    ]);
  });

  it('quotes a citation it could not read', () => {
    const unread = position({
      resolution: {
        kind: 'undecided',
        reasons: [{ kind: 'unread_citation', citation: 'IPSSM Subcapitolul XIII.II' }],
      },
    });
    expect(undecidedReasons(unread, () => undefined)).toEqual([
      'Nu am putut citi citarea din tematică: „IPSSM Subcapitolul XIII.II”.',
    ]);
  });
});

it("shows the source at the instruction's first words", () => {
  const long = Array.from({ length: 40 }, (_, index) => `cuvânt${index}`).join(' ');
  expect(sourceQuote(body(long)).split(' ')).toHaveLength(30);
});

describe('flagLines', () => {
  it('names the articles a pack’s table rows went into once, beside the other warnings', () => {
    expect(
      flagLines([
        { kind: 'table_row', article: 16 },
        { kind: 'table_row', article: 16 },
        { kind: 'empty_article', number: 9 },
        { kind: 'table_row', article: 23 },
      ])
    ).toEqual([
      'Art. 16 și Art. 23 au rânduri de tabel făcute paragrafe: celulele lor sunt unite cu o liniuță.',
      'Art. 9 din pachet nu are text, poate doar o imagine, și nu a fost preluat. Articolele de după el au aici numărul cu unu mai mic.',
    ]);
    expect(flagLines([{ kind: 'table_row', article: 4 }])).toEqual([
      'Art. 4 vine dintr-un rând de tabel: celulele lui sunt unite cu o liniuță.',
    ]);
  });
});
