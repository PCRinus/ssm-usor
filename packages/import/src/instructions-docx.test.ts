import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { DocxReadError } from './docx';
import { readInstructionsDocx } from './instructions-docx';

const w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

type Numbered = { numId?: number; level?: number; style?: string };

const paragraph = (text: string, numbered: Numbered = {}) => {
  const numPr =
    numbered.numId === undefined && numbered.level === undefined
      ? ''
      : `<w:numPr>${numbered.level === undefined ? '' : `<w:ilvl w:val="${numbered.level}"/>`}${
          numbered.numId === undefined ? '' : `<w:numId w:val="${numbered.numId}"/>`
        }</w:numPr>`;
  const style = numbered.style ? `<w:pStyle w:val="${numbered.style}"/>` : '';
  return `<w:p><w:pPr>${style}${numPr}</w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
};

const cell = (...paragraphs: string[]) => `<w:tc><w:tcPr/>${paragraphs.join('')}</w:tc>`;
const row = (...cells: string[]) => `<w:tr>${cells.join('')}</w:tr>`;
const table = (...rows: string[]) => `<w:tbl><w:tblPr/>${rows.join('')}</w:tbl>`;

type LevelDefinition = {
  format?: string;
  text: string;
  start?: number;
  legal?: boolean;
  restartAfter?: number;
  style?: string;
};

const level = (index: number, definition: LevelDefinition) =>
  `<w:lvl w:ilvl="${index}"><w:start w:val="${definition.start ?? 1}"/><w:numFmt w:val="${
    definition.format ?? 'decimal'
  }"/>${definition.restartAfter === undefined ? '' : `<w:lvlRestart w:val="${definition.restartAfter}"/>`}${
    definition.style ? `<w:pStyle w:val="${definition.style}"/>` : ''
  }${definition.legal ? '<w:isLgl/>' : ''}<w:lvlText w:val="${definition.text}"/><w:lvlJc w:val="left"/></w:lvl>`;

const abstractNum = (id: number, ...levels: LevelDefinition[]) =>
  `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${levels
    .map((definition, index) => level(index, definition))
    .join('')}</w:abstractNum>`;

const num = (id: number, abstractId: number, overrides = '') =>
  `<w:num w:numId="${id}"><w:abstractNumId w:val="${abstractId}"/>${overrides}</w:num>`;

const startOverride = (levelIndex: number, start: number) =>
  `<w:lvlOverride w:ilvl="${levelIndex}"><w:startOverride w:val="${start}"/></w:lvlOverride>`;

const articles: LevelDefinition[] = [
  { text: 'Art. %1.' },
  { format: 'lowerLetter', text: '%2)' },
  { text: '%3.' },
];

function docx(options: {
  body: string;
  numbering?: string;
  styles?: string;
  endnotes?: string;
  footnotes?: string;
}) {
  const xml = (body: string) => strToU8(`<?xml version="1.0" encoding="UTF-8"?>${body}`);
  const parts: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': xml(
      `<w:document ${w}><w:body>${options.body}<w:sectPr/></w:body></w:document>`
    ),
    'word/header1.xml': xml(`<w:hdr ${w}>${paragraph('BRUTĂRIA FICTIVĂ S.R.L.')}</w:hdr>`),
  };
  if (options.numbering)
    parts['word/numbering.xml'] = xml(`<w:numbering ${w}>${options.numbering}</w:numbering>`);
  if (options.styles) parts['word/styles.xml'] = xml(`<w:styles ${w}>${options.styles}</w:styles>`);
  const notes = (kind: 'endnote' | 'footnote', body: string) =>
    xml(
      `<w:${kind}s ${w}><w:${kind} w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:${kind}><w:${kind} w:type="continuationSeparator" w:id="0">${paragraph('—')}</w:${kind}>${body}</w:${kind}s>`
    );
  if (options.endnotes) parts['word/endnotes.xml'] = notes('endnote', options.endnotes);
  if (options.footnotes) parts['word/footnotes.xml'] = notes('footnote', options.footnotes);
  return zipSync(parts);
}

const labels = (bytes: Uint8Array) =>
  readInstructionsDocx(bytes).paragraphs.map((read) => read.numbered?.label ?? null);

describe('readInstructionsDocx', () => {
  it('prints each level of a multi-level list and restarts the deeper levels', () => {
    const bytes = docx({
      numbering: abstractNum(1, ...articles) + num(1, 1),
      body: [
        paragraph('Capitolul I. Dispoziții generale'),
        paragraph('Instrucțiunea se aplică brutarilor.', { numId: 1, level: 0 }),
        paragraph('Înainte de lucru:', { numId: 1, level: 0 }),
        paragraph('verifică cuptorul;', { numId: 1, level: 1 }),
        paragraph('ușa', { numId: 1, level: 2 }),
        paragraph('termometrul', { numId: 1, level: 2 }),
        paragraph('poartă mănuși.', { numId: 1, level: 1 }),
        paragraph('mâneci lungi', { numId: 1, level: 2 }),
        paragraph('La terminarea lucrului:', { numId: 1, level: 0 }),
        paragraph('oprește cuptorul.', { numId: 1, level: 1 }),
      ].join(''),
    });

    const read = readInstructionsDocx(bytes);

    expect(read.paragraphs).toEqual([
      { text: 'Capitolul I. Dispoziții generale' },
      { text: 'Instrucțiunea se aplică brutarilor.', numbered: { level: 0, label: 'Art. 1.' } },
      { text: 'Înainte de lucru:', numbered: { level: 0, label: 'Art. 2.' } },
      { text: 'verifică cuptorul;', numbered: { level: 1, label: 'a)' } },
      { text: 'ușa', numbered: { level: 2, label: '1.' } },
      { text: 'termometrul', numbered: { level: 2, label: '2.' } },
      { text: 'poartă mănuși.', numbered: { level: 1, label: 'b)' } },
      { text: 'mâneci lungi', numbered: { level: 2, label: '1.' } },
      { text: 'La terminarea lucrului:', numbered: { level: 0, label: 'Art. 3.' } },
      { text: 'oprește cuptorul.', numbered: { level: 1, label: 'a)' } },
    ]);
    expect(read.text.split('\n')).toEqual([
      'Capitolul I. Dispoziții generale',
      'Art. 1. Instrucțiunea se aplică brutarilor.',
      'Art. 2. Înainte de lucru:',
      'a) verifică cuptorul;',
      '1. ușa',
      '2. termometrul',
      'b) poartă mănuși.',
      '1. mâneci lungi',
      'Art. 3. La terminarea lucrului:',
      'a) oprește cuptorul.',
    ]);
  });

  it('takes the numbering of a paragraph style, through the styles it is based on', () => {
    const bytes = docx({
      numbering:
        abstractNum(
          1,
          { text: 'Art. %1.' },
          { format: 'lowerLetter', text: '%2)', style: 'Litera' }
        ) + num(4, 1),
      styles: [
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>',
        '<w:style w:type="paragraph" w:styleId="Articol"><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:numId w:val="4"/></w:numPr></w:pPr></w:style>',
        '<w:style w:type="paragraph" w:styleId="ArticolBrutarie"><w:basedOn w:val="Articol"/></w:style>',
        '<w:style w:type="paragraph" w:styleId="Litera"><w:pPr><w:numPr><w:numId w:val="4"/></w:numPr></w:pPr></w:style>',
      ].join(''),
      body: [
        paragraph('Lucrul la cuptor', { style: 'ArticolBrutarie' }),
        paragraph('se face cu mănuși;', { style: 'Litera' }),
        paragraph('Lucrul la malaxor', { style: 'Articol' }),
        paragraph('Lucrul la feliator', { style: 'Articol', numId: 0 }),
        paragraph('Text obișnuit'),
      ].join(''),
    });

    expect(readInstructionsDocx(bytes).paragraphs).toEqual([
      { text: 'Lucrul la cuptor', numbered: { level: 0, label: 'Art. 1.' } },
      { text: 'se face cu mănuși;', numbered: { level: 1, label: 'a)' } },
      { text: 'Lucrul la malaxor', numbered: { level: 0, label: 'Art. 2.' } },
      { text: 'Lucrul la feliator' },
      { text: 'Text obișnuit' },
    ]);
  });

  it('continues a list across the instances that share it, until one restarts it', () => {
    const bytes = docx({
      numbering:
        abstractNum(1, ...articles) +
        num(1, 1) +
        num(2, 1) +
        num(3, 1, startOverride(0, 288)) +
        num(5, 1, startOverride(0, 250)),
      body: [
        paragraph('primul', { numId: 1, level: 0 }),
        paragraph('al doilea', { numId: 2, level: 0 }),
        paragraph('al treilea', { numId: 1, level: 0 }),
        paragraph('mutat din alt pachet', { numId: 3, level: 0 }),
        paragraph('urmează', { numId: 3, level: 0 }),
        paragraph('tot din listă', { numId: 2, level: 0 }),
        paragraph('repetat', { numId: 5, level: 0 }),
      ].join(''),
    });

    expect(labels(bytes)).toEqual([
      'Art. 1.',
      'Art. 2.',
      'Art. 3.',
      'Art. 288.',
      'Art. 289.',
      'Art. 290.',
      'Art. 250.',
    ]);
  });

  it('keeps a level going when its restart rule says so, and counts a level skipped as used', () => {
    const bytes = docx({
      numbering:
        abstractNum(
          1,
          { format: 'upperRoman', text: 'Capitolul %1.' },
          { text: 'Art. %2.', restartAfter: 0 },
          { format: 'lowerLetter', text: '%3)' }
        ) + num(1, 1),
      body: [
        paragraph('mai întâi o literă', { numId: 1, level: 2 }),
        paragraph('Dispoziții generale', { numId: 1, level: 0 }),
        paragraph('primul articol', { numId: 1, level: 1 }),
        paragraph('Lucrul la cuptor', { numId: 1, level: 0 }),
        paragraph('al doilea articol', { numId: 1, level: 1 }),
      ].join(''),
    });

    expect(labels(bytes)).toEqual(['a)', 'Capitolul II.', 'Art. 2.', 'Capitolul III.', 'Art. 3.']);
  });

  it('prints the shallower levels in arabic numerals on a legal level', () => {
    const bytes = docx({
      numbering:
        abstractNum(
          1,
          { format: 'upperRoman', text: '%1.' },
          { text: '%1.%2.', legal: true },
          { format: 'lowerLetter', text: '%1.%2.%3)' }
        ) + num(1, 1, startOverride(0, 13)),
      body: [
        paragraph('Instrucțiuni specifice', { numId: 1, level: 0 }),
        paragraph('Polizorul unghiular', { numId: 1, level: 1 }),
        paragraph('Scara metalică', { numId: 1, level: 2 }),
      ].join(''),
    });

    expect(labels(bytes)).toEqual(['XIII.', '13.1.', 'XIII.1.a)']);
  });

  it('prints a bullet as a plain mark, and leaves a list without a number unnumbered', () => {
    const bytes = docx({
      numbering:
        abstractNum(
          1,
          { format: 'bullet', text: '' },
          { format: 'bullet', text: 'o' },
          { format: 'bullet', text: '-' },
          { format: 'none', text: '' }
        ) + num(1, 1),
      body: [
        paragraph('mănuși', { numId: 1, level: 0 }),
        paragraph('din piele', { numId: 1, level: 1 }),
        paragraph('scurte', { numId: 1, level: 2 }),
        paragraph('fără număr', { numId: 1, level: 3 }),
      ].join(''),
    });

    expect(readInstructionsDocx(bytes).text).toBe(
      ['• mănuși', '• din piele', '– scurte', 'fără număr'].join('\n')
    );
  });

  it('keeps an empty numbered paragraph, whose number Word prints', () => {
    const bytes = docx({
      numbering: abstractNum(1, ...articles) + num(1, 1),
      body: [
        paragraph('primul', { numId: 1, level: 0 }),
        paragraph('', { numId: 1, level: 0 }),
        paragraph(''),
        paragraph('al treilea', { numId: 1, level: 0 }),
      ].join(''),
    });

    expect(readInstructionsDocx(bytes).paragraphs).toEqual([
      { text: 'primul', numbered: { level: 0, label: 'Art. 1.' } },
      { text: '', numbered: { level: 0, label: 'Art. 2.' } },
      { text: 'al treilea', numbered: { level: 0, label: 'Art. 3.' } },
    ]);
  });

  it('reads a one-cell table as the body and a row of several cells as one marked paragraph', () => {
    const bytes = docx({
      numbering: abstractNum(1, ...articles) + num(1, 1),
      body: [
        paragraph('Echipament individual de protecție', { numId: 1, level: 0 }),
        table(
          row(
            cell(
              paragraph('Pantofi de protecție', { numId: 1, level: 0 }),
              paragraph('talpă antiderapantă', { numId: 1, level: 1 })
            )
          ),
          row(cell(paragraph('Mănuși', { numId: 1, level: 0 })), cell(paragraph('')))
        ),
        table(
          row(cell(paragraph('Post')), cell(paragraph('Echipament'))),
          row(
            cell(paragraph('Brutar')),
            cell(
              paragraph('mănuși', { numId: 1, level: 1 }),
              paragraph('bonetă', { numId: 1, level: 1 })
            )
          )
        ),
        paragraph('După tabel', { numId: 1, level: 0 }),
      ].join(''),
    });

    expect(readInstructionsDocx(bytes).paragraphs).toEqual([
      { text: 'Echipament individual de protecție', numbered: { level: 0, label: 'Art. 1.' } },
      { text: 'Pantofi de protecție', numbered: { level: 0, label: 'Art. 2.' } },
      { text: 'talpă antiderapantă', numbered: { level: 1, label: 'a)' } },
      { text: 'Mănuși', numbered: { level: 0, label: 'Art. 3.' } },
      { text: 'Post – Echipament', table: true },
      { text: 'Brutar – a) mănuși / b) bonetă', table: true },
      { text: 'După tabel', numbered: { level: 0, label: 'Art. 4.' } },
    ]);
  });

  it('reads the footnotes and endnotes after the body, each counting its lists anew', () => {
    const bytes = docx({
      numbering: abstractNum(1, ...articles) + num(1, 1),
      body: [
        paragraph('Instrucțiuni proprii', { numId: 1, level: 0 }),
        paragraph('Se aplică tuturor.', { numId: 1, level: 0 }),
      ].join(''),
      footnotes: `<w:footnote w:id="1">${paragraph('Conform Legii nr. 307/2006.')}</w:footnote>`,
      endnotes: `<w:endnote w:id="1">${[
        paragraph('Anexa nr. 1'),
        paragraph('Instrucțiuni pentru birouri'),
        paragraph('Fumatul este interzis.', { numId: 1, level: 0 }),
        paragraph('în birouri;', { numId: 1, level: 1 }),
      ].join('')}</w:endnote><w:endnote w:id="2">${paragraph('Anexa nr. 2')}</w:endnote>`,
    });

    expect(readInstructionsDocx(bytes).text.split('\n')).toEqual([
      'Art. 1. Instrucțiuni proprii',
      'Art. 2. Se aplică tuturor.',
      'Conform Legii nr. 307/2006.',
      'Anexa nr. 1',
      'Instrucțiuni pentru birouri',
      'Art. 1. Fumatul este interzis.',
      'a) în birouri;',
      'Anexa nr. 2',
    ]);
  });

  it('reads a document without numbering definitions as plain paragraphs', () => {
    const bytes = docx({ body: paragraph('Text', { numId: 1, level: 0 }) });

    expect(readInstructionsDocx(bytes)).toEqual({ paragraphs: [{ text: 'Text' }], text: 'Text' });
  });

  it('refuses a file that is not a Word document', () => {
    expect(() => readInstructionsDocx(new Uint8Array([1, 2, 3]))).toThrow(DocxReadError);
    expect(() => readInstructionsDocx(zipSync({ 'other.txt': strToU8('x') }))).toThrow(
      DocxReadError
    );
  });
});
