import { describe, expect, it } from 'vitest';

import {
  findLine,
  type LineHit,
  markQuote,
  passageHits,
  quoteLines,
  sourceKind,
} from './source-match';

const span = (text: string) => {
  const element = document.createElement('span');
  element.textContent = text;
  return element;
};

const source = (overrides: Record<string, unknown>) =>
  ({
    fileId: 'x',
    uploadPath: 'a.pdf',
    fileName: 'a.pdf',
    page: null,
    original: { url: 'https://storage.example/a', mimeType: 'application/pdf' },
    derived: null,
    text: null,
    pages: null,
    match: null,
    expiresInSeconds: 300,
    ...overrides,
  }) as Parameters<typeof sourceKind>[0];

describe('finding a passage in the viewers', () => {
  it('marks the runs of the text layer a quote spans, ignoring case, diacritics and spacing', () => {
    const spans = ['Denumirea postului: ', 'OPERATOR', ' linie', ' ambalare.', ' Atribuții'].map(
      span
    );
    const marked = markQuote(spans, 'operator linie ambalare');
    expect(marked.map((each) => each.textContent)).toEqual(['OPERATOR', ' linie', ' ambalare.']);
    expect(spans[1]!.classList.contains('import-quote')).toBe(true);
    expect(
      markQuote(
        spans.map((each) => span(each.textContent ?? '')),
        'nu există'
      )
    ).toEqual([]);
  });

  it('searches a Word passage line by line, from the text the API matched', () => {
    const text = 'Antet\nNr. crt.\tPostul\tActivități\n1\tBrutar\tFrământare și coacere\nFinal';
    const start = text.indexOf('1\tBrutar');
    expect(
      quoteLines(source({ text, match: { page: null, start, end: start + 30 } }), 'ignored')
    ).toEqual(['Brutar', 'Frământare și coacere']);
    expect(quoteLines(source({}), 'Reprezentant: Ioana Mureșan')).toEqual([
      'Reprezentant: Ioana Mureșan',
    ]);
  });

  it('searches a passage from a table cell by cell, without the separators the text added', () => {
    const text =
      'FISA POSTULUI\n| FUNCTIA : | INGRIJITOR HOTEL |\n| Locul de muncă : | Etaj 1 / Etaj 2 |\n';
    const start = text.indexOf('FUNCTIA');
    const end = text.indexOf('Etaj 2') + 'Etaj 2'.length;
    const lines = quoteLines(source({ text, match: { page: null, start, end } }), 'ignored');
    expect(lines).toEqual([
      'FUNCTIA :',
      'INGRIJITOR HOTEL',
      'Locul de muncă :',
      'Etaj 1',
      'Etaj 2',
    ]);

    const paragraphs = [
      'FISA POSTULUI',
      'FUNCTIA :',
      'INGRIJITOR HOTEL',
      'Locul de muncă :',
      'Etaj 1',
      'Etaj 2',
    ];
    const { hits, anchor } = passageHits(lines, (line) =>
      paragraphs.flatMap((paragraph, paragraphIndex) =>
        paragraph.toLowerCase().includes(line.toLowerCase())
          ? [{ blockId: `p${paragraphIndex}`, start: 0, length: line.length, paragraphIndex }]
          : []
      )
    );
    expect(anchor?.blockId).toBe('p2');
    expect(hits.map((hit) => hit.blockId)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it("keeps the cells of a header's table together, though each search gives its own scope", () => {
    const paragraphs = ['S.C. HOTEL EXEMPLU S.R.L.', 'CUI 31458207'];
    const { hits } = passageHits(['S.C. HOTEL EXEMPLU S.R.L.', 'CUI 31458207'], (line) => [
      {
        blockId: `h${paragraphs.indexOf(line)}`,
        start: 0,
        length: line.length,
        paragraphIndex: paragraphs.indexOf(line),
        scope: { kind: 'headerFooter', rId: 'rId7' },
      },
    ]);
    expect(hits.map((hit) => hit.blockId)).toEqual(['h0', 'h1']);
  });

  it('takes each line of a Word passage next to the longest one, not its first hit anywhere', () => {
    const paragraphs = [
      'Date de identificare',
      'Nume',
      'Telefon',
      'Antet tabel',
      'Nume',
      'Ioana Mureșan, administrator',
      'CUI',
      '31458207',
      'CUI',
    ];
    const find = (line: string): LineHit[] =>
      paragraphs.flatMap((text, paragraphIndex) =>
        text.includes(line)
          ? [
              {
                blockId: `p${paragraphIndex}`,
                start: text.indexOf(line),
                length: line.length,
                paragraphIndex,
              },
            ]
          : []
      );
    const { hits, anchor } = passageHits(
      ['Nume', 'Ioana Mureșan, administrator', 'CUI', 'Lipsește', '31458207'],
      find
    );
    expect(anchor?.blockId).toBe('p5');
    expect(hits.map((hit) => hit.blockId)).toEqual(['p4', 'p5', 'p6', 'p7']);
    expect(passageHits(['Lipsește'], find)).toEqual({ hits: [], anchor: null });
  });

  it('tells a scanned page from a photograph, a PDF and a Word file', () => {
    expect(sourceKind(source({ page: 2 }))).toBe('scan');
    expect(sourceKind(source({ original: { url: 'u', mimeType: 'image/heic' } }))).toBe('image');
    expect(sourceKind(source({ original: { url: 'u', mimeType: 'application/msword' } }))).toBe(
      'word'
    );
    expect(sourceKind(source({}))).toBe('pdf');
  });

  it('finds a cell whose words the document spaces wider than the text the API read', () => {
    const paragraphs = ['Arsuri (maini)', 'Substante de curatat  (maini)', 'Manusi'];
    const find = (query: string) =>
      paragraphs.flatMap((paragraph, paragraphIndex) => {
        const start = paragraph.indexOf(query);
        return start === -1
          ? []
          : [{ blockId: `p${paragraphIndex}`, start, length: query.length, paragraphIndex }];
      });
    expect(findLine('Substante de curatat (maini)', find)).toEqual([
      { blockId: 'p1', start: 0, length: 29, paragraphIndex: 1 },
    ]);
    expect(findLine('Arsuri (maini)', find)).toEqual([
      { blockId: 'p0', start: 0, length: 14, paragraphIndex: 0 },
    ]);
    expect(findLine('Substante (maini)', find)).toEqual([]);
  });
});
