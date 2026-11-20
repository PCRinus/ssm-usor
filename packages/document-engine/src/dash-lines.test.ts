import { describe, expect, it } from 'vitest';

import { hangDashLines } from './dash-lines';

const table = (style: string, paragraph: string) =>
  `<w:tbl><w:tblPr><w:tblStyle w:val="${style}"/></w:tblPr><w:tr><w:tc>${paragraph}</w:tc></w:tr></w:tbl>`;
const merged =
  '<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:sz w:val="16"/></w:rPr>' +
  '<w:t xml:space="preserve">– Verificarea periodică a echipamentelor.</w:t><w:br/>' +
  '<w:t xml:space="preserve">– Instruirea lucrătorilor.</w:t></w:r></w:p>';

describe('hangDashLines', () => {
  it('makes each merged dash line of a house table cell a paragraph that hangs from its dash', () => {
    const paragraphs = hangDashLines(table('HouseTable', merged)).match(/<w:p>[\s\S]*?<\/w:p>/g)!;
    expect(paragraphs).toHaveLength(2);
    for (const paragraph of paragraphs) {
      expect(paragraph).toContain('<w:ind w:left="170" w:hanging="170"/><w:jc w:val="left"/>');
      expect(paragraph).toMatch(/<w:rPr><w:sz w:val="16"\/><\/w:rPr><w:t[^>]*>–<\/w:t><w:tab\/>/);
      expect(paragraph).not.toContain('<w:br/>');
    }
    expect(paragraphs[1]).toContain('>Instruirea lucrătorilor.</w:t>');
  });

  it('leaves a cell of one line, lines without dashes and other tables as they are', () => {
    const single = '<w:p><w:r><w:t xml:space="preserve">– Verificarea periodică.</w:t></w:r></w:p>';
    const plain = '<w:p><w:r><w:t>Strada Mare 1</w:t><w:br/><w:t>Cluj-Napoca</w:t></w:r></w:p>';
    for (const xml of [
      table('HouseTable', single),
      table('HouseTable', plain),
      table('Other', merged),
    ])
      expect(hangDashLines(xml)).toBe(xml);
  });
});
