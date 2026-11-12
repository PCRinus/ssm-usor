import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { templateCitations } from './citations';
import { patchQuote, type QuotePatch } from './quote-patch';
import { summaryMarkdown } from './quote-replacement';
import { paragraphsOf } from './text';

const bold = '<w:rPr><w:b/><w:sz w:val="20"/></w:rPr>';
const normal = '<w:rPr><w:sz w:val="20"/></w:rPr>';
const run = (properties: string, text: string) =>
  `<w:r>${properties}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const alineat = (label: string, ...runs: string[]) =>
  `<w:p>${run(bold, label)}${runs.map((text) => run(normal, text)).join('')}</w:p>`;
const marker = (locator: string, ...runs: string[]) =>
  `<w:p>${run(normal, `(Preluare din Legea 319/2006 – ${locator})`)}${runs.map((text) => run(normal, text)).join('')}</w:p>`;

// The provider adapted the quote: the employer is the client, by a merge field split in runs
// as the editor saves it, and "acesta" became "angajatorul".
const body = [
  marker(
    'Art. 13 alin. (1) – (3)',
    ' (1) Angajatorul ',
    '{{client.',
    'legalName}}',
    ' asigură casca de protecție lucrătorilor.'
  ),
  alineat('(2)', ' În acest scop, angajatorul instruiește lucrătorii.'),
  alineat('(3)', ' Instruirea se face la angajare și periodic.'),
  '<w:p>' + run(normal, 'Capitolul IV') + '</w:p>',
];

function docx(paragraphs: string[]) {
  const zip = new PizZip();
  zip.file('word/document.xml', `<w:document><w:body>${paragraphs.join('')}</w:body></w:document>`);
  return zip.generate({ type: 'uint8array' });
}

const source = docx(body);
const quote = () =>
  templateCitations({ manifest: 'ssm', file: 'test.docx', typeKey: 'test', source }).filter(
    (citation) => citation.form === 'quote'
  )[0]!;
const patch = (changes: QuotePatch['changes'], locator?: string) =>
  patchQuote(source, { citation: quote(), changes, ...(locator ? { locator } : {}) });
const xmlOf = (result: ReturnType<typeof patchQuote>) => {
  if (result.status !== 'applied') throw new Error(JSON.stringify(result.problems));
  return new PizZip(result.source).file('word/document.xml')!.asText();
};
const quotedText = (result: ReturnType<typeof patchQuote>) => {
  if (result.status !== 'applied') throw new Error(JSON.stringify(result.problems));
  return result.quote.text!;
};

describe("the law's own change applied to a quote", () => {
  it('changes the words around a merge field and leaves the field and the rewording alone', () => {
    const result = patch([
      {
        old: '(1) Acesta asigură casca de protecţie lucrătorilor.',
        new: '(1) Acesta asigură cască de protecţie omologată lucrătorilor.',
      },
    ]);
    expect(paragraphsOf(xmlOf(result))[0]!.xml).toBe(
      marker(
        'Art. 13 alin. (1) – (3)',
        ' (1) Angajatorul ',
        '{{client.',
        'legalName}}',
        ' asigură cască de protecție omologată lucrătorilor.'
      )
    );
    expect(quotedText(result)).toBe(
      [
        '(1) Angajatorul {{client.legalName}} asigură cască de protecție omologată lucrătorilor.',
        '(2) În acest scop, angajatorul instruiește lucrătorii.',
        '(3) Instruirea se face la angajare și periodic.',
      ].join('\n')
    );
  });

  it('finds the change by more words around it when fewer are found twice', () => {
    const result = patch([
      {
        old: '(3) Instruirea se face la angajare și periodic.',
        new: '(3) Instruirea se face la angajare, la schimbarea locului de muncă și periodic.',
      },
    ]);
    expect(quotedText(result).split('\n')[2]).toBe(
      '(3) Instruirea se face la angajare, la schimbarea locului de muncă și periodic.'
    );
  });

  it('needs a person when the old words are not in the quote, and changes nothing', () => {
    const result = patch([
      {
        old: '(2) În acest scop, acesta organizează instruirea.',
        new: '(2) În acest scop, acesta organizează instruirea anuală.',
      },
      {
        old: '(3) Instruirea se face la angajare și periodic.',
        new: '(3) Instruirea se face la angajare și anual.',
      },
    ]);
    expect(result).toEqual({
      status: 'needs-review',
      problems: [
        {
          alineat: '2',
          old: '(2) În acest scop, acesta organizează instruirea.',
          new: '(2) În acest scop, acesta organizează instruirea anuală.',
          reason: `the template's passage does not hold the old words: "" → "anuală"`,
        },
      ],
    });
  });

  it('needs a person when the old words are found more than once, or takes more words around them', () => {
    const repeated = docx([marker('Art. 14', ' (1) Lucrătorul poartă casca și poartă casca.')]);
    const citation = templateCitations({
      manifest: 'ssm',
      file: 'test.docx',
      typeKey: 'test',
      source: repeated,
    })[0]!;
    expect(
      patchQuote(repeated, {
        citation,
        changes: [{ hunks: [{ old: 'poartă casca', new: 'poartă cască' }] }],
      })
    ).toEqual({
      status: 'needs-review',
      problems: [
        {
          alineat: null,
          old: 'poartă casca',
          new: 'poartă cască',
          reason: 'the old words are in the template 2 times: "casca" → "cască"',
        },
      ],
    });
    const result = patchQuote(repeated, {
      citation,
      changes: [
        {
          old: '(1) Lucrătorul poartă casca și poartă casca.',
          new: '(1) Lucrătorul poartă casca și poartă cască.',
        },
      ],
    });
    expect(quotedText(result)).toBe('(1) Lucrătorul poartă casca și poartă cască.');
  });

  it('adds an alineat between two the quote holds, and only there', () => {
    const result = patch([
      { old: null, new: '(2¹) Instruirea se consemnează în fișă.' },
      { old: null, new: '(4) Costul instruirii este suportat de angajator.' },
    ]);
    expect(quotedText(result).split('\n')).toEqual([
      '(1) Angajatorul {{client.legalName}} asigură casca de protecție lucrătorilor.',
      '(2) În acest scop, angajatorul instruiește lucrătorii.',
      '(2¹) Instruirea se consemnează în fișă.',
      '(3) Instruirea se face la angajare și periodic.',
    ]);
    if (result.status !== 'applied') return;
    expect(paragraphsOf(xmlOf(result))[2]!.xml).toBe(
      alineat('(2¹)', ' Instruirea se consemnează în fișă.')
    );
    expect(summaryMarkdown(result.summary)).toBe(
      [
        '**test.docx**: Legea 319/2006, Art. 13 alin. (1) – (3)',
        '',
        '- alin. (2¹) added, ¶2: (2¹) Instruirea se consemnează în fișă.',
        '',
        'To check:',
        '- (4) not added: the template does not quote the alineate around it',
      ].join('\n')
    );
  });

  it('removes an alineat the change repeals, when the quote holds it', () => {
    const result = patch([
      { old: '(2) În acest scop, acesta instruiește lucrătorii.', new: null },
      { old: '(5) Alt alineat.', new: null },
    ]);
    expect(quotedText(result).split('\n')).toEqual([
      '(1) Angajatorul {{client.legalName}} asigură casca de protecție lucrătorilor.',
      '(3) Instruirea se face la angajare și periodic.',
    ]);
    if (result.status !== 'applied') return;
    expect(result.summary.notes).toEqual(['(5) repealed; the template does not quote it']);
  });

  it('needs a person when the quote already reads as the change', () => {
    const result = patch([
      {
        old: '(3) Instruirea se face la angajare.',
        new: '(3) Instruirea se face la angajare și periodic.',
      },
    ]);
    expect(result.status).toBe('needs-review');
  });
});
