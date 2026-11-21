import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { renderDocument } from './render';
import { isSignedList } from './table-keep';

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
const header = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cell('Nume')}${cell('Periodicitate')}</w:tr>`;
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

  it('edits a paragraph whose properties hold a revision of their own', () => {
    const revised =
      '<w:pPr><w:jc w:val="left"/><w:pPrChange w:id="1" w:author="A"><w:pPr><w:jc w:val="center"/></w:pPr></w:pPrChange></w:pPr>';
    const row = `<w:tr>${cell('{{#people}}{{name}}').replace('<w:p>', `<w:p>${revised}`)}${cell('{{note}}{{/people}}')}</w:tr>`;
    const xml = new PizZip(renderDocument(docx(table(house, header + row)), { people: people(2) }))
      .file('word/document.xml')!
      .asText();
    expect(xml.match(/<w:pPr>/g)?.length).toBe(xml.match(/<\/w:pPr>/g)?.length);
    expect(xml).toContain(
      '<w:pPrChange w:id="1" w:author="A"><w:pPr><w:jc w:val="center"/></w:pPr></w:pPrChange>'
    );
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

  it('centres a row of single lines and reads a row with more lines from the top, every cell alike', () => {
    const rows = rowsOf(
      renderDocument(docx(table(house, header + loopRow)), {
        people: [
          { name: 'Ana Pop', note: 'Anual' },
          { name: 'Ion Ionescu', note: 'cuvânt '.repeat(20) },
        ],
      })
    );
    const vertical = (row: string) =>
      [...row.matchAll(/<w:vAlign w:val="(\w+)"\/>/g)].map((match) => match[1]);
    expect(vertical(rows[1]!)).toEqual(['center', 'center']);
    expect(vertical(rows[2]!)).toEqual(['top', 'top']);
  });

  // The same cases as tools/import/test_table_style.py: the sweep and the merge must agree.
  it.each([
    ['Semnătura de primire', true],
    ['SEMNĂTURA', true],
    ['Sem\u00adnătura celui', true],
    ['Data și semnătura', false],
    ['Numele și prenumele', false],
  ] as const)('takes a header column „%s” for a signed list: %s', (label, signed) => {
    const headerRow = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cell(label)}</w:tr>`;
    expect(isSignedList([headerRow, `<w:tr>${cell('1.')}</w:tr>`], 1)).toBe(signed);
  });

  it('keeps a short table whole on a portrait page, where a landscape one could not', () => {
    const section = (width: number, height: number) =>
      `<w:p><w:pPr><w:sectPr><w:pgSz w:w="${width}" w:h="${height}"/></w:sectPr></w:pPr></w:p>`;
    const keeps = (page: string) =>
      rowsOf(
        renderDocument(docx(table(house, header + loopRow) + page), {
          people: people(3, 'cuvânt '.repeat(40)),
        })
      ).map(keepsWithNext);
    expect(keeps(section(11906, 16838))).toEqual([true, true, true, false]);
    expect(keeps(section(16838, 11906))).toEqual([true, true, false, false]);
  });

  describe('a list signed by hand', () => {
    const widths = [621, 3458, 2076, 1297, 1903];
    const signedCell = (width: number, text: string) =>
      `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`;
    const signedRow = (texts: string[], properties = '') =>
      `<w:tr>${properties}${texts.map((text, index) => signedCell(widths[index]!, text)).join('')}</w:tr>`;
    const tall = '<w:trPr><w:trHeight w:val="850" w:hRule="atLeast"/></w:trPr>';
    const signedList = `<w:tbl><w:tblPr>${house}</w:tblPr><w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${signedRow(
      ['Nr. crt.', 'Numele și prenumele', 'Funcția', 'Data primirii', 'Semnătura de primire'],
      '<w:trPr><w:tblHeader/></w:trPr>'
    )}${signedRow(['1.', '{{#people}}{{name}}', '{{jobTitle}}', '{{date}}{{/people}}', ''], tall)}${signedRow(['2.', '', '', '', ''], tall)}${signedRow(['3.', '', '', '', ''], tall)}</w:tbl>`;
    const vertical = (row: string) => [
      ...new Set([...row.matchAll(/<w:vAlign w:val="(\w+)"\/>/g)].map((match) => match[1])),
    ];

    it('centres every row while each cell holds one line', () => {
      const rows = rowsOf(
        renderDocument(docx(signedList), {
          people: [
            {
              name: 'Mureșanu Bogdan-Alexandru',
              jobTitle: 'Manager restaurant',
              date: '21.11.2026',
            },
            { name: 'Bălănescu Gheorghe', jobTitle: 'Bucătar-șef', date: '21.11.2026' },
          ],
        })
      );
      expect(rows.slice(1).map(vertical)).toEqual(Array(4).fill(['center']));
    });

    it('centres every row even when a cell wraps', () => {
      const rows = rowsOf(
        renderDocument(docx(signedList), {
          people: [
            { name: 'Bălănescu Gheorghe', jobTitle: 'Bucătar-șef', date: '21.11.2026' },
            {
              name: 'Mihai Popescu',
              jobTitle: 'Operator montaj linii automate',
              date: '21.11.2026',
            },
          ],
        })
      );
      expect(rows.slice(1).map(vertical)).toEqual(Array(4).fill(['center']));
    });
  });

  it('centres a column of short values and starts one of names or text at the left', () => {
    const rows = rowsOf(
      renderDocument(docx(table(house, header + loopRow)), {
        people: [
          { name: 'Ana Pop', note: 'Anual' },
          { name: 'Ion Ionescu', note: '20.11.2026' },
        ],
      })
    );
    const horizontal = (row: string) =>
      [...row.matchAll(/<w:jc w:val="(\w+)"\/>/g)].map((match) => match[1]);
    expect(horizontal(rows[1]!)).toEqual(['left', 'center']);
    expect(horizontal(rows[2]!)).toEqual(['left', 'center']);
  });

  it('keeps the mark when the dash stands in a paragraph after an empty one', () => {
    const dashed = `<w:tr><w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:rPr><w:sz w:val="16"/></w:rPr></w:pPr></w:p><w:p><w:r><w:t>-</w:t></w:r></w:p></w:tc>${cell('Anual')}</w:tr>`;
    const rows = rowsOf(renderDocument(docx(table(house, header + dashed)), {}));
    expect(rows[1]).toContain('<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>—</w:t></w:r>');
    const first = /<w:tc>[\s\S]*?<\/w:tc>/.exec(rows[1]!)![0];
    expect(first.match(/<w:p>/g)).toHaveLength(1);
  });

  it('keeps a row naming a group with the first row of the group', () => {
    const groupRow = `<w:tr><w:tc><w:tcPr><w:tcW w:w="6000" w:type="dxa"/><w:gridSpan w:val="2"/><w:shd w:val="clear" w:color="auto" w:fill="F1F4EF"/></w:tcPr><w:p><w:r><w:t>{{#groups}}{{title}}</w:t></w:r></w:p></w:tc></w:tr>`;
    const itemRow = `<w:tr>${cell('{{#people}}{{name}}')}${cell('{{note}}{{/people}}{{/groups}}')}</w:tr>`;
    const rows = rowsOf(
      renderDocument(docx(table(house, header + groupRow + itemRow)), {
        groups: ['Bucătar', 'Ospătar', 'Sudor'].map((title) => ({ title, people: people(3) })),
      })
    );
    expect(rows).toHaveLength(13);
    expect(rows.map(keepsWithNext)).toEqual([
      ...[true, true, false, false, false],
      ...[true, false, false, false],
      ...[true, false, false, false],
    ]);
  });

  it('keeps a group named in bold with its first row beside a row that may split', () => {
    const boldGroup = `<w:tr><w:tc><w:tcPr><w:tcW w:w="6000" w:type="dxa"/><w:gridSpan w:val="2"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Fizice - termice</w:t></w:r></w:p></w:tc></w:tr>`;
    const rows = rowsOf(
      renderDocument(docx(table(house, header + boldGroup + loopRow)), {
        people: [{ name: 'Arsuri', note: 'Lucrări '.repeat(150) }, ...people(2)],
      })
    );
    expect(rows.map(keepsWithNext)).toEqual([false, true, false, false, false]);
    expect(rows.map(staysWhole)).toEqual([true, true, false, true, true]);
  });

  it("joins a marked cell the data left empty to the group's cell above, which reads from the top", () => {
    const marked = (text: string) =>
      `<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`;
    const row = `<w:tr>${marked('{{#rows}}{{group}}')}${cell('{{name}}{{/rows}}')}</w:tr>`;
    const rows = rowsOf(
      renderDocument(docx(table(house, header + row)), {
        rows: [
          { group: 'Mecanic', name: 'F1' },
          { group: '', name: 'F2' },
          { group: 'Electric', name: 'F3' },
          { group: '', name: 'F4' },
          { group: '', name: 'F5' },
        ],
      })
    );
    const merge = (each: string) => /<w:vMerge(?: w:val="(\w+)")?\/>/.exec(each)?.[1] ?? 'continue';
    expect(rows.slice(1).map(merge)).toEqual([
      'restart',
      'continue',
      'restart',
      'continue',
      'continue',
    ]);
    const vertical = (each: string) =>
      [...each.matchAll(/<w:vAlign w:val="(\w+)"\/>/g)].map((match) => match[1]);
    expect(vertical(rows[1]!)).toEqual(['top', 'top']);
    expect(vertical(rows[2]!)).toEqual(['center', 'center']);
  });

  it('lays a merged group out the same when the merge pass runs again', async () => {
    const { keepTablesTogether } = await import('./table-keep');
    const marked = (text: string) =>
      `<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:tc>`;
    const row = `<w:tr>${marked('{{#rows}}{{group}}')}${cell('{{name}}{{/rows}}')}</w:tr>`;
    const once = new PizZip(
      renderDocument(docx(table(house, header + row)), {
        rows: [
          { group: 'Mecanic', name: 'F1' },
          { group: '', name: 'F2' },
        ],
      })
    )
      .file('word/document.xml')!
      .asText();
    expect(keepTablesTogether(once)).toBe(once);
  });

  it('leaves an empty cell of a table without the mark as it is', () => {
    const rows = rowsOf(
      renderDocument(docx(table(house, header + loopRow)), {
        people: [
          { name: 'Ana Pop', note: 'Anual' },
          { name: '', note: 'Anual' },
        ],
      })
    );
    expect(rows.some((row) => row.includes('<w:vMerge'))).toBe(false);
  });

  it('leaves the tables of other documents as they are', () => {
    const merged = renderDocument(docx(table('', header + loopRow)), { people: people(3) });
    const rows = rowsOf(merged);
    expect(rows.some((row) => keepsWithNext(row) || staysWhole(row))).toBe(false);
    expect(rows[1]).toContain('<w:t xml:space="preserve">-</w:t>');
  });
});
