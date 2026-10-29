import { describe, expect, it } from 'vitest';

import {
  findLine,
  type LineHit,
  lineOccurrences,
  markQuote,
  pageQuotes,
  passageHits,
  quoteLines,
  requestFileName,
  requestKind,
  requestPage,
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

const matched = (start: number, end: number, page: number | null = null) => ({
  page,
  start,
  end,
  parts: [{ start, end }],
});

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
    expect(quoteLines(source({ text, match: matched(start, start + 30) }), 'ignored')).toEqual([
      'Brutar',
      'Frământare și coacere',
    ]);
    expect(quoteLines(source({}), 'Reprezentant: Ioana Mureșan')).toEqual([
      'Reprezentant: Ioana Mureșan',
    ]);
  });

  it('searches a passage from a table cell by cell, without the separators the text added', () => {
    const text =
      'FISA POSTULUI\n| FUNCTIA : | INGRIJITOR HOTEL |\n| Locul de muncă : | Etaj 1 / Etaj 2 |\n';
    const start = text.indexOf('FUNCTIA');
    const end = text.indexOf('Etaj 2') + 'Etaj 2'.length;
    const lines = quoteLines(source({ text, match: matched(start, end) }), 'ignored');
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

  it('tells what a source shows from its name, before the API answers', () => {
    expect(requestKind('Scanari/Decizie PSI.pdf (pagina 3)')).toBe('scan');
    expect(requestPage('Scanari/Decizie PSI.pdf (pagina 3)')).toBe(3);
    expect(requestFileName('Scanari/Decizie PSI.pdf (pagina 3)')).toBe('Decizie PSI.pdf');
    expect(requestKind('dosar.zip/6._LEIP.DOC')).toBe('word');
    expect(requestKind('Fisa post.docx')).toBe('word');
    expect(requestKind('Contract.pdf')).toBe('pdf');
    expect(requestKind('IMG_2041.heic')).toBe('image');
    expect(requestPage('Contract.pdf')).toBeNull();
    expect(requestKind('Fără extensie')).toBeNull();
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

  describe('a table row repeated under several posts', () => {
    const row = '| Substante de curatat (maini) | Manusi | - | Inventar |';
    const text = [
      'MESERIA : BUCATAR',
      '| Arsuri (maini) | Manusi termorezistente | 1 an | Inventar |',
      row,
      'MESERIA : CAMERISTA',
      '| Alunecare | Incaltaminte | 2 ani | Inventar |',
      row,
    ].join('\n');
    const cells = (at: number) => ({ start: at + 2, end: at + row.length - 2 });
    const paragraphs = text.split(/\n|\s*\|\s*/).filter(Boolean);
    const find = (line: string): LineHit[] =>
      paragraphs.flatMap((paragraph, paragraphIndex) =>
        paragraph.toLowerCase().includes(line.toLowerCase())
          ? [{ blockId: `p${paragraphIndex}`, start: 0, length: line.length, paragraphIndex }]
          : []
      );
    const marked = (match: ReturnType<typeof matched>, quote = row) => {
      const answer = source({ text, match });
      const lines = quoteLines(answer, quote);
      const { hits } = passageHits(lines, find, lineOccurrences(answer, quote));
      return hits.map((hit) => paragraphs[hit.paragraphIndex]);
    };

    it('marks the row the API placed, not its first place in the document', () => {
      const second = cells(text.lastIndexOf(row));
      const { hits } = passageHits(
        ['Substante de curatat (maini)', 'Manusi', 'Inventar'],
        find,
        lineOccurrences(source({ text, match: matched(second.start, second.end) }), row)
      );
      expect(hits.map((hit) => hit.blockId)).toEqual(['p14', 'p15', 'p17']);
      expect(marked(matched(second.start, second.end))).toEqual([
        'Substante de curatat (maini)',
        'Manusi',
        'Inventar',
      ]);
      const first = cells(text.indexOf(row));
      const { anchor } = passageHits(
        ['Substante de curatat (maini)'],
        find,
        lineOccurrences(source({ text, match: matched(first.start, first.end) }), row)
      );
      expect(anchor?.blockId).toBe('p5');
    });

    it('marks the parts of a quote with an ellipsis, not the rows between them', () => {
      const heading = text.indexOf('CAMERISTA');
      const second = cells(text.lastIndexOf(row));
      const quote = `CAMERISTA … ${row}`;
      const match = {
        page: null,
        start: heading,
        end: second.end,
        parts: [{ start: heading, end: heading + 'CAMERISTA'.length }, second],
      };
      expect(quoteLines(source({ text, match }), quote)).toEqual([
        'CAMERISTA',
        'Substante de curatat (maini)',
        'Manusi',
        'Inventar',
      ]);
      expect(lineOccurrences(source({ text, match }), quote)).toEqual([0, 1, 2, 3]);
      expect(marked(match, quote)).toEqual([
        'MESERIA : CAMERISTA',
        'Substante de curatat (maini)',
        'Manusi',
        'Inventar',
      ]);
    });

    it('marks the place on a PDF page the API counted', () => {
      const second = cells(text.lastIndexOf(row));
      const answer = source({
        pages: [{ number: 2, text }],
        match: matched(second.start, second.end, 2),
      });
      const parts = pageQuotes(answer, 2, row);
      expect(parts).toEqual([{ quote: row.slice(2, -2), occurrence: 1 }]);
      const spans = text.split('\n').map(span);
      const highlighted = markQuote(spans, parts[0]!.quote, parts[0]!.occurrence);
      expect(highlighted.map((each) => spans.indexOf(each))).toEqual([5]);
      expect(pageQuotes(answer, 1, row)).toEqual([{ quote: row, occurrence: 0 }]);
    });
  });
});
