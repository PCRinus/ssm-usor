import { columnsOf, isHeader, paragraphSize, spanOf, topLevelTables } from './table-keep';
import { decode } from './text';

// The prevention plan keeps the columns of annex 7 to H.G. 1425/2006, which a client fills very
// unevenly: equal columns wrap the full ones to five or six lines beside empty ones.

const marker = '<w:tblCaption w:val="ContentWidths"/>';
const share = 0.85;
const widestShare = 0.3;
// Beyond the cell's padding, so an estimate a little short of the real line does not break a word.
const slack = 20;
const defaultPadding = 170;
const empty = new Set(['', '-', '--', '–', '—', '---']);

// Liberation Sans, which the converter draws Arial with and which has Arial's advances, in
// thousandths of the size, rounded up. A character missing here counts as the font's widest glyph.
const advances = (groups: [number, string][]) =>
  new Map(groups.flatMap(([width, characters]) => [...characters].map((each) => [each, width])));
const regular = advances([
  [191, "'"],
  [223, 'ijl‘’‚'],
  [260, '|¦'],
  [278, ' !,./:;I[\\]ft\u00a0ÌÍÎÏìíîïțţ'],
  [334, '()-`r{}¡¨\u00ad²³´·¸¹“”„'],
  [351, '•'],
  [355, '"'],
  [366, 'º'],
  [371, 'ª'],
  [389, '₂'],
  [390, '*'],
  [400, '°'],
  [470, '^'],
  [500, 'Jcksvxyzçýÿșş'],
  [538, '¶'],
  [549, '±÷'],
  [553, '¯'],
  [557, '#$0123456789?L_abdeghnopqu¢£¤¥§«»àáâãäåèéêëðñòóôõöùúûüþă–€'],
  [577, 'µ'],
  [584, '+<=>~¬×'],
  [611, 'FTZ¿ßøȚŢ'],
  [667, '&ABEKPSVXYÀÁÂÃÄÅÈÉÊËÝÞĂȘŞ'],
  [723, 'CDHNRUwÇÐÑÙÚÛÜ'],
  [737, '©®'],
  [778, 'GOQÒÓÔÕÖØ'],
  [834, 'Mm¼½¾'],
  [890, '%æ'],
  [944, 'W'],
  [1000, 'Æ—…‰™'],
  [1016, '@'],
]);
const bold = advances([
  [238, "'"],
  [278, ' ,./I\\ijl\u00a0ÌÍÎÏìíîï‘’‚'],
  [280, '|¦'],
  [334, '!()-:;[]`ft¡¨\u00ad²³´·¸¹țţ'],
  [351, '•'],
  [366, 'º'],
  [371, 'ª'],
  [390, '*r{}'],
  [400, '°'],
  [445, '₂'],
  [475, '"'],
  [500, 'z“”„'],
  [549, '±÷'],
  [553, '¯'],
  [557, '#$0123456789J_aceksvxy¢£¤¥§«¶»àáâãäåçèéêëýÿășş–€'],
  [577, 'µ'],
  [584, '+<=>^~¬×'],
  [611, '?FLTZbdghnopqu¿ßðñòóôõöøùúûüþȚŢ'],
  [667, 'EPSVXYÈÉÊËÝÞȘŞ'],
  [723, '&ABCDHKNRUÀÁÂÃÄÅÇÐÑÙÚÛÜĂ'],
  [737, '©®'],
  [778, 'GOQwÒÓÔÕÖØ'],
  [834, 'M¼½¾'],
  [890, '%mæ'],
  [944, 'W'],
  [976, '@'],
  [1000, 'Æ—…‰™'],
]);
const widest = 1338;

/** In twips, at `size` half-points. */
export function textWidth(text: string, size: number, isBold = false) {
  const table = isBold ? bold : regular;
  let units = 0;
  for (const character of text) units += table.get(character) ?? widest;
  return (units * size) / 100;
}

const rowPattern = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
const paragraphPattern = /<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
const piecePattern = /<w:t\b[^>]*>([^<]*)<\/w:t>|<w:(?:br|cr)\b[^>]*\/>|<w:tab\/>/g;

function linesOf(paragraph: string) {
  const lines = [''];
  for (const [piece, text] of paragraph.matchAll(piecePattern)) {
    if (text !== undefined) lines[lines.length - 1] += decode(text);
    else if (piece === '<w:tab/>') lines[lines.length - 1] += ' ';
    else lines.push('');
  }
  return lines;
}

