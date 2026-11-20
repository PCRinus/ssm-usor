// A cell of the occupational safety set that lists several items, one per line, each opened by
// a dash (9's and 10's measures), comes from the merge data as lines joined with line breaks: a
// wrapped line then starts under the dash instead of under the text. Once merged, each line
// becomes a paragraph of its own that hangs from its dash, as the import sets a dash typed in a
// cell (`tools/import/typography.py`). Only the tables drawn in the house style are touched.

import { topLevelTables } from './table-keep';

const houseTable = 'HouseTable';
// 3 mm, in twips.
const cellHang = 170;
const dashLine = /^\s*[–-]\s/;

const cellPattern = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g;
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

function withHangingDash(paragraph: string) {
  let done = false;
  return paragraph.replace(
    /(<w:t\b[^>]*>)([^<]*)(<\/w:t>)/g,
    (whole, open: string, text: string, close: string) => {
      if (done || text === '') return whole;
      done = true;
      const dash = /^\s*[–-]\s+/.exec(text);
      if (!dash) return whole;
      return `${open}–${close}<w:tab/><w:t xml:space="preserve">${text.slice(dash[0].length)}${close}`;
    }
  );
}

function split(paragraph: string) {
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
  const itemProperties = hung(properties);
  return lines
    .filter((line) => textOf(line).trim() !== '')
    .map((line) => withHangingDash(`${opening}${itemProperties}${line}</w:p>`))
    .join('');
}

function splitParagraph(paragraph: string) {
  if (!paragraph.includes('<w:br/>')) {
    if (!dashLine.test(textOf(paragraph))) return paragraph;
    const opening = /^<w:p\b[^>]*>/.exec(paragraph)![0];
    const properties = /^<w:pPr>[\s\S]*?<\/w:pPr>/.exec(paragraph.slice(opening.length))?.[0] ?? '';
    return withHangingDash(
      opening + hung(properties) + paragraph.slice(opening.length + properties.length)
    );
  }
  const lines = paragraph
    .split('<w:br/>')
    .map((piece) => textOf(piece).trim())
    .filter(Boolean);
  if (lines.length < 2 || !lines.every((line) => dashLine.test(line))) return paragraph;
  return split(paragraph);
}

export function hangDashLines(xml: string): string {
  let result = xml;
  for (const [start, end] of topLevelTables(xml).reverse()) {
    const table = result.slice(start, end);
    if (!table.includes(`<w:tblStyle w:val="${houseTable}"/>`)) continue;
    const changed = table.replace(cellPattern, (cell) =>
      cell.replace(paragraphPattern, splitParagraph)
    );
    result = result.slice(0, start) + changed + result.slice(end);
  }
  return result;
}
