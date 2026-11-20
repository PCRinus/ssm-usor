// How the tables of the occupational safety set stay together on a page, laid over again once
// the loops have repeated their rows: the import sets the same rule on the template, where a
// loop is still one row (`tools/import/table_style.py`, which holds its reasons). Only the
// tables it drew in the house style, which name the table style `HouseTable`, are touched.

const houseTable = 'HouseTable';
const wholeRows = 6;
const tallRowText = 700;
// In twips.
const tallRowRoom = 300 * 20;
const keepRoom = 400 * 20;
const padding = { vertical: 80, horizontal: 170 };
const characterWidth = 0.55;
const lineHeight = 1.15;
const emptyMark = '—';
const dashes = new Set(['-', '--', '–', '—', '---']);

const rowPattern = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
const cellPattern = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g;
const paragraphPattern = /<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
const textPattern = /(<w:t\b[^>]*>)([^<]*)(<\/w:t>)/g;

const textOf = (xml: string) => [...xml.matchAll(textPattern)].map((match) => match[2]).join('');
const lengthOf = (text: string) => text.replace(/&\w+;/g, '_').length;

function topLevelTables(xml: string) {
  const spans: [number, number][] = [];
  let depth = 0;
  let start = 0;
  for (const match of xml.matchAll(/<(\/?)w:tbl>/g)) {
    if (!match[1]) {
      if (depth === 0) start = match.index;
      depth += 1;
    } else {
      depth -= 1;
      if (depth === 0) spans.push([start, match.index + match[0].length]);
    }
  }
  return spans;
}

const cellProperties = (cell: string) =>
  /^<w:tc\b[^>]*>\s*<w:tcPr>([\s\S]*?)<\/w:tcPr>/.exec(cell)?.[1] ?? '';
const rowProperties = (row: string) =>
  /^<w:tr\b[^>]*>(?:<w:tblPrEx>[\s\S]*?<\/w:tblPrEx>)?\s*<w:trPr>([\s\S]*?)<\/w:trPr>/.exec(
    row
  )?.[1] ?? '';
const spanOf = (cell: string) =>
  Number(/<w:gridSpan w:val="(\d+)"/.exec(cellProperties(cell))?.[1] ?? 1);
const continuesMerge = (cell: string) => {
  const merge = /<w:vMerge(?: w:val="(\w+)")?\/>/.exec(cellProperties(cell));
  return merge !== null && merge[1] !== 'restart';
};
const isHeader = (row: string) =>
  /<w:tblHeader(?: w:val="(?:true|1|on)")?\/>/.test(rowProperties(row));
const sizeOf = (xml: string) => {
  const size = /<w:sz w:val="(\d+)"\/>/.exec(xml);
  return size ? Number(size[1]) : null;
};

function columnsOf(row: string) {
  let column = 0;
  return [...row.matchAll(cellPattern)].map((match) => {
    const placed = { column, cell: match[0] };
    column += spanOf(match[0]);
    return placed;
  });
}

function leastHeight(row: string) {
  const height = /<w:trHeight w:val="(\d+)"(?: w:hRule="(\w+)")?\/>/.exec(rowProperties(row));
  return height && height[2] !== 'auto' ? Number(height[1]) : 0;
}

/** A row's height in twips, guessed from its text: enough to tell a row that may take a page. */
function estimatedHeight(row: string, grid: number[]) {
  let tallest = 0;
  for (const { column, cell } of columnsOf(row)) {
    if (continuesMerge(cell)) continue;
    const width = Math.max(
      grid.slice(column, column + spanOf(cell)).reduce((sum, each) => sum + each, 0) -
        padding.horizontal,
      200
    );
    const rotated = cellProperties(cell).includes('<w:textDirection');
    let height = padding.vertical;
    for (const [paragraph] of cell.matchAll(paragraphPattern)) {
      const size = (sizeOf(paragraph) ?? 20) / 2;
      const characters = lengthOf(textOf(paragraph));
      const lines = rotated
        ? 1
        : Math.max(1, Math.ceil((characters * characterWidth * size * 20) / width));
      height += lines * lineHeight * size * 20;
    }
    tallest = Math.max(tallest, height);
  }
  return Math.max(tallest, leastHeight(row));
}

function keepTogether(rows: string[], header: number, grid: number[]) {
  const heights = rows.map((row) => estimatedHeight(row, grid));
  const tall = rows.map(
    (row, index) => lengthOf(textOf(row)) > tallRowText || heights[index]! > tallRowRoom
  );
  if (tall.some(Boolean)) {
    return { cantSplit: tall.map((each) => !each), keeps: rows.map(() => false) };
  }
  const total = (count: number) => heights.slice(0, count).reduce((sum, each) => sum + each, 0);
  let chain: number;
  if (rows.length - header <= wholeRows && total(rows.length) <= keepRoom) {
    chain = rows.length - 1;
  } else {
    // A row keeps with the next one: the header and the first body row tie the second to them.
    chain = Math.min(header + 1, rows.length - 1);
    while (chain > 0 && total(chain + 1) > keepRoom) chain -= 1;
  }
  return { cantSplit: rows.map(() => true), keeps: rows.map((_, index) => index < chain) };
}

