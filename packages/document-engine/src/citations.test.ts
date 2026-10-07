import { readFileSync } from 'node:fs';

import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { buildCitationIndex, templateSources, templatesUrl } from '../tools/template-sources';
import {
  markerPrefix,
  parseAct,
  parseMarker,
  readsLikeArticle,
  templateCitations,
} from './citations';
import { paragraphsOf } from './text';

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const paragraph = (text: string, numId?: number) =>
  '<w:p>' +
  (numId
    ? `<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>`
    : '') +
  `<w:r><w:t xml:space="preserve">${escape(text)}</w:t></w:r></w:p>`;

const table = (...cells: string[]) =>
  `<w:tbl><w:tr>${cells.map((cell) => `<w:tc>${paragraph(cell)}</w:tc>`).join('')}</w:tr></w:tbl>`;

function cite(...body: string[]) {
  const zip = new PizZip();
  zip.file(
    'word/document.xml',
    `<w:document><w:body>${body.map((part) => (part.startsWith('<') ? part : paragraph(part))).join('')}</w:body></w:document>`
  );
  return templateCitations({
    manifest: 'ssm',
    file: 'test.docx',
    typeKey: 'test',
    source: zip.generate({ type: 'uint8array' }),
  });
}

const quotes = (...body: string[]) => cite(...body).filter((c) => c.form === 'quote');
const references = (...body: string[]) => cite(...body).filter((c) => c.form === 'reference');

describe('a legal act', () => {
  it('is one act whatever case the sentence puts it in', () => {
    expect(parseAct('Legea 319/2006')).toEqual(parseAct('Legii 319/2006'));
    expect(parseAct('Ordinului 427/2002')?.id).toBe('ordin-427-2002');
  });

  it('is named by its kind, number and year', () => {
    expect(parseAct('H.G. 1425/2006')).toEqual({
      id: 'hg-1425-2006',
      kind: 'hg',
      number: '1425',
      year: 2006,
      name: 'H.G. 1425/2006',
    });
    expect(parseAct('Ordinul 450/825/2006')?.id).toBe('ordin-450-825-2006');
    expect(parseAct('OMAI 163/2007')?.name).toBe('OMAI 163/2007');
    expect(parseAct('Legea nr. 319/2006')).toBeNull();
  });
});

describe('the marker of a quoted article', () => {
  it.each([
    ['(Preluare din Legea 319/2006 – Art. 7)', 'lege-319-2006', '7', 'Art. 7'],
    ['(Preluare din H.G. 1425/2006 – Art. 80¹)', 'hg-1425-2006', '80¹', 'Art. 80¹'],
    [
      '(Preluare din Legea 319/2006 – Art. 12 alin. (1) lit. c), d))',
      'lege-319-2006',
      '12',
      'Art. 12 alin. (1) lit. c), d)',
    ],
    [
      '(Preluare din O.U.G. 195/2002 – Art. 5 alin. (1) – (9))',
      'oug-195-2002',
      '5',
      'Art. 5 alin. (1) – (9)',
    ],
    [
      '(Preluare din H.G. 1425/2006 – Art. 99 – conf. H.G. 767/2016 – pct. 6)',
      'hg-1425-2006',
      '99',
      'Art. 99',
    ],
    ['(Preluare din H.G. 767/2016 – Art. II, pct. 1)', 'hg-767-2016', 'II', 'Art. II, pct. 1'],
    ['(Preluare din H.G. 971/2006 – Anexa 2)', 'hg-971-2006', null, 'Anexa 2'],
  ])('%s', (text, act, article, locator) => {
    const marker = parseMarker(`${text} Textul articolului.`);
    expect(marker).toMatchObject({ act: { id: act }, article, locator, length: text.length });
  });

  it.each([
    '(Preluare din Legea 319/ 2006 – Art. 7)',
    '(Preluare din Legea 319/2006, Art. 7)',
    '(Preluare din Legea 53/2003 – Durata timpului de muncă – Art. 112)',
    '(Preluare din Codul penal – Art. 349)',
    '(Preluare din Legea 319/2006 – Art. 5 lit. d)',
  ])('is not %s', (text) => {
    expect(parseMarker(`${text} Textul articolului.`)).toBeNull();
  });
});

