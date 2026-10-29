import { describe, expect, it } from 'vitest';

import {
  findLine,
  type LineHit,
  markQuote,
  pageQuotes,
  passageHits,
  passageParts,
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

const quoteLines = (answer: Parameters<typeof sourceKind>[0], quote: string) =>
  passageParts(answer, quote).flatMap(({ lines }) => lines);

const onePart = (lines: string[], occurrences: number[] = []) => [{ lines, occurrences }];

const matched = (start: number, end: number, page: number | null = null) => ({
  page,
  start,
  end,
  parts: [{ start, end }],
});

function searchIn(paragraphs: string[]) {
  const calls: string[][] = [];
  const find = (queries: readonly string[], options: { wholeWord?: boolean } = {}) => {
    calls.push([...queries]);
    return queries.map((query) =>
      paragraphs.flatMap((paragraph, paragraphIndex) => {
        const hits: LineHit[] = [];
        for (let at = paragraph.indexOf(query); at !== -1; at = paragraph.indexOf(query, at + 1)) {
          const end = at + query.length;
          const edges = [paragraph[at - 1], paragraph[end]];
          if (options.wholeWord && edges.some((each) => each && /[\p{L}\p{N}_]/u.test(each))) {
            continue;
          }
          hits.push({
            blockId: `p${paragraphIndex}`,
            start: at,
            length: query.length,
            paragraphIndex,
            contextAfter: paragraph.slice(end, end + 48),
          });
        }
        return hits;
      })
    );
  };
  return { find, calls };
}

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
    const { hits, anchor } = passageHits(onePart(lines), (line) =>
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
    const { hits } = passageHits(onePart(['S.C. HOTEL EXEMPLU S.R.L.', 'CUI 31458207']), (line) => [
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
      onePart(['Nume', 'Ioana Mureșan, administrator', 'CUI', 'Lipsește', '31458207']),
      find
    );
    expect(anchor?.blockId).toBe('p5');
    expect(hits.map((hit) => hit.blockId)).toEqual(['p4', 'p5', 'p6', 'p7']);
    expect(passageHits(onePart(['Lipsește']), find)).toEqual({ hits: [], anchor: null });
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
    const { find } = searchIn(['Arsuri (maini)', 'Substante de curatat  (maini)', 'Manusi']);
    expect(findLine('Substante de curatat (maini)', find)).toMatchObject([
      { blockId: 'p1', start: 0, length: 29, paragraphIndex: 1 },
    ]);
    expect(findLine('Arsuri (maini)', find)).toMatchObject([
      { blockId: 'p0', start: 0, length: 14, paragraphIndex: 0 },
    ]);
    expect(findLine('Substante (maini)', find)).toEqual([]);
  });

  it('does not take a word the line lacks between two of its words', () => {
    const { find } = searchIn(['Se iau masuri de protectie', 'masuri  protectie colectiva']);
    expect(findLine('masuri protectie', find)).toMatchObject([
      { blockId: 'p1', start: 0, length: 17 },
    ]);
    expect(findLine('iau masuri protectie', find)).toEqual([]);
  });

  it('looks for the words of a line in one search, however common they are', () => {
    const paragraphs = [
      ...Array.from({ length: 2000 }, (_, index) => `de a la poarta ${index}`),
      'de a la  sediul firmei',
    ];
    const present = searchIn(paragraphs);
    expect(findLine('de a la sediul firmei', present.find)).toMatchObject([
      { blockId: 'p2000', start: 0, length: 22 },
    ]);
    expect(present.calls).toEqual([
      ['de a la sediul firmei'],
      ['de', 'a', 'la', 'sediul', 'firmei'],
    ]);

    const absent = searchIn(paragraphs);
    expect(findLine('de a la birou', absent.find)).toEqual([]);
    expect(absent.calls).toHaveLength(2);
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
      const { hits } = passageHits(passageParts(source({ text, match }), quote), find);
      return hits.map((hit) => paragraphs[hit.paragraphIndex]);
    };

    it('marks the row the API placed, not its first place in the document', () => {
      const second = cells(text.lastIndexOf(row));
      const { hits } = passageHits(
        passageParts(source({ text, match: matched(second.start, second.end) }), row),
        find
      );
      expect(hits.map((hit) => hit.blockId)).toEqual(['p14', 'p15', 'p17']);
      expect(marked(matched(second.start, second.end))).toEqual([
        'Substante de curatat (maini)',
        'Manusi',
        'Inventar',
      ]);
      const first = cells(text.indexOf(row));
      const { anchor } = passageHits(
        passageParts(source({ text, match: matched(first.start, first.end) }), row),
        find
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
      expect(passageParts(source({ text, match }), quote)).toEqual([
        { lines: ['CAMERISTA'], occurrences: [0] },
        { lines: ['Substante de curatat (maini)', 'Manusi', 'Inventar'], occurrences: [1, 2, 3] },
      ]);
      expect(marked(match, quote)).toEqual([
        'MESERIA : CAMERISTA',
        'Substante de curatat (maini)',
        'Manusi',
        'Inventar',
      ]);
    });

    it('marks a heading and its row apart, and shows the row', () => {
      const table = [
        'MESERIA : BUCĂTAR',
        '| Risc | Echipament | Durată | Gestiune |',
        '| Arsuri | Mănuși | 6 luni | Inventar |',
        '| Tăiere | Mănuși | 1 an | Inventar |',
        '| Zgomot | Antifoane | 1 an | Inventar |',
        '| Praf | Mască | 1 an | Inventar |',
      ].join('\n');
      const cells = table.split(/\n|\s*\|\s*/).filter(Boolean);
      const findCell = (line: string): LineHit[] =>
        cells.flatMap((cell, paragraphIndex) =>
          cell.toLowerCase().includes(line.toLowerCase())
            ? [{ blockId: `c${paragraphIndex}`, start: 0, length: line.length, paragraphIndex }]
            : []
        );
      const row = '| Praf | Mască | 1 an | Inventar |';
      const at = table.indexOf(row);
      const match = {
        page: null,
        start: 0,
        end: at + row.length - 2,
        parts: [
          { start: 0, end: 'MESERIA : BUCĂTAR'.length },
          { start: at + 2, end: at + row.length - 2 },
        ],
      };

      const { hits, anchor } = passageHits(
        passageParts(source({ text: table, match }), `MESERIA : BUCĂTAR … ${row}`),
        findCell
      );

      expect(hits.map((hit) => cells[hit.paragraphIndex])).toEqual([
        'MESERIA : BUCĂTAR',
        'Praf',
        'Mască',
        '1 an',
        'Inventar',
      ]);
      expect(hits.slice(1).map((hit) => hit.paragraphIndex)).toEqual([17, 18, 19, 20]);
      expect(anchor?.paragraphIndex).toBe(20);
      expect(
        passageHits(passageParts(source({}), `MESERIA : BUCĂTAR … ${row}`), findCell).anchor
          ?.paragraphIndex
      ).toBe(8);
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