function editProperties(xml: string, tag: string, change: (inner: string) => string) {
  let element = xml;
  if (element.endsWith('/>') && element.split('<').length === 2) {
    const name = /^<(w:\w+)/.exec(element)![1];
    element = `${element.slice(0, -2)}></${name}>`;
  }
  const opening = /^<w:\w+\b[^>]*>(?:<w:tblPrEx>[\s\S]*?<\/w:tblPrEx>)?/.exec(element)![0].length;
  const rest = element.slice(opening);
  const found = new RegExp(`^<w:${tag}>([\\s\\S]*?)</w:${tag}>|^<w:${tag}/>`).exec(rest);
  const changed = change(found?.[1] ?? '');
  const after = opening + (found ? found[0].length : 0);
  return (
    element.slice(0, opening) +
    (changed ? `<w:${tag}>${changed}</w:${tag}>` : '') +
    element.slice(after)
  );
}

const keepNextPattern = /<w:keepNext\b[^>]*\/>/g;

function keptWithNext(paragraph: string, keep: boolean) {
  return editProperties(paragraph, 'pPr', (inner) => {
    const without = inner.replace(keepNextPattern, '');
    if (!keep) return without;
    const style = /^<w:pStyle\b[^>]*\/>/.exec(without)?.[0] ?? '';
    return `${style}<w:keepNext/>${without.slice(style.length)}`;
  });
}

const afterCantSplit = /<w:(?:trHeight|tblHeader|tblCellSpacing|jc|hidden|ins|del|trPrChange)\b/;

function withCantSplit(row: string, cantSplit: boolean) {
  return editProperties(row, 'trPr', (inner) => {
    const without = inner.replace(/<w:cantSplit\b[^>]*\/>/g, '');
    if (!cantSplit) return without;
    const at = afterCantSplit.exec(without)?.index ?? without.length;
    return `${without.slice(0, at)}<w:cantSplit/>${without.slice(at)}`;
  });
}

// The schema's order: what follows the alignment in a paragraph's properties.
const afterAlignment =
  /<w:(?:textDirection|textAlignment|textboxTightWrap|outlineLvl|divId|cnfStyle|rPr|sectPr|pPrChange)\b/;

function centred(paragraph: string) {
  return editProperties(paragraph, 'pPr', (inner) => {
    const without = inner.replace(/<w:jc\b[^>]*\/>/g, '');
    const at = afterAlignment.exec(without)?.index ?? without.length;
    return `${without.slice(0, at)}<w:jc w:val="center"/>${without.slice(at)}`;
  });
}

function withEmptyMark(cell: string) {
  if (continuesMerge(cell) || !dashes.has(textOf(cell).trim())) return cell;
  let first = true;
  return cell.replace(paragraphPattern, (paragraph) => {
    if (!first) return '';
    first = false;
    let marked = false;
    return centred(
      paragraph.replace(textPattern, (_, open: string, __, close: string) => {
        const text = marked ? '' : emptyMark;
        marked = true;
        return `${open}${text}${close}`;
      })
    );
  });
}

function laidOut(table: string) {
  const rows = [...table.matchAll(rowPattern)].map((match) => match[0]);
  let header = 0;
  while (header < rows.length && isHeader(rows[header]!)) header += 1;
  const grid = [...table.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((match) => Number(match[1]));
  const marked = rows.map((row, index) =>
    index < header ? row : row.replace(cellPattern, (cell) => withEmptyMark(cell))
  );
  const { cantSplit, keeps } = keepTogether(marked, header, grid);
  let index = 0;
  return table.replace(rowPattern, () => {
    const row = withCantSplit(marked[index]!, cantSplit[index]!);
    const keep = keeps[index]!;
    index += 1;
    return row.replace(paragraphPattern, (paragraph) => keptWithNext(paragraph, keep));
  });
}

export function keepTablesTogether(document: string): string {
  if (!document.includes(`<w:tblStyle w:val="${houseTable}"/>`)) return document;
  let laid = document;
  for (const [start, end] of topLevelTables(document).reverse()) {
    const table = laid.slice(start, end);
    if (
      !table.includes(`<w:tblStyle w:val="${houseTable}"/>`) ||
      table.slice(7).includes('<w:tbl>')
    )
      continue;
    laid = laid.slice(0, start) + laidOut(table) + laid.slice(end);
  }
  return laid;
}
