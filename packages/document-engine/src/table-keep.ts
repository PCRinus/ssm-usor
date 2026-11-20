// How the tables of the occupational safety set stay together on a page, laid over again once
// the loops have repeated their rows: the import sets the same rule on the template, where a
// loop is still one row (`tools/import/table_style.py`, which holds its reasons). Only the
// tables it drew in the house style, which name the table style `HouseTable`, are touched.

const houseTable = 'HouseTable';
const wholeRows = 6;
const tallRowText = 700;
// In twips.
const tallRowRoom = 280 * 20;
const keepRoom = 340 * 20;
const padding = { vertical: 80, horizontal: 170 };
const characterWidth = 0.55;
const lineHeight = 1.15;
const emptyMark = '—';
// A column of these holds short values whatever they are; one of these, names and text.
const valueColumn =
  /^(nr\.?\s*(crt|întreb)|data\b|durata|nivel\b|nivelul|clas[ae]\b|cantitate|număr|nr\. bucăți|cod risc|termen|lunile|punctaj|răspunsul)/i;
const textColumn = /^(nume|numele|denumire|persoan|semnătur|observa|cine)/i;
const shortWords = 3;
const shortText = 24;
const dashes = new Set(['-', '--', '–', '—', '---']);

const rowPattern = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
const cellPattern = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g;
const paragraphPattern = /<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
const textPattern = /(<w:t\b[^>]*>)([^<]*)(<\/w:t>)/g;

const textOf = (xml: string) => [...xml.matchAll(textPattern)].map((match) => match[2]).join('');
const lengthOf = (text: string) => text.replace(/&\w+;/g, '_').length;

export function topLevelTables(xml: string) {
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
export const spanOf = (cell: string) =>
  Number(/<w:gridSpan w:val="(\d+)"/.exec(cellProperties(cell))?.[1] ?? 1);
const continuesMerge = (cell: string) => {
  const merge = /<w:vMerge(?: w:val="(\w+)")?\/>/.exec(cellProperties(cell));
  return merge !== null && merge[1] !== 'restart';
};
export const isHeader = (row: string) =>
  /<w:tblHeader(?: w:val="(?:true|1|on)")?\/>/.test(rowProperties(row));
const runPattern = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;

/** In half-points: the first run's with text, else the paragraph mark's, as the import guesses. */
export function paragraphSize(paragraph: string) {
  const run = [...paragraph.matchAll(runPattern)].find(([each]) => textOf(each).trim());
  const runProperties = run && /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(run[0])?.[0];
  const mark = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(paragraph)?.[0];
  return (runProperties && sizeOf(runProperties)) || (mark && sizeOf(mark)) || 20;
}

const sizeOf = (xml: string) => {
  const size = /<w:sz w:val="(\d+)"\/>/.exec(xml);
  return size ? Number(size[1]) : null;
};

export function columnsOf(row: string) {
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
      const size = paragraphSize(paragraph) / 2;
      const lines = rotated
        ? 1
        : paragraph
            .split(/<w:(?:br|cr)\b[^>]*\/>/)
            .reduce(
              (sum, piece) =>
                sum +
                Math.max(
                  1,
                  Math.ceil((lengthOf(textOf(piece)) * characterWidth * size * 20) / width)
                ),
              0
            );
      height += lines * lineHeight * size * 20;
    }
    tallest = Math.max(tallest, height);
  }
  return Math.max(tallest, leastHeight(row));
}

// The fill of a row of one cell across the table that names the group of rows under it: 6's
// post names.
const groupFill = 'F1F4EF';
const isGroupRow = (row: string, grid: number[]) => {
  const cells = columnsOf(row);
  return (
    cells.length === 1 &&
    spanOf(cells[0]!.cell) === grid.length &&
    cellProperties(cells[0]!.cell).includes(`w:fill="${groupFill}"`)
  );
};

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
  return {
    cantSplit: rows.map(() => true),
    keeps: rows.map(
      (row, index) =>
        index < chain || (index >= header && index < rows.length - 1 && isGroupRow(row, grid))
    ),
  };
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

