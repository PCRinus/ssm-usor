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

  it("hangs the items of the plan's actions column as it does the measures", () => {
    const merged = paragraph(
      '<w:r><w:t xml:space="preserve">– Contractarea verificării.</w:t><w:br/><w:t xml:space="preserve">– Instruirea.</w:t></w:r>'
    );
    expect(
      paragraphsOf(
        hangDashLines(table(merged, { header: 'Acțiuni în scopul realizării măsurii' }))
      ).map(textOf)
    ).toEqual(['–⇥Contractarea verificării.', '–⇥Instruirea.']);
  });

  it('hangs an en-dash item that opens with a digit, as a minus is only a hyphen', () => {
    const merged = paragraph(
      '<w:r><w:t xml:space="preserve">– Verificarea.</w:t><w:br/><w:t xml:space="preserve">– 2 verificări pe an.</w:t></w:r>'
    );
    expect(paragraphsOf(hangDashLines(table(merged))).map(textOf)).toEqual([
      '–⇥Verificarea.',
      '–⇥2 verificări pe an.',
    ]);
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

  it('leaves an empty paragraph whole and still hangs the measure after it', () => {
    const merged = hangDashLines(table('<w:p/><w:p><w:r><w:t>- a &amp; b</w:t></w:r></w:p>'));
    expect(merged).toContain('<w:p/><w:p><w:pPr><w:ind w:left="170" w:hanging="170"/></w:pPr>');
    expect(merged.match(/<w:p[ >/]/g)).toHaveLength(5);
    expect(textOf(merged.slice(merged.lastIndexOf('<w:p>')))).toBe('–⇥a &amp; b');
  });

  it("hangs the risks of 9.2's column, and leaves a longer heading on risks alone", () => {
    const merged = paragraph(
      '<w:r><w:t xml:space="preserve">– Electrocutare (nivel de risc 6)</w:t><w:br/><w:t xml:space="preserve">– Arsuri (nivel de risc 5)</w:t></w:r>'
    );
    expect(paragraphsOf(hangDashLines(table(merged, { header: 'Riscuri' }))).map(textOf)).toEqual([
      '–⇥Electrocutare (nivel de risc 6)',
      '–⇥Arsuri (nivel de risc 5)',
    ]);
    const plan = table(merged, { header: 'Riscuri evaluate' });
    expect(hangDashLines(plan)).toBe(plan);
  });

  it('finds the dash after a run of spaces, and empty runs and properties do not stop it', () => {
    const spaced = paragraph(
      '<w:r><w:t xml:space="preserve"> </w:t></w:r><w:r/><w:r><w:t xml:space="preserve">– a</w:t></w:r>'
    );
    expect(paragraphsOf(hangDashLines(table(spaced))).map(textOf)).toEqual([' –⇥a']);
    const bare = '<w:p><w:pPr/><w:r><w:t xml:space="preserve">– a</w:t></w:r></w:p>';
    const hung = hangDashLines(table(bare));
    expect(hung).not.toContain('<w:pPr/>');
    expect(paragraphsOf(hung).map(textOf)).toEqual(['–⇥a']);
  });

  it('takes a dash before spaces and a digit for a minus sign', () => {
    const minus = paragraph('<w:r><w:t xml:space="preserve">-  5 °C la exterior</w:t></w:r>');
    expect(hangDashLines(table(minus))).toBe(table(minus));
  });
});
