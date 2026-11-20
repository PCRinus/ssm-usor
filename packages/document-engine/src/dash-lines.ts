// The measures of 9, 10 and 2.2's own risks come from the merge data as lines joined with line
// breaks, each opened by a dash: a wrapped line then starts under the dash instead of under the
// text. Once merged, each measure becomes a paragraph of its own that hangs from its dash, as the
// import sets a dash typed in a cell (`tools/import/typography.py`).

import { columnsOf, isHeader, topLevelTables } from './table-keep';

const houseTable = 'HouseTable';
const measuresColumn = /^Măsur[ai]\b/iu;
// 3 mm, in twips.
const cellHang = 170;
// A dash before a digit is a minus sign ("- 5 °C"), not an item's.
const dashLine = /^\s*[–-]\s+(?!\d)/u;

const rowPattern = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
const paragraphPattern = /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*<\/w:p>/g;
const runPattern = /<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*<\/w:r>/g;
const textOf = (xml: string) =>
  [...xml.matchAll(/<w:t\b[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1]).join('');

function hung(properties: string) {
  const indent = `<w:ind w:left="${cellHang}" w:hanging="${cellHang}"/>`;
  if (!properties) return `<w:pPr>${indent}</w:pPr>`;
  if (/<w:ind\b[^>]*\/>/.test(properties)) return properties.replace(/<w:ind\b[^>]*\/>/, indent);
  // Before what follows `w:ind` in the schema's order.
  const after =
    /<w:(contextualSpacing|mirrorIndents|suppressOverlap|jc|textDirection|textAlignment|textboxTightWrap|outlineLvl|divId|cnfStyle|rPr|sectPr|pPrChange)\b/.exec(
      properties
    );
  const at = after ? after.index : properties.length - '</w:pPr>'.length;
  return properties.slice(0, at) + indent + properties.slice(at);
}

// The dash may stand in a run of its own, the spaces after it in the next one.
function withHangingDash(paragraph: string) {
  let state: 'dash' | 'spaces' | 'done' = 'dash';
  return paragraph.replace(
    /(<w:t\b[^>]*>)([^<]*)(<\/w:t>)/g,
    (whole, open: string, text: string, close: string) => {
      if (state === 'done' || text === '') return whole;
      if (state === 'spaces') {
        state = 'done';
        return `${open}${text.replace(/^\s+/u, '')}${close}`;
      }
      const dash = /^\s*[–-](\s*)/u.exec(text)!;
      const rest = text.slice(dash[0].length);
      state = rest === '' ? 'spaces' : 'done';
      return `${open}–${close}<w:tab/><w:t xml:space="preserve">${rest}${close}`;
    }
  );
}

function hangMeasures(paragraph: string) {
  const opening = /^<w:p\b[^>]*>/.exec(paragraph)![0];
  const properties = /^<w:pPr>[\s\S]*?<\/w:pPr>/.exec(paragraph.slice(opening.length))?.[0] ?? '';
  const body = paragraph.slice(opening.length + properties.length, -'</w:p>'.length);
  const lines: string[] = [''];
  let at = 0;
  for (const run of body.matchAll(runPattern)) {
    lines[lines.length - 1] += body.slice(at, run.index);
    at = run.index + run[0].length;
    const runOpening = /^<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?/.exec(run[0])![0];
    const pieces = run[0].slice(runOpening.length, -'</w:r>'.length).split('<w:br/>');
    pieces.forEach((piece, index) => {
      if (index > 0) lines.push('');
      if (piece) lines[lines.length - 1] += `${runOpening}${piece}</w:r>`;
    });
  }
  lines[lines.length - 1] += body.slice(at);
  const measures: string[] = [];
  for (const line of lines) {
    if (textOf(line).trim() === '') continue;
    if (dashLine.test(textOf(line)) || measures.length === 0) measures.push(line);
    else measures[measures.length - 1] += `<w:r><w:br/></w:r>${line}`;
  }
  const itemProperties = hung(properties);
  return measures
    .map((line) => withHangingDash(`${opening}${itemProperties}${line}</w:p>`))
    .join('');
}

function measuresCell(cell: string) {
  return cell.replace(paragraphPattern, (paragraph) =>
    dashLine.test(textOf(paragraph)) ? hangMeasures(paragraph) : paragraph
  );
}

export function hangDashLines(xml: string): string {
  let result = xml;
  for (const [start, end] of topLevelTables(xml).reverse()) {
    const table = result.slice(start, end);
    if (!table.includes(`<w:tblStyle w:val="${houseTable}"/>`)) continue;
    const rows = table.match(rowPattern) ?? [];
    const columns = new Set(
      rows
        .filter(isHeader)
        .flatMap((row) => columnsOf(row))
        .filter(({ cell }) => measuresColumn.test(textOf(cell).trim()))
        .map(({ column }) => column)
    );
    if (columns.size === 0) continue;
    const changed = table.replace(rowPattern, (row) => {
      if (isHeader(row)) return row;
      let out = row;
      for (const { column, cell } of columnsOf(row).reverse()) {
        if (!columns.has(column)) continue;
        const at = out.lastIndexOf(cell);
        out = out.slice(0, at) + measuresCell(cell) + out.slice(at + cell.length);
      }
      return out;
    });
    result = result.slice(0, start) + changed + result.slice(end);
  }
  return result;
}
