import { describe, expect, it } from 'vitest';

import { markQuote, quoteLines, sourceKind } from './source-match';

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

  it('tells a scanned page from a photograph, a PDF and a Word file', () => {
    expect(sourceKind(source({ page: 2 }))).toBe('scan');
    expect(sourceKind(source({ original: { url: 'u', mimeType: 'image/heic' } }))).toBe('image');
    expect(sourceKind(source({ original: { url: 'u', mimeType: 'application/msword' } }))).toBe(
      'word'
    );
    expect(sourceKind(source({}))).toBe('pdf');
  });
});
