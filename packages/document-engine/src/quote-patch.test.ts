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
  if (result.status !== 'applied') throw new Error(JSON.stringify(result));
  return new PizZip(result.source).file('word/document.xml')!.asText();
};
const quotedText = (result: ReturnType<typeof patchQuote>) => {
  if (result.status !== 'applied') throw new Error(JSON.stringify(result));
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

  describe('a change found by the unit it belongs to', () => {
    const plain = (text: string) => `<w:p>${run(normal, text)}</w:p>`;
    const quoteOf = (locator: string, ...lines: string[]) => {
      const passage = docx([
        plain(`(Preluare din Legea 319/2006 – ${locator})`),
        ...lines.map(plain),
        plain('Capitolul IV'),
      ]);
      const citation = templateCitations({
        manifest: 'ssm',
        file: 'test.docx',
        typeKey: 'test',
        source: passage,
      }).filter((each) => each.form === 'quote')[0]!;
      return (changes: QuotePatch['changes']) => patchQuote(passage, { citation, changes });
    };
    const lettered = quoteOf(
      'Art. 13 alin. (1) – (2)',
      '(1) Angajatorul asigură:',
      'a) instruirea lucrătorilor;',
      'b) echipamentul de protecție.',
      '(2) Lucrătorii au obligația:',
      'a) să respecte instrucțiunile;',
      'b) să poarte echipamentul.'
    );

    it('leaves an alineat the quote does not hold, though another has the same words', () => {
      const result = quoteOf(
        'Art. 13 alin. (1) – (2)',
        '(1) Angajatorul comunică în termen de 30 de zile lucrătoare inspectoratului.',
        '(2) Lucrătorii sunt instruiți.'
      )([
        {
          old: '(3) Raportul se depune în termen de 30 de zile la inspectorat.',
          new: '(3) Raportul se depune în termen de 60 de zile la inspectorat.',
        },
      ]);
      expect(result).toEqual({
        status: 'nothing-to-apply',
        notes: ['(3) not changed; the template does not quote it'],
      });
    });

    it('repeals the letter of the alineat the unit names', () => {
      const result = lettered([
        { old: 'b) să poarte echipamentul.', new: null, unit: 'Art. 13 alin. (2) lit. b)' },
      ]);
      expect(quotedText(result).split('\n')).toEqual([
        '(1) Angajatorul asigură:',
        'a) instruirea lucrătorilor;',
        'b) echipamentul de protecție.',
        '(2) Lucrătorii au obligația:',
        'a) să respecte instrucțiunile;',
      ]);
    });

    it("changes a letter within the alineat's own lines, the law giving the alineat whole", () => {
      const result = lettered([
        {
          old: '(2) Lucrătorii au obligația:\na) să respecte instrucțiunile;\nb) să poarte echipamentul.',
          new: '(2) Lucrătorii au obligația:\na) să respecte instrucțiunile;\nb) să poarte echipamentul omologat.',
          unit: 'Art. 13 alin. (2)',
        },
      ]);
      expect(quotedText(result).split('\n').at(-1)).toBe('b) să poarte echipamentul omologat.');
    });

    it('changes the one line of a quote whose label the provider left out', () => {
      const result = quoteOf(
        'Art. 13',
        'Angajatorul comunică în termen de 30 de zile inspectoratului.'
      )([
        {
          old: '(1) Angajatorul comunică în termen de 30 de zile inspectoratului.',
          new: '(1) Angajatorul comunică în termen de 60 de zile inspectoratului.',
        },
      ]);
      expect(quotedText(result)).toBe(
        'Angajatorul comunică în termen de 60 de zile inspectoratului.'
      );
    });

    it('needs a person for a letter two alineate of the quote have', () => {
      expect(lettered([{ old: 'b) să poarte echipamentul.', new: null }])).toEqual({
        status: 'needs-review',
        problems: [
          {
            alineat: 'b',
            old: 'b) să poarte echipamentul.',
            new: null,
            reason: 'the template quotes (b) 2 times',
          },
        ],
      });
    });

    it('adds a letter after the one before it in its own alineat', () => {
      const result = lettered([
        { old: null, new: 'a¹) să participe la instruire;', unit: 'Art. 13 alin. (2) lit. a¹)' },
      ]);
      expect(quotedText(result).split('\n').slice(3)).toEqual([
        '(2) Lucrătorii au obligația:',
        'a) să respecte instrucțiunile;',
        'a¹) să participe la instruire;',
        'b) să poarte echipamentul.',
      ]);
    });

    it('adds alineate after the ones the same change adds', () => {
      const result = quoteOf(
        'Art. 13 alin. (1) – (2)',
        '(1) Angajatorul comunică inspectoratului.',
        '(2) Lucrătorii sunt instruiți.'
      )([
        { old: null, new: '(1²) Al doilea text nou adăugat.' },
        { old: null, new: '(1¹) Primul text nou adăugat.' },
      ]);
      expect(quotedText(result).split('\n')).toEqual([
        '(1) Angajatorul comunică inspectoratului.',
        '(1¹) Primul text nou adăugat.',
        '(1²) Al doilea text nou adăugat.',
        '(2) Lucrătorii sunt instruiți.',
      ]);
    });

    it('needs a person for an alineat added within the quote that it cannot place', () => {
      const result = quoteOf(
        'Art. 13 alin. (1) – (3)',
        '(1) Angajatorul comunică inspectoratului.',
        '(3) Lucrătorii sunt instruiți.'
      )([{ old: null, new: '(2¹) Text nou.' }]);
      expect(result).toEqual({
        status: 'needs-review',
        problems: [
          {
            alineat: '2¹',
            old: null,
            new: '(2¹) Text nou.',
            reason: 'it falls within the quote, but not between two lines the template quotes',
          },
        ],
      });
    });

    it('needs a person when the template holds the old words once and the law twice', () => {
      const result = quoteOf(
        'Art. 13 alin. (1)',
        '(1) Muncitorii sunt instruiți la angajare. Ucenicii se instruiesc la angajare.'
      )([
        {
          old: '(1) Muncitorii sunt instruiți la angajare. Ucenicii sunt instruiți la angajare.',
          new: '(1) Muncitorii sunt instruiți la angajare. Ucenicii sunt evaluați la angajare.',
        },
      ]);
      expect(result.status).toBe('needs-review');
      if (result.status !== 'needs-review') return;
      expect(result.problems[0]!.reason).toBe(
        'the old words are in the law 2 times, and the template does not hold the words around them that tell which: "instruiți" → "evaluați"'
      );
    });
  });
});
