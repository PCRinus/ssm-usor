import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

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

const cell = (text: string) =>
  `<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`;
const table = (style: string, rows: string) =>
  `<w:tbl><w:tblPr>${style}<w:tblW w:w="5000" w:type="pct"/></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>${rows}</w:tbl>`;
const house = '<w:tblStyle w:val="HouseTable"/>';
const header = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cell('Nume')}${cell('Observații')}</w:tr>`;
const loopRow = `<w:tr>${cell('{{#people}}{{name}}')}${cell('{{note}}{{/people}}')}</w:tr>`;
const people = (count: number, note = '-') =>
  Array.from({ length: count }, (_, index) => ({ name: `Persoana ${index + 1}`, note }));

const rowsOf = (file: Uint8Array) =>
  new PizZip(file)
    .file('word/document.xml')!
    .asText()
    .match(/<w:tr>[\s\S]*?<\/w:tr>/g) ?? [];
const keepsWithNext = (row: string) => row.includes('<w:keepNext/>');
const staysWhole = (row: string) => row.includes('<w:cantSplit/>');

describe('keeping the house tables together once merged', () => {
  it('keeps a table of up to six body rows whole, every row but the last with the next', () => {
    const rows = rowsOf(
      renderDocument(docx(table(house, header + loopRow)), { people: people(6) })
    );
    expect(rows.map(keepsWithNext)).toEqual([true, true, true, true, true, true, false]);
    expect(rows.every(staysWhole)).toBe(true);
  });

  it('keeps a longer table only from its header to its second body row', () => {
    const rows = rowsOf(
      renderDocument(docx(table(house, header + loopRow)), { people: people(10) })
    );
    expect(rows.map(keepsWithNext)).toEqual([true, true, ...Array(9).fill(false)]);
    expect(rows.every(staysWhole)).toBe(true);
  });

  // LibreOffice leaves content out of the PDF when a row that may not split is tied to rows
  // that do not fit on the page with it.
  it('lets a table with a row of a page split anywhere and ties nothing', () => {
    const merged = renderDocument(docx(table(house, header + loopRow)), {
      people: [...people(2), { name: 'Persoana 3', note: 'cuvânt '.repeat(150) }],
    });
    const rows = rowsOf(merged);
    expect(rows.some(keepsWithNext)).toBe(false);
    expect(rows.map(staysWhole)).toEqual([true, true, true, false]);
  });

  it('marks a cell the data left with a dash with one centred mark', () => {
    const rows = rowsOf(
      renderDocument(docx(table(house, header + loopRow)), { people: people(1, '--') })
    );
    expect(rows[1]).toContain(
      '<w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">—</w:t>'
    );
  });

  it('leaves the tables of other documents as they are', () => {
    const merged = renderDocument(docx(table('', header + loopRow)), { people: people(3) });
    const rows = rowsOf(merged);
    expect(rows.some((row) => keepsWithNext(row) || staysWhole(row))).toBe(false);
    expect(rows[1]).toContain('<w:t xml:space="preserve">-</w:t>');
  });
});
