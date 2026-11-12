import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { templateCitations } from './citations';
import { inlineDiff, replaceQuote, summaryMarkdown } from './quote-replacement';
import { paragraphsOf } from './text';

const bold = '<w:rPr><w:b/><w:sz w:val="20"/></w:rPr>';
const italic = '<w:rPr><w:i/><w:sz w:val="20"/></w:rPr>';
const normal = '<w:rPr><w:sz w:val="20"/></w:rPr>';
const run = (properties: string, text: string) =>
  `<w:r>${properties}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const alineat = (label: string, text: string) =>
  `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${run(bold, label)}${run(normal, ` ${text}`)}</w:p>`;
const plain = (text: string) => `<w:p>${run(normal, text)}</w:p>`;
const marker = (locator: string, first: string) =>
  `<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run(italic, `(Preluare din O.U.G. 195/2002 – ${locator})`)}${run(normal, ` ${first}`)}</w:p>`;

const body = [
  plain('Capitolul IV. Circulația'),
  marker('Art. 36 alin. (1) – (3)', '(1) Conducătorii poartă centura de siguranță.'),
  alineat('(1¹)', 'Conducătorii informează pasagerii.'),
  alineat('(2)', 'Motocicliștii poartă casca de protecție omologată.'),
  alineat('(3)', 'Telefonul se folosește numai cu dispozitive «mâini libere».'),
  plain('Capitolul V. Intersecții'),
];

function docx(paragraphs: string[]) {
  const zip = new PizZip();
  zip.file(
    'word/document.xml',
    `<w:document><w:body>${paragraphs.join('')}<w:sectPr/></w:body></w:document>`
  );
  zip.file('word/styles.xml', '<w:styles/>');
  return zip.generate({ type: 'uint8array' });
}

const source = docx(body);
const quote = () => {
  const found = templateCitations({
    manifest: 'ssm',
    file: 'test.docx',
    typeKey: 'test',
    source,
  }).filter((citation) => citation.form === 'quote')[0]!;
  return found;
};
const lines = () => quote().text!.split('\n');
const xmlOf = (docxSource: Uint8Array) =>
  new PizZip(docxSource).file('word/document.xml')!.asText();
const quotedText = (docxSource: Uint8Array) =>
  templateCitations({ manifest: 'ssm', file: 'test.docx', typeKey: 'test', source: docxSource })
    .filter((citation) => citation.form === 'quote')
    .map((citation) => [citation.locator, citation.text]);

describe('a quote replaced by its current wording', () => {
  it('changes the alineat that changed, and leaves every other paragraph as it was', () => {
    const wording = lines();
    wording[2] = '(2) Motocicliștii poartă pe cap cască de protecție omologată.';
    const result = replaceQuote(source, { citation: quote(), lines: wording });

    expect(quotedText(result.source)).toEqual([['Art. 36 alin. (1) – (3)', wording.join('\n')]]);
    const xml = xmlOf(result.source);
    const original = xmlOf(source);
    const changed = paragraphsOf(original)[3]!;
    expect(xml.slice(0, changed.offset)).toBe(original.slice(0, changed.offset));
    expect(xml.slice(xml.length - (original.length - changed.offset - changed.xml.length))).toBe(
      original.slice(changed.offset + changed.xml.length)
    );
    expect(paragraphsOf(xml)[3]!.xml).toBe(
      alineat('(2)', 'Motocicliștii poartă pe cap cască de protecție omologată.')
    );
    expect(result.summary).toEqual({
      file: 'test.docx',
      act: 'O.U.G. 195/2002',
      locator: 'Art. 36 alin. (1) – (3)',
      changes: [
        {
          kind: 'changed',
          paragraph: 3,
          before: '(2) Motocicliștii poartă casca de protecție omologată.',
          after: '(2) Motocicliștii poartă pe cap cască de protecție omologată.',
        },
      ],
      notes: [],
    });
  });

  it('changes nothing when the wording is the same, written as the portal writes it', () => {
    const wording = [
      '(1) Conducatorii poarta centura de siguranta.',
      '(1^1) Conducătorii informează pasagerii.',
      '(2) Motocicliştii poartă casca de protecţie omologată.',
      '(3) Telefonul se folosește numai cu dispozitive "mâini libere".',
    ];
    const result = replaceQuote(source, { citation: quote(), lines: wording });
    expect(result.source).toBe(source);
    expect(result.summary.changes).toEqual([]);
  });

  it('changes the first line in the marker paragraph, after the marker', () => {
    const wording = lines();
    wording[0] = '(1) Conducătorii și pasagerii poartă centura de siguranță.';
    const result = replaceQuote(source, { citation: quote(), lines: wording });
    expect(paragraphsOf(xmlOf(result.source))[1]!.xml).toBe(
      marker(
        'Art. 36 alin. (1) – (3)',
        '(1) Conducătorii și pasagerii poartă centura de siguranță.'
      )
    );
  });

  it('adds an alineat in the formatting of the one before it, and a locator that covers it', () => {
    const wording = [
      ...lines(),
      '(4) Încălcarea alin. (2) din prezenta ordonanță de urgență se sancționează.',
    ];
    const result = replaceQuote(source, {
      citation: quote(),
      lines: wording,
      locator: 'Art. 36 alin. (1) – (4)',
    });
    const paragraphs = paragraphsOf(xmlOf(result.source));
    expect(paragraphs[5]!.xml).toBe(
      alineat('(4)', 'Încălcarea alin. (2) din O.U.G. 195/2002 se sancționează.')
    );
    expect(paragraphs[1]!.text).toMatch(
      /^\(Preluare din O\.U\.G\. 195\/2002 – Art\. 36 alin\. \(1\) – \(4\)\) \(1\)/
    );
    expect(paragraphs[6]!.text).toBe('Capitolul V. Intersecții');
    expect(result.summary.changes).toEqual([
      {
        kind: 'added',
        paragraph: 5,
        before: null,
        after: '(4) Încălcarea alin. (2) din O.U.G. 195/2002 se sancționează.',
      },
    ]);
    expect(result.summary.notes).toEqual([
      'the marker now cites Art. 36 alin. (1) – (4)',
      '(4) "prezenta ordonanță de urgență" named as "O.U.G. 195/2002"',
    ]);
  });

  it('adds an alineat between two, by its number', () => {
    const wording = lines();
    wording.splice(2, 0, '(1²) Copiii sunt transportați în scaune omologate.');
    const result = replaceQuote(source, { citation: quote(), lines: wording });
    expect(quotedText(result.source)).toEqual([['Art. 36 alin. (1) – (3)', wording.join('\n')]]);
    expect(paragraphsOf(xmlOf(result.source))[3]!.xml).toBe(
      alineat('(1²)', 'Copiii sunt transportați în scaune omologate.')
    );
  });

  it('removes an alineat the act no longer has', () => {
    const wording = lines().filter((line) => !line.startsWith('(1¹)'));
    const result = replaceQuote(source, { citation: quote(), lines: wording });
    expect(quotedText(result.source)).toEqual([['Art. 36 alin. (1) – (3)', wording.join('\n')]]);
    expect(paragraphsOf(xmlOf(result.source))).toHaveLength(body.length - 1);
    expect(result.summary.changes).toEqual([
      {
        kind: 'removed',
        paragraph: 2,
        before: '(1¹) Conducătorii informează pasagerii.',
        after: null,
      },
    ]);
  });

  it('refuses a citation whose text the template no longer has', () => {
    expect(() =>
      replaceQuote(source, { citation: { ...quote(), text: 'Alt text.' }, lines: lines() })
    ).toThrow('no longer as the citation gives it');
  });

  it('refuses a line that would not read as part of the quote', () => {
    expect(() =>
      replaceQuote(source, { citation: quote(), lines: [...lines(), 'Capitolul nou al codului.'] })
    ).toThrow('where it should read');
  });

  it('refuses a locator a marker cannot carry', () => {
    expect(() =>
      replaceQuote(source, { citation: quote(), lines: lines(), locator: 'articolul 36' })
    ).toThrow('is not a locator a marker can carry');
  });
});

describe('the summary', () => {
  it('marks the words removed and added', () => {
    expect(
      inlineDiff(
        'să poarte casca de protecție omologată.',
        'să poarte pe cap cască de protecție omologată pentru vehicul.'
      )
    ).toBe('să poarte ~~casca~~ **pe cap cască** de protecție omologată **pentru vehicul**.');
  });

  it('lists each line that changed, in Markdown', () => {
    const wording = lines();
    wording[2] = '(2) Motocicliștii poartă pe cap cască de protecție omologată.';
    const { summary } = replaceQuote(source, { citation: quote(), lines: wording });
    expect(summaryMarkdown(summary)).toBe(
      [
        '**test.docx**: O.U.G. 195/2002, Art. 36 alin. (1) – (3)',
        '',
        '- alin. (2), ¶3: (2) Motocicliștii poartă ~~casca~~ **pe cap cască** de protecție omologată.',
      ].join('\n')
    );
  });
});