function aligned(paragraph: string, value: 'center' | 'left') {
  return editProperties(paragraph, 'pPr', (inner) => {
    const without = inner.replace(/<w:jc\b[^>]*\/>/g, '');
    const at = afterAlignment.exec(without)?.index ?? without.length;
    return `${without.slice(0, at)}<w:jc w:val="${value}"/>${without.slice(at)}`;
  });
}

const centred = (paragraph: string) => aligned(paragraph, 'center');

function cellWidth(cell: string, column: number, grid: number[]) {
  return Math.max(
    grid.slice(column, column + spanOf(cell)).reduce((sum, each) => sum + each, 0) -
      padding.horizontal,
    200
  );
}

function paragraphLines(paragraph: string, width: number) {
  const size = paragraphSize(paragraph) / 2;
  return paragraph
    .split(/<w:(?:br|cr)\b[^>]*\/>/)
    .reduce(
      (sum, piece) =>
        sum +
        Math.max(1, Math.ceil((lengthOf(textOf(piece)) * characterWidth * size * 20) / width)),
      0
    );
}

/** The lines of text a cell holds, an empty paragraph none. */
function cellLines(cell: string, column: number, grid: number[]) {
  if (cellProperties(cell).includes('<w:textDirection')) return 1;
  const width = cellWidth(cell, column, grid);
  return [...cell.matchAll(paragraphPattern)]
    .filter(([paragraph]) => textOf(paragraph).trim())
    .reduce((sum, [paragraph]) => sum + paragraphLines(paragraph, width), 0);
}

const isShort = (text: string) =>
  text === emptyMark ||
  /^\d/.test(text) ||
  /^[IVXL]+\.$/.test(text) ||
  (text.split(/\s+/).length <= shortWords && text.length <= shortText);

/** Per grid column, centred for short values and left for names and text; none where unknown. */
function columnAlignments(rows: string[], header: number) {
  const labels = new Map<number, string[]>();
  for (const row of rows.slice(0, header)) {
    for (const { column, cell } of columnsOf(row)) {
      const label = textOf(cell)
        .replace(/\u00ad/g, '')
        .trim();
      if (!label) continue;
      for (let covered = column; covered < column + spanOf(cell); covered += 1)
        labels.set(covered, [...(labels.get(covered) ?? []), label]);
    }
  }
  const values = new Map<number, string[] | null>();
  for (const row of rows.slice(header)) {
    for (const { column, cell } of columnsOf(row)) {
      if (spanOf(cell) > 1 || continuesMerge(cell) || values.get(column) === null) continue;
      const text = textOf(cell).trim();
      const said = [...cell.matchAll(paragraphPattern)].filter(([each]) => textOf(each).trim());
      values.set(
        column,
        text.includes('{{')
          ? null
          : [...(values.get(column) ?? []), said.length > 1 ? `${text}\n` : text]
      );
    }
  }
  const alignments = new Map<number, 'center' | 'left'>();
  for (const [column, said] of values) {
    const named = labels.get(column) ?? [];
    if (named.some((label) => valueColumn.test(label))) alignments.set(column, 'center');
    else if (named.some((label) => textColumn.test(label))) alignments.set(column, 'left');
    else if (said) {
      const filled = said.filter((text) => text && text !== emptyMark);
      if (filled.length)
        alignments.set(
          column,
          filled.every((text) => !text.endsWith('\n') && isShort(text)) ? 'center' : 'left'
        );
    }
  }
  return alignments;
}

function withVerticalAlignment(cell: string, value: 'center' | 'top') {
  return editProperties(cell, 'tcPr', (inner) => {
    const without = inner.replace(/<w:vAlign\b[^>]*\/>/g, '');
    const at = /<w:hideMark\b/.exec(without)?.index ?? without.length;
    return `${without.slice(0, at)}<w:vAlign w:val="${value}"/>${without.slice(at)}`;
  });
}

/**
 * A row of single lines reads centred; a row with more lines anywhere, or with a cell merged
 * down over the next row, reads from the top, so a group's name stands beside its first row.
 */