describe('a quoted article', () => {
  it('runs over its alineats and the list items its sentences introduce', () => {
    const [quote] = quotes(
      '(Preluare din Legea 319/2006 – Art. 7) (1) Angajatorul are obligația:',
      'să evalueze riscurile;',
      'să ia măsuri; sau',
      'să instruiască lucrătorii.',
      '(2) Al doilea alineat.',
      'Textul documentului, după citat.'
    );
    expect(quote).toMatchObject({ paragraph: 0, lastParagraph: 4, article: '7' });
    expect(quote!.text).toBe(
      '(1) Angajatorul are obligația:\nsă evalueze riscurile;\nsă ia măsuri; sau\nsă instruiască lucrătorii.\n(2) Al doilea alineat.'
    );
  });

  it('stops at the next marker, a chapter, an empty paragraph or a table', () => {
    const spans = (...body: string[]) => quotes(...body).map((q) => q.lastParagraph);
    expect(
      spans('(Preluare din Legea 319/2006 – Art. 7) a:', '(Preluare din Legea 319/2006 – Art. 8) b')
    ).toEqual([0, 1]);
    expect(spans('(Preluare din Legea 319/2006 – Art. 7) a:', 'Capitolul II. Obligații')).toEqual([
      0,
    ]);
    expect(spans('(Preluare din Legea 319/2006 – Art. 7) a:', '', '(2) b')).toEqual([0]);
    expect(spans('(Preluare din Legea 319/2006 – Art. 7) a:', table('Nr. crt.'))).toEqual([0]);
  });

  it("stops at the next article of the document's own numbering", () => {
    const [quote] = quotes(
      paragraph('(Preluare din Legea 319/2006 – Art. 7) Angajatorul are obligația:', 1),
      paragraph('(1) Un articol al documentului.', 1)
    );
    expect(quote!.lastParagraph).toBe(0);
  });

  it('is not also a reference to its act, while the act that amended it is', () => {
    expect(
      cite('(Preluare din H.G. 1425/2006 – Art. 99 – conf. H.G. 767/2016 – pct. 6) Durata.').map(
        (c) => [c.form, c.act, c.article]
      )
    ).toEqual([
      ['quote', 'hg-1425-2006', '99'],
      ['reference', 'hg-767-2016', null],
    ]);
  });
});

describe('a reference', () => {
  const found = (text: string) => references(text).map((c) => [c.act, c.article]);

  it('takes the article the sentence names before the act', () => {
    expect(found('Instruirea prevăzută la art. 20 alin. (4) din Legea 319/2006 se face.')).toEqual([
      ['lege-319-2006', '20'],
    ]);
  });

  it('takes the article that follows the act after the separator', () => {
    expect(found('Unitatea are sub 10 lucrători (H.G. 1425/2006 – art. 53 alin. (2)).')).toEqual([
      ['hg-1425-2006', '53'],
    ]);
  });

  it('keeps each article of a list to its own act', () => {
    expect(
      found('Cele de la art. 12 alin. (1) din Legea 319/2006, art. 16 și 17 din Legea 319/2006.')
    ).toEqual([
      ['lege-319-2006', '12'],
      ['lege-319-2006', '16'],
    ]);
  });

  it('has no article where the sentence gives none', () => {
    expect(found('Conform Legii 53/2003 – Codul muncii, republicată.')).toEqual([
      ['lege-53-2003', null],
    ]);
  });

  it('is counted once per paragraph for the same act and article', () => {
    expect(found('Legea 319/2006 și iar Legea 319/2006.')).toEqual([['lege-319-2006', null]]);
  });

  it('is not a loose mention, an EU act or a standard', () => {
    expect(
      found(
        'Potrivit legii și legislației în vigoare, Regulamentul (UE) 2016/425 și CEI 812/1985 se aplică.'
      )
    ).toEqual([]);
  });
});

describe('the block a citation sits in', () => {
  it('is the innermost section open where the citation stands', () => {
    expect(
      cite(
        '{{#contract.coversFireSafety}}',
        'În temeiul Legii 307/2006.',
        '{{/contract.coversFireSafety}}',
        'Sub 10 lucrători{{^workersRepresentativeDecision}} (H.G. 1425/2006 – art. 53){{/workersRepresentativeDecision}}, Legea 319/2006.'
      ).map((c) => [c.act, c.block])
    ).toEqual([
      ['lege-307-2006', '#contract.coversFireSafety'],
      ['hg-1425-2006', '^workersRepresentativeDecision'],
      ['lege-319-2006', null],
    ]);
  });
});

describe("the built-in templates' citations", () => {
  const sources = templateSources();
  const index = buildCitationIndex(sources);
  it('open every quoted article with a marker the parser reads', () => {
    const unread = sources.flatMap((template) =>
      paragraphsOf(new PizZip(template.source).file('word/document.xml')?.asText() ?? '')
        .map((p, index) => ({ text: p.text.trimStart(), index }))
        .filter(({ text }) => text.startsWith(markerPrefix) && !parseMarker(text))
        .map(({ text, index }) => `${template.file} ¶${index}: ${text.slice(0, 90)}`)
    );
    expect(unread).toEqual([]);
  });

  it('report paragraphs that read like an article outside a quotation', () => {
    const report = sources.map((template) => {
      const quoted = new Set(
        index.citations
          .filter((c) => c.file === template.file && c.form === 'quote')
          .flatMap((c) =>
            Array.from({ length: c.lastParagraph - c.paragraph + 1 }, (_, i) => c.paragraph + i)
          )
      );
      const loose = paragraphsOf(
        new PizZip(template.source).file('word/document.xml')?.asText() ?? ''
      ).flatMap((p, i) => (readsLikeArticle(p.text) && !quoted.has(i) ? [i] : []));
      return { file: template.file, loose };
    });
    const lines = report
      .filter(({ loose }) => loose.length)
      .map(({ file, loose }) => `${file}: ${loose.length} (¶${loose.slice(0, 8).join(', ¶')}…)`);
    if (lines.length)
      console.info(`Paragraphs that read like an article, no marker:\n${lines.join('\n')}`);
    expect(report).toHaveLength(sources.length);
  });

  it('are the committed index, regenerated after every template change', () => {
    const committed = JSON.parse(readFileSync(new URL('citations.json', templatesUrl), 'utf8'));
    expect(committed, 'run pnpm --filter @ssm-usor/document-engine citations').toEqual(index);
  });
});
