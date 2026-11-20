import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { contentWidths, fitColumnsToContent, measureColumn, textWidth } from './content-widths';
import { renderDocument } from './render';

function docx(body: string) {
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
  );
  return zip.generate({ type: 'uint8array' });
}

const total = 9000;
const size = 16;
const run = (text: string, bold = false) =>
  `<w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
const cell = (content: string, width = 3000) =>
  `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr><w:p>${content}</w:p></w:tc>`;
const headerRow = (...labels: string[]) =>
  `<w:tr><w:trPr><w:tblHeader/></w:trPr>${labels.map((label) => cell(run(label, true))).join('')}</w:tr>`;
const bodyRow = (...texts: string[]) =>
  `<w:tr>${texts.map((text) => cell(run(text))).join('')}</w:tr>`;
const table = (rows: string, marked = true) =>
  `<w:tbl><w:tblPr><w:tblStyle w:val="HouseTable"/><w:tblW w:w="5000" w:type="pct"/>` +
  `<w:tblCellMar><w:left w:w="85" w:type="dxa"/><w:right w:w="85" w:type="dxa"/></w:tblCellMar>` +
  `${marked ? '<w:tblCaption w:val="ContentWidths"/>' : ''}</w:tblPr>` +
  `<w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>${rows}</w:tbl>`;
const header = headerRow('Riscuri evaluate', 'Măsuri tehnice', 'Observații');
const gridsOf = (xml: string) =>
  [...xml.matchAll(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/g)].map(([, grid]) =>
    [...grid!.matchAll(/w:w="(\d+)"/g)].map((match) => Number(match[1]))
  );
const cellWidthsOf = (xml: string) =>
  [...xml.matchAll(/<w:tcW w:w="(\d+)"/g)].map((match) => Number(match[1]));
const sum = (values: number[]) => values.reduce((all, each) => all + each, 0);
const column = (floor: number, oneLine: number, amount: number) => ({ floor, oneLine, amount });

describe('the width of text in Arial', () => {
  it('adds up the advances of Liberation Sans at the size, rounded up', () => {
    expect(textWidth('Nr.', size, true)).toBeCloseTo(((723 + 390 + 278) * 16) / 100);
    expect(textWidth('ii', size)).toBeLessThan(textWidth('mm', size));
    expect(textWidth('ș', size)).toBe(textWidth('s', size));
  });

  it('counts a character it has no advance for as the widest', () => {
    expect(textWidth('Ω', size)).toBeGreaterThanOrEqual(textWidth('W', size));
  });
});

describe('measuring a column', () => {
  const lines = (...each: string[]) => [{ lines: each, size }];

  it('floors it at its longest word, the bold header words included, and the padding', () => {
    const measured = measureColumn(lines('Observații'), { cells: [lines('un text scurt')] }, 170);
    expect(measured.floor).toBe(Math.ceil(textWidth('Observații', size, true)) + 170 + 20);
  });

  it('breaks words at spaces and after hyphens, never at a no-break space', () => {
    const hyphenated = measureColumn([], { cells: [lines('igienico-sanitare')] }, 0);
    expect(hyphenated.floor).toBe(Math.ceil(textWidth('igienico-', size)) + 20);
    const held = measureColumn([], { cells: [lines('25\u00a0kg')] }, 0);
    expect(held.floor).toBe(Math.ceil(textWidth('25\u00a0kg', size)) + 20);
  });

  it('counts a hung measure from its indent, its dash once', () => {
    const measured = measureColumn(
      [],
      { cells: [[{ lines: ['– Verificarea'], size, indent: 170 }]] },
      0
    );
    expect(measured.floor).toBe(Math.ceil(170 + textWidth('Verificarea', size)) + 20);
    expect(measured.oneLine).toBe(measured.floor);
  });

  it('never breaks after a hyphen before a digit, in a date or a phone number', () => {
    for (const whole of ['31-12-2026', '0722-123-456']) {
      const measured = measureColumn([], { cells: [lines(`la ${whole}`)] }, 0);
      expect(measured.floor).toBe(Math.ceil(textWidth(whole, size)) + 20);
    }
  });

  it('keeps the dash that opens a list item with its first word', () => {
    const measured = measureColumn([], { cells: [lines('– Planificarea deplasărilor')] }, 0);
    expect(measured.floor).toBe(Math.ceil(textWidth('–\u00a0Planificarea', size)) + 20);
  });

  it('reads each line break as a line, and leaves out the cells that hold a dash', () => {
    const measured = measureColumn(
      [],
      { cells: [lines('– Prima măsură.', '– A doua.'), lines('—'), lines('')] },
      0
    );
    expect(measured.oneLine).toBe(Math.ceil(textWidth('– Prima măsură.', size)) + 20);
    expect(measured.amount).toBe('– Prima măsură. – A doua.'.length);
  });
});

describe('sharing the width by content', () => {
  it('gives every column its floor and the rest by how much text it holds', () => {
    const widths = contentWidths(
      [column(400, 9000, 0), column(1000, 9000, 1000), column(1000, 9000, 100)],
      total
    )!;
    expect(sum(widths)).toBe(total);
    expect(widths[0]).toBe(400);
    expect(widths[1]).toBeGreaterThan(widths[2]!);
  });

  it('gives no column more than it needs for its longest line', () => {
    const widths = contentWidths([column(500, 900, 10), column(500, 9000, 10)], 3000)!;
    expect(widths).toEqual([900, 2100]);
  });

  it('caps a column of very long text at 30 % of the width while the others can use the room', () => {
    const others = Array.from({ length: 4 }, () => column(1000, 9000, 10));
    const widths = contentWidths([column(1000, 9000, 100_000), ...others], total)!;
    expect(widths).toEqual([2700, 1575, 1575, 1575, 1575]);
  });

  it('lets it past the cap when the others need no more', () => {
    const widths = contentWidths([column(1000, 9000, 100_000), column(1000, 1200, 10)], total)!;
    expect(widths).toEqual([7800, 1200]);
  });

  it('gives a word wider than the cap the cap as its floor, the room past it once no other column needs it', () => {
    const widths = contentWidths([column(4000, 4000, 10), column(500, 9000, 10)], total)!;
    expect(widths[0]).toBe(4000);
    expect(widths[1]).toBe(5000);
  });

  it('shares what no column can use in proportion', () => {
    const widths = contentWidths([column(500, 600, 5), column(1000, 1200, 5)], 3600)!;
    expect(widths).toEqual([1200, 2400]);
  });

  it('keeps the template when the floors do not fit or nothing is written', () => {
    const header = () => column(2800, 2800, 10);
    expect(contentWidths([header(), header(), header(), header()], total)).toBeUndefined();
    expect(contentWidths([column(500, 500, 0), column(500, 500, 0)], total)).toBeUndefined();
  });

  it('rounds to whole twips that add up, the first of equals first', () => {
    const widths = contentWidths(
      [column(100, 9000, 1), column(100, 9000, 1), column(100, 9000, 1)],
      1000
    )!;
    expect(widths).toEqual([334, 333, 333]);
  });
});

describe('fitting marked tables to their content', () => {
  const fitted = (body: string) => fitColumnsToContent(`<w:body>${body}</w:body>`);

  it('leaves a table the template did not mark as it is', () => {
    const body = table(header + bodyRow('F1. Cădere', 'Text lung de tot', '—'), false);
    expect(fitted(body)).toBe(`<w:body>${body}</w:body>`);
  });

  it('leaves an empty plan as the template drew it', () => {
    const body = table(header);
    expect(gridsOf(fitted(body))).toEqual([[3000, 3000, 3000]]);
  });

  it('fits one row, its grid and its cells', () => {
    const xml = fitted(
      table(header + bodyRow('F1. Cădere', 'Montarea balustradelor pe toată lungimea', '—'))
    );
    const [grid] = gridsOf(xml);
    expect(sum(grid!)).toBe(total);
    expect(grid![1]).toBeGreaterThan(grid![2]!);
    expect(cellWidthsOf(xml)).toEqual([...grid!, ...grid!]);
  });

  it('gives every table of a kind the same widths, from all their rows', () => {
    const first = table(header + bodyRow('F1. Cădere', 'Scurt.', '—'));
    const second = table(header + bodyRow('F2. Zgomot', 'Mult mai mult text, '.repeat(20), '—'));
    const grids = gridsOf(fitted(first + second));
    expect(grids[0]).toEqual(grids[1]);
    expect(grids[0]).toEqual(gridsOf(fitted(second + first))[0]);
  });

  it('lets an address break rather than widen its column for every table', () => {
    const address = 'https://www.inspectiamuncii.ro/documents/66402/instructiuni-ssm';
    const risk = 'F1. Cădere de la înălțime pe scările exterioare, ude sau înghețate. '.repeat(4);
    const [grid] = gridsOf(fitted(table(header + bodyRow(risk, address, '—'))));
    expect(grid![1]).toBeLessThan(textWidth(address, size));
    expect(grid![0]).toBeGreaterThan(grid![1]!);
  });

  it('still fits the table when two columns each hold such a word', () => {
    const long = 'W'.repeat(80);
    const risk = 'F1. Cădere de la înălțime pe scările exterioare, ude sau înghețate. '.repeat(4);
    const [grid] = gridsOf(fitted(table(header + bodyRow(risk, long, long))));
    expect(grid).not.toEqual([3000, 3000, 3000]);
    expect(grid![1]).toBeLessThan(textWidth(long, size));
    expect(grid![2]).toBeLessThan(textWidth(long, size));
  });

  it('takes the caption off, which Word would show as the alternative text', () => {
    const xml = fitted(
      table(header + bodyRow('F1. Cădere', 'Montarea balustradelor', '—')) + table(header)
    );
    expect(xml).not.toContain('tblCaption');
  });

  it('gives the same widths for the same data', () => {
    const body = table(
      header + bodyRow('F1. Cădere', 'Montarea balustradelor', 'Verificare zilnică')
    );
    expect(fitted(body)).toBe(fitted(body));
  });

  it('runs on a merge, before the keep rule reads the grid', () => {
    const template = docx(
      table(header + bodyRow('{{#plan}}{{risk}}', '{{technical}}', '{{note}}{{/plan}}'))
    );
    const merged = renderDocument(template, {
      plan: [
        { risk: 'F1. Cădere', technical: 'Montarea balustradelor pe toată lungimea', note: '—' },
      ],
    });
    const [grid] = gridsOf(new PizZip(merged).file('word/document.xml')!.asText());
    expect(grid).not.toEqual([3000, 3000, 3000]);
    expect(sum(grid!)).toBe(total);
  });
});