// A line breaks at a space or after a hyphen, but not after one before a digit, as in a date or a
// phone number; a no-break space holds. The dash that opens an item of a list counts with the
// word after it: alone at the end of a line it reads as a stray mark.
const wordsOf = (line: string) =>
  line
    .replace(/\u00ad/g, '')
    .replace(/^\s*([–—•-])[ \t]+/, '$1\u00a0')
    .split(/[ \t]+|(?<=[^\s\u00a0]-)(?!\d)/)
    .filter(Boolean);

export interface ColumnText {
  /**
   * Each cell's paragraphs, each a list of lines, with the paragraph's size in half-points and,
   * where it hangs from a dash, its text's indent in twips.
   */
  cells: { lines: string[]; size: number; indent?: number }[][];
}

export interface ColumnMeasure {
  /** Its longest word, so that no word breaks inside it, padding included. */
  floor: number;
  /** Its longest line on one line, padding included: more room than this is wasted. */
  oneLine: number;
  amount: number;
}

export function measureColumn(
  header: { lines: string[]; size: number }[],
  body: ColumnText,
  padding: number
): ColumnMeasure {
  let floor = 0;
  let oneLine = 0;
  let amount = 0;
  for (const { lines, size } of header)
    for (const line of lines)
      for (const word of wordsOf(line)) floor = Math.max(floor, textWidth(word, size, true));
  for (const cell of body.cells) {
    const text = cell
      .flatMap(({ lines }) => lines)
      .join(' ')
      .trim();
    if (empty.has(text)) continue;
    amount += text.length;
    for (const { lines, size, indent = 0 } of cell)
      for (const line of lines) {
        // A hung item's dash stands in its indent, in front of the text.
        const text = indent > 0 ? line.replace(/^\s*[–—•-]\s+/u, '') : line;
        oneLine = Math.max(oneLine, indent + textWidth(text.trim(), size));
        for (const word of wordsOf(text)) floor = Math.max(floor, indent + textWidth(word, size));
      }
  }
  const room = padding + slack;
  return {
    floor: Math.ceil(floor) + room,
    oneLine: Math.ceil(Math.max(floor, oneLine)) + room,
    amount,
  };
}

const sumOf = (values: number[]) => values.reduce((sum, each) => sum + each, 0);

function grown(widths: number[], caps: number[], weights: number[], total: number) {
  const growing = new Set([...widths.keys()].filter((index) => weights[index]! > 0));
  for (;;) {
    const left = total - sumOf(widths);
    const weight = sumOf([...growing].map((index) => weights[index]!));
    if (left <= 0 || weight === 0) return widths;
    const full = [...growing].filter(
      (index) => widths[index]! + (left * weights[index]!) / weight >= caps[index]!
    );
    if (full.length === 0) {
      for (const index of growing) widths[index]! += (left * weights[index]!) / weight;
      return widths;
    }
    for (const index of full) {
      widths[index] = Math.max(widths[index]!, caps[index]!);
      growing.delete(index);
    }
  }
}

/**
 * Undefined when the floors do not fit, or when no column holds anything: the template's widths
 * stand. The text's share is damped so that a full column does not starve the others, and capped
 * so that one long text, or one long word such as an address, cannot take the table over; the
 * converter breaks such a word.
 */
export function contentWidths(columns: ColumnMeasure[], total: number): number[] | undefined {
  const cap = Math.floor(total * widestShare);
  const floors = columns.map(({ floor }) => Math.min(floor, cap));
  const weights = columns.map(({ amount }) => amount ** share);
  if (sumOf(floors) > total || weights.every((weight) => weight === 0)) return undefined;
  const oneLine = columns.map(({ oneLine: line }, index) => Math.max(floors[index]!, line));
  const capped = oneLine.map((line, index) => Math.max(floors[index]!, Math.min(cap, line)));
  const widths = grown(grown([...floors], capped, weights, total), oneLine, weights, total);
  const left = total - sumOf(widths);
  const sum = sumOf(widths);
  return rounded(
    widths.map((width) => width + (left * width) / sum),
    total
  );
}

