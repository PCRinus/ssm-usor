import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { signingTypeKeys } from '../signing';
import { keepTablesTogether } from '../table-keep';
import { documentTextOf, entries, fireFiles, read } from './read';

// tools/import/table_style.py says why.
const houseTable = '<w:tblStyle w:val="HouseTable"/>';
const houseLines =
  '<w:tblBorders><w:top w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="8" w:space="0" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tblBorders>';
const headerRule =
  '<w:tcBorders><w:bottom w:val="single" w:sz="8" w:space="0" w:color="000000"/></w:tcBorders>';
const padding = (side: number) =>
  `<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="${side}" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="${side}" w:type="dxa"/></w:tblCellMar>`;

const ssmFiles = entries
  .filter((entry) => entry.set === 'ssm' && entry.typeKey !== signingTypeKeys.agreement)
  .map((entry) => entry.path);
const bodyOf = (name: string) => new PizZip(read(name)).file('word/document.xml')!.asText();

function topLevelTables(xml: string) {
  const tables: string[] = [];
  let depth = 0;
  let start = 0;
  for (const match of xml.matchAll(/<(\/?)w:tbl>/g)) {
    if (!match[1]) {
      if (depth === 0) start = match.index;
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0) tables.push(xml.slice(start, match.index + match[0].length));
    }
  }
  return tables;
}
const rowsOf = (table: string) => table.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g) ?? [];
const cellsOf = (row: string) => row.match(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g) ?? [];
const paragraphsOf = (xml: string) => xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) ?? [];
const isHeader = (row: string) => /<w:trPr>[^]*?<w:tblHeader\/>[^]*?<\/w:trPr>/.test(row);
const runsOf = (xml: string) =>
  (xml.match(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g) ?? []).filter((run) => documentTextOf(run).trim());

const tablesOf = (name: string) => topLevelTables(bodyOf(name));
const houseTables = ssmFiles.flatMap((name) =>
  tablesOf(name)
    .filter((table) => table.includes(houseTable))
    .map((table): [string, string, string] => [
      name,
      documentTextOf(rowsOf(table)[0]!).slice(0, 40),
      table,
    ])
);