function alignedRow(
  row: string,
  grid: number[],
  alignments: Map<number, 'center' | 'left'>,
  mergedOn: ReadonlySet<number>
) {
  const placed = columnsOf(row);
  const single =
    mergedOn.size === 0 &&
    placed.every(({ column, cell }) => continuesMerge(cell) || cellLines(cell, column, grid) <= 1);
  let index = 0;
  return row.replace(cellPattern, (cell) => {
    const { column } = placed[index]!;
    index += 1;
    let laid = withVerticalAlignment(cell, single ? 'center' : 'top');
    const alignment = alignments.get(column);
    if (alignment && spanOf(cell) === 1 && !continuesMerge(cell)) {
      laid = laid.replace(paragraphPattern, (paragraph) =>
        aligned(paragraph, textOf(paragraph).trim() === emptyMark ? 'center' : alignment)
      );
    }
    return laid;
  });
}

function withEmptyMark(cell: string) {
  if (continuesMerge(cell) || !dashes.has(textOf(cell).trim())) return cell;
  let first = true;
  return cell.replace(paragraphPattern, (paragraph) => {
    if (!first) return '';
    first = false;
    let marked = false;
    let laid = paragraph.replace(textPattern, (_, open: string, __, close: string) => {
      const text = marked ? '' : emptyMark;
      marked = true;
      return `${open}${text}${close}`;
    });
    if (!marked) {
      const mark =
        /<w:pPr>[\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)[\s\S]*?<\/w:pPr>/.exec(laid)?.[1] ?? '';
      const run = `<w:r>${mark}<w:t>${emptyMark}</w:t></w:r>`;
      laid = laid.endsWith('/>')
        ? `${laid.slice(0, -2)}>${run}</w:p>`
        : laid.replace(/<\/w:p>$/, `${run}</w:p>`);
    }
    return centred(laid);
  });
}

const mergePattern = /<w:vMerge(?: w:val="(\w+)")?\/>/;

/**
 * A template cell that restarts a merge down a loop's row (9's component and factor group) is
 * joined to the cell above wherever the data left it empty: the data names a group on its
 * first row only.
 */
function mergedDown(rows: string[], header: number) {
  const merging = new Set<number>();
  return rows.map((row, index) => {
    if (index < header) return row;
    const placed = columnsOf(row);
    let at = 0;
    return row.replace(cellPattern, (cell) => {
      const { column } = placed[at]!;
      at += 1;
      const merge = mergePattern.exec(cellProperties(cell));
      if (!merge) {
        merging.delete(column);
        return cell;
      }
      if (merge[1] !== 'restart') return cell;
      if (merging.has(column) && !textOf(cell).trim()) return cell.replace(merge[0], '<w:vMerge/>');
      merging.add(column);
      return cell;
    });
  });
}

/** The columns where a cell of `row` starts a merge that `next` continues. */
function mergedOnto(row: string, next: string | undefined) {
  const continued = new Set(
    columnsOf(next ?? '')
      .filter(({ cell }) => continuesMerge(cell))
      .map(({ column }) => column)
  );
  return new Set(
    columnsOf(row)
      .filter(({ column, cell }) => continued.has(column) && !continuesMerge(cell))
      .map(({ column }) => column)
  );
}

function laidOut(table: string) {
  const rows = [...table.matchAll(rowPattern)].map((match) => match[0]);
  let header = 0;
  while (header < rows.length && isHeader(rows[header]!)) header += 1;
  const grid = [...table.matchAll(/<w:gridCol w:w="(\d+)"/g)].map((match) => Number(match[1]));
  const grouped = mergedDown(rows, header);
  const withMarks = grouped.map((row, index) =>
    index < header ? row : row.replace(cellPattern, (cell) => withEmptyMark(cell))
  );
  const alignments = columnAlignments(withMarks, header);
  const marked = withMarks.map((row, index) =>
    index < header ? row : alignedRow(row, grid, alignments, mergedOnto(row, withMarks[index + 1]))
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
  const pieces: string[] = [];
  let at = 0;
  for (const [start, end] of topLevelTables(document)) {
    const table = document.slice(start, end);
    if (
      !table.includes(`<w:tblStyle w:val="${houseTable}"/>`) ||
      table.slice(7).includes('<w:tbl>')
    )
      continue;
    pieces.push(document.slice(at, start), laidOut(table));
    at = end;
  }
  pieces.push(document.slice(at));
  return pieces.join('');
}