function rounded(widths: number[], total: number) {
  const whole = widths.map(Math.floor);
  const order = widths
    .map((width, index) => ({ index, fraction: width - whole[index]! }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  let left = total - whole.reduce((sum, each) => sum + each, 0);
  for (const { index } of order) {
    if (left <= 0) break;
    whole[index]! += 1;
    left -= 1;
  }
  return whole;
}

const gridOf = (table: string) =>
  [
    ...(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/.exec(table)?.[1] ?? '').matchAll(
      /<w:gridCol w:w="(\d+)"\/>/g
    ),
  ].map((match) => Number(match[1]));

function paddingOf(table: string) {
  const margins = /<w:tblCellMar>([\s\S]*?)<\/w:tblCellMar>/.exec(table)?.[1];
  const side = (name: string) =>
    Number(new RegExp(`<w:${name} w:w="(\\d+)"`).exec(margins ?? '')?.[1]);
  const left = side('left');
  const right = side('right');
  return Number.isNaN(left) || Number.isNaN(right) ? defaultPadding : left + right;
}

const cellText = (cell: string) =>
  [...cell.matchAll(paragraphPattern)].map(([paragraph]) => ({
    lines: linesOf(paragraph),
    size: paragraphSize(paragraph),
    indent: Number(/<w:ind\b[^>]*\bw:left="(\d+)"/.exec(paragraph)?.[1] ?? 0),
  }));

function withGrid(table: string, widths: number[]) {
  const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('');
  return table
    .replace(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/, `<w:tblGrid>${grid}</w:tblGrid>`)
    .replace(rowPattern, (row) => {
      const placed = columnsOf(row);
      let index = 0;
      return row.replace(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g, (cell) => {
        const { column } = placed[index++]!;
        const width = widths
          .slice(column, column + spanOf(cell))
          .reduce((sum, each) => sum + each, 0);
        return cell.replace(
          /<w:tcW w:w="\d+" w:type="\w+"\/>/,
          `<w:tcW w:w="${width}" w:type="dxa"/>`
        );
      });
    });
}

interface Marked {
  start: number;
  end: number;
  table: string;
  grid: number[];
  rows: string[];
  header: number;
}

export function fitColumnsToContent(document: string): string {
  if (!document.includes(marker)) return document;
  const kinds = new Map<string, Marked[]>();
  for (const [start, end] of topLevelTables(document)) {
    const table = document.slice(start, end);
    if (!table.includes(marker) || table.slice(7).includes('<w:tbl>')) continue;
    const rows = table.match(rowPattern) ?? [];
    const body = rows.findIndex((row) => !isHeader(row));
    const header = body === -1 ? rows.length : body;
    const grid = gridOf(table);
    // A cell across columns would have to share its text out between them.
    if (header <= 0 || rows.some((row) => /<w:gridSpan w:val="(?!1")/.test(row))) continue;
    const key = `${grid.reduce((sum, each) => sum + each, 0)}:${rows
      .slice(0, header)
      .map((row) =>
        columnsOf(row)
          .map(({ cell }) =>
            cellText(cell)
              .flatMap(({ lines }) => lines)
              .join(' ')
          )
          .join('|')
      )
      .join('/')}`;
    kinds.set(key, [...(kinds.get(key) ?? []), { start, end, table, grid, rows, header }]);
  }
  const replaced: { start: number; end: number; table: string }[] = [];
  for (const tables of kinds.values()) {
    const [first] = tables;
    const columns = first!.grid.map((_, column) => {
      const at = (row: string) => columnsOf(row).find((placed) => placed.column === column)?.cell;
      const header = first!.rows.slice(0, first!.header).flatMap((row) => cellText(at(row) ?? ''));
      const cells = tables.flatMap(({ rows, header: count }) =>
        rows.slice(count).map((row) => cellText(at(row) ?? ''))
      );
      return measureColumn(header, { cells }, paddingOf(first!.table));
    });
    const widths = contentWidths(
      columns,
      first!.grid.reduce((sum, each) => sum + each, 0)
    );
    if (!widths) continue;
    for (const { start, end, table } of tables)
      replaced.push({ start, end, table: withGrid(table, widths) });
  }
  replaced.sort((a, b) => a.start - b.start);
  let at = 0;
  const pieces: string[] = [];
  for (const { start, end, table } of replaced) {
    pieces.push(document.slice(at, start), table);
    at = end;
  }
  pieces.push(document.slice(at));
  // Word shows the caption as the table's alternative text; the merge never runs on its output.
  return pieces.join('').replaceAll(marker, '');
}