describe('the table house style of the occupational safety set', () => {
  // A table of lines on every side of a cell, not drawn in the house style, is one the style
  // leaves alone on purpose: the scales of 9's method.
  it.each(ssmFiles)('%s draws every ruled table in the house style but the named ones', (name) => {
    const left = tablesOf(name).filter(
      (table) =>
        !table.includes(houseTable) &&
        cellsOf(table).some(
          (cell) =>
            ['top', 'left', 'bottom', 'right'].every((side) =>
              new RegExp(`<w:tcBorders>[^]*?<w:${side} w:val="single"[^]*?</w:tcBorders>`).test(
                cell
              )
            ) && !cell.includes('<w:tcBorders></w:tcBorders>')
        )
    );
    const scales = left.filter((table) => /w:sz="12"/.test(table));
    expect(left.length - scales.length).toBe(0);
    expect(scales.length).toBe(name === '9_risk_assessment.docx' ? 3 : 0);
  });

  it.each(houseTables)(
    '%s, %s: black lines, 1 pt frame and header rule, 0.5 pt inside',
    (...[, , table]) => {
      expect(table).toContain(houseLines);
      const ruled = cellsOf(table).filter((cell) => cell.includes('<w:tcBorders>'));
      for (const cell of ruled) expect(cell).toContain(headerRule);
      const header = rowsOf(table).filter(isHeader);
      if (header.length) {
        expect(ruled.length).toBe(cellsOf(header.at(-1)!).length);
      } else {
        expect(ruled).toEqual([]);
      }
    }
  );

  it.each(houseTables)('%s, %s: pads every cell alike', (...[, , table]) => {
    expect(table).toContain(padding(85));
    for (const cell of cellsOf(table).filter((each) => each.includes('<w:tcMar>'))) {
      expect(cell).toContain('<w:textDirection');
    }
  });

  it.each(houseTables)(
    '%s, %s: a bold, centred, filled header repeated on every page',
    (...[, , table]) => {
      const rows = rowsOf(table);
      const header = rows.filter(isHeader);
      expect(rows.slice(0, header.length)).toEqual(header);
      for (const cell of header.flatMap(cellsOf)) {
        expect(cell).toContain('<w:shd w:val="clear" w:color="auto" w:fill="E3E8E0"/>');
        expect(cell).toContain('<w:vAlign w:val="center"/>');
        for (const paragraph of paragraphsOf(cell))
          expect(paragraph).toContain('<w:jc w:val="center"/>');
        for (const run of runsOf(cell)) expect(run).toMatch(/<w:b\/>/);
      }
    }
  );

  it.each(houseTables)(
    '%s, %s: a body row reads all centred or all from the top',
    (...[, , table]) => {
      for (const row of rowsOf(table).filter((each) => !isHeader(each))) {
        const alignments = cellsOf(row).map((cell) => /<w:vAlign w:val="(\w+)"\/>/.exec(cell)?.[1]);
        expect(new Set(alignments).size, documentTextOf(row).slice(0, 60)).toBe(1);
        expect(['center', 'top']).toContain(alignments[0]);
      }
    }
  );

  it.each(houseTables)('%s, %s: one centred mark for an empty cell', (...[, , table]) => {
    for (const cell of rowsOf(table)
      .filter((row) => !isHeader(row))
      .flatMap(cellsOf)) {
      const text = documentTextOf(cell).trim();
      expect(['-', '--', '–', '---']).not.toContain(text);
      if (text === '—') expect(cell).toContain('<w:jc w:val="center"/>');
    }
  });

  it.each(ssmFiles)('%s keeps its tables together as the merge does', (name) => {
    const body = bodyOf(name);
    expect(keepTablesTogether(body) === body).toBe(true);
  });

  it('prints nothing smaller than 10 pt in a table of up to six columns, but in the sheets', () => {
    const sheets = ['fisa_instruire_ssm.docx', 'fisa_test.docx'];
    const small = houseTables
      .filter(
        ([name, , table]) =>
          !sheets.includes(name) && (table.match(/<w:gridCol\b/g) ?? []).length <= 6
      )
      .flatMap(([name, first, table]) =>
        [...table.matchAll(/<w:sz w:val="(\d+)"\/>/g)]
          .filter((size) => Number(size[1]) < 20)
          .map(() => `${name}: ${first}`)
      );
    expect([...new Set(small)]).toEqual([]);
  });

  it('centres every row of a list signed by hand', () => {
    const signed = houseTables.filter(([, , table]) =>
      rowsOf(table)
        .filter(isHeader)
        .some((row) => cellsOf(row).some((cell) => /^Semnătur/i.test(documentTextOf(cell).trim())))
    );
    expect(signed.map(([name]) => name)).toEqual(
      expect.arrayContaining(['1.1_decision_training.docx', '9_risk_assessment.docx'])
    );
    for (const [, , table] of signed) {
      for (const row of rowsOf(table).filter((each) => !isHeader(each))) {
        expect(new Set(row.match(/<w:vAlign w:val="\w+"\/>/g))).toEqual(
          new Set(['<w:vAlign w:val="center"/>'])
        );
      }
    }
  });

  it("keeps each of 6's risk groups with its first row", () => {
    const groups = houseTables
      .filter(
        ([name, first]) =>
          name === '6_protective_equipment_list.docx' && first.startsWith('Riscuri')
      )
      .flatMap(([, , table]) => rowsOf(table).filter((row) => cellsOf(row).length === 1));
    expect(groups.length).toBe(11);
    for (const row of groups) {
      expect(row).toContain('<w:cantSplit/>');
      expect(row).toContain('<w:keepNext/>');
    }
  });

  it('marks a consequence in 9 with an X and nothing elsewhere, the places in equal columns', () => {
    const [, , matrix] = houseTables.find(([, first]) => first.startsWith('Nr.crt.CONSECINȚE'))!;
    const marks = rowsOf(matrix)
      .filter((row) => !isHeader(row))
      .flatMap((row) => cellsOf(row).slice(2))
      .map((cell) => documentTextOf(cell).trim());
    expect(new Set(marks)).toEqual(new Set(['', 'X']));
    const grid = [...matrix.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((match) => match[1]);
    expect(new Set(grid.slice(2))).toEqual(new Set(['520']));
  });

  it("prints the text of 9's grids in the colour that reads on their grey", () => {
    const scales = tablesOf('9_risk_assessment.docx').filter((table) => /w:sz="12"/.test(table));
    const shaded = scales
      .flatMap(cellsOf)
      .filter((cell) => /<w:shd w:color="auto" w:fill="auto" w:val="(pct\d+|solid)"/.test(cell));
    expect(shaded.length).toBeGreaterThan(0);
    for (const cell of shaded) {
      const share = /w:val="pct(\d+)"/.exec(cell)?.[1];
      const colour = share !== undefined && Number(share) < 60 ? '000000' : 'FFFFFF';
      for (const run of runsOf(cell)) expect(run).toContain(`<w:color w:val="${colour}"/>`);
    }
  });

  it('lets the merge fit the columns of the prevention plan, and of no other table', () => {
    const marked = ssmFiles.flatMap((name) =>
      tablesOf(name)
        .filter((table) => table.includes('<w:tblCaption w:val="ContentWidths"/>'))
        .map((table) => [name, table.includes('{{#plan}}')])
    );
    expect(marked).toEqual([['10_prevention_plan.docx', true]]);
  });

  it.each(ssmFiles)(
    '%s draws the tables of a landscape page across its wider text column',
    (name) => {
      const zip = new PizZip(read(name));
      const body = bodyOf(name);
      const targets = new Map(
        [
          ...zip
            .file('word/_rels/document.xml.rels')!
            .asText()
            .matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g),
        ].map((match) => [match[1]!, match[2]!])
      );
      let start = 0;
      for (const match of body.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)) {
        const section = match[0];
        const content = body.slice(start, match.index);
        start = match.index + section.length;
        if (!section.includes('w:orient="landscape"')) continue;
        const headers = [...section.matchAll(/<w:headerReference\b[^>]*r:id="([^"]+)"/g)].map(
          (reference) => zip.file(`word/${targets.get(reference[1]!)}`)!.asText()
        );
        const across = [content, ...headers]
          .flatMap(topLevelTables)
          .filter((table) => table.includes('<w:tblW w:w="5000" w:type="pct"/>'));
        expect(across.length).toBeGreaterThan(0);
        for (const table of across) {
          const grid = [...table.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((each) =>
            Number(each[1])
          );
          expect(grid.reduce((sum, each) => sum + each, 0)).toBe(16838 - 1134 - 1134);
        }
      }
    }
  );

  it.each([...fireFiles, 'act_aditional_semnare_electronica.docx'])(
    '%s keeps its tables as they were, until its set is reviewed',
    (name) => {
      expect(bodyOf(name)).not.toContain(houseTable);
    }
  );
});
