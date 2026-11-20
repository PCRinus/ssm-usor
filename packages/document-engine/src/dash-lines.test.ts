import { describe, expect, it } from 'vitest';

import { hangDashLines } from './dash-lines';

const table = (cell: string, { style = 'HouseTable', header = 'Măsuri tehnice' } = {}) =>
  `<w:tbl><w:tblPr><w:tblStyle w:val="${style}"/></w:tblPr>` +
  `<w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:p><w:r><w:t>Nr. crt.</w:t></w:r></w:p></w:tc>` +
  `<w:tc><w:p><w:r><w:t>${header}</w:t></w:r></w:p></w:tc></w:tr>` +
  `<w:tr><w:tc><w:p><w:r><w:t>1.</w:t></w:r></w:p></w:tc><w:tc>${cell}</w:tc></w:tr></w:tbl>`;
const paragraph = (runs: string) => `<w:p><w:pPr><w:jc w:val="left"/></w:pPr>${runs}</w:p>`;
const paragraphsOf = (xml: string) =>
  [...xml.matchAll(/<w:tc>((?:(?!<\/w:tc>)[\s\S])*)<\/w:tc>/g)]
    .at(-1)![1]!
    .match(/<w:p>[\s\S]*?<\/w:p>/g)!;
const textOf = (xml: string) =>
  [...xml.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)]
    .map((match) => match[1] ?? (match[0] === '<w:tab/>' ? '⇥' : '↵'))
    .join('');

describe('hangDashLines', () => {
  it('makes each merged measure a paragraph that hangs from its dash', () => {
    const merged = paragraph(
      '<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">– Verificarea periodică.</w:t><w:br/>' +
        '<w:t xml:space="preserve">– Instruirea lucrătorilor.</w:t></w:r>'
    );
    const paragraphs = paragraphsOf(hangDashLines(table(merged)));
    expect(paragraphs.map(textOf)).toEqual([
      '–⇥Verificarea periodică.',
      '–⇥Instruirea lucrătorilor.',
    ]);
    for (const each of paragraphs) {
      expect(each).toContain('<w:ind w:left="170" w:hanging="170"/><w:jc w:val="left"/>');
      expect(each).toMatch(/<w:rPr><w:sz w:val="16"\/><\/w:rPr><w:t[^>]*>–<\/w:t><w:tab\/>/);
    }
  });

  it('hangs a single measure once, and a dash in a run of its own', () => {
    const single = paragraph('<w:r><w:t xml:space="preserve">– Verificarea periodică.</w:t></w:r>');
    const hung = hangDashLines(table(single));
    expect(paragraphsOf(hung).map(textOf)).toEqual(['–⇥Verificarea periodică.']);
    expect(hangDashLines(hung)).toBe(hung);
    const split = paragraph(
      '<w:r><w:t>–</w:t></w:r><w:r><w:t xml:space="preserve"> Ș-a verificat, s-a notat 2-3 ori.</w:t></w:r>'
    );
    expect(paragraphsOf(hangDashLines(table(split))).map(textOf)).toEqual([
      '–⇥Ș-a verificat, s-a notat 2-3 ori.',
    ]);
  });

  it('keeps a line break inside a measure with the measure', () => {
    const merged = paragraph(
      '<w:r><w:t xml:space="preserve">– Verificarea zilnică</w:t><w:br/><w:t>a schelelor.</w:t>' +
        '<w:br/><w:t xml:space="preserve">– Instruirea.</w:t></w:r>'
    );
    expect(paragraphsOf(hangDashLines(table(merged))).map(textOf)).toEqual([
      '–⇥Verificarea zilnică↵a schelelor.',
      '–⇥Instruirea.',
    ]);
  });

  it('leaves a minus sign, other columns and other tables as they are', () => {
    const minus = paragraph('<w:r><w:t xml:space="preserve">- 5 °C</w:t></w:r>');
    const measure = paragraph('<w:r><w:t xml:space="preserve">– Verificarea.</w:t></w:r>');
    for (const xml of [
      table(minus),
      table(measure, { header: 'Observații' }),
      table(measure, { style: 'Other' }),
    ])
      expect(hangDashLines(xml)).toBe(xml);
  });
});
