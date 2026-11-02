export interface RisksTextFile {
  path: string;
  // As the client reading prepared it: a Word file's `docxToText`, which writes each table row as
  // `| a | b |`, or a PDF's text pages, which have no rows.
  text: string;
  scans?: { label: string; imageUrl: string }[];
}

export interface TableRow {
  id: string;
  file: string;
  // Offsets of the row's line in the file's text.
  start: number;
  end: number;
  cells: string[];
}

export interface NumberedRows {
  // The files' text with each table row's id before it: `R212 | a | b |`.
  texts: Map<string, string>;
  rows: TableRow[];
  byId: Map<string, TableRow>;
}

const rowLine = /^\| (.*) \|$/;

export const rowId = (number: number) => `R${number}`;

export function rowNumber(id: string) {
  const match = /^R(\d+)$/.exec(id.trim());
  return match ? Number(match[1]) : null;
}

export function splitCells(line: string): string[] | null {
  const match = rowLine.exec(line);
  return match ? match[1]!.split(' | ').map((cell) => cell.trim()) : null;
}

// Numbered across all files in their order, so that an id alone names a row.
export function numberRows(files: readonly RisksTextFile[]): NumberedRows {
  const texts = new Map<string, string>();
  const rows: TableRow[] = [];
  let next = 1;
  for (const file of files) {
    const lines = file.text.split('\n');
    let offset = 0;
    const numbered = lines.map((line) => {
      const start = offset;
      offset += line.length + 1;
      const cells = splitCells(line);
      if (!cells) return line;
      const id = rowId(next++);
      rows.push({ id, file: file.path, start, end: start + line.length, cells });
      return `${id} ${line}`;
    });
    texts.set(file.path, numbered.join('\n'));
  }
  return { texts, rows, byId: new Map(rows.map((row) => [row.id, row])) };
}

export const hasRows = (numbered: NumberedRows, path: string) =>
  numbered.rows.some((row) => row.file === path);

export function rowsBetween(numbered: NumberedRows, first: string, last: string) {
  const from = rowNumber(first);
  const to = rowNumber(last);
  if (from === null || to === null || to < from) return [];
  const file = numbered.byId.get(first)?.file;
  return numbered.rows.filter((row) => {
    const number = rowNumber(row.id)!;
    return number >= from && number <= to && row.file === file;
  });
}
