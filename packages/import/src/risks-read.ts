import {
  foldText,
  type PreventionMeasureKind,
  type RiskEvaluationKind,
  riskLevel,
  type WorkSystemComponent,
} from '@ssm-usor/contracts';

import { findQuotes, foldName } from './match';
import type { RetypedFactor, RisksAnswer } from './risks-request';
import { planRoles } from './risks-roles';
import {
  type NumberedRows,
  numberRows,
  type RisksTextFile,
  rowNumber,
  rowsBetween,
  type TableRow,
} from './risks-rows';

export interface ProposedMeasure {
  kind: PreventionMeasureKind;
  description: string;
}

export type PlanField = 'actions' | 'deadline' | 'responsiblePerson' | 'observations';

export type RiskFactorFlag =
  | { kind: 'level_mismatch'; printed: number; grid: number }
  // The consequence's wording is that of another gravity class than the one printed.
  | { kind: 'consequence_mismatch'; consequence: string; consequenceClass: number }
  | { kind: 'class_missing'; field: 'gravity' | 'probability'; written: string }
  | { kind: 'unknown_component'; written: string }
  | { kind: 'missing_group' }
  | { kind: 'row_shape'; cells: number; expected: number }
  | { kind: 'retyped' }
  | { kind: 'quote_not_found' }
  | { kind: 'person_named'; field: PlanField; text: string }
  | { kind: 'measure_kind_guessed' }
  | { kind: 'measures_cut'; count: number };

export interface SourceRow {
  file: string;
  // Offsets in the file's text.
  start: number;
  end: number;
}

export interface ReadFactor {
  key: string;
  // Null for a factor written out from a file with no rows.
  row: string | null;
  source: SourceRow | null;
  // Null when the label is none of the method's four.
  component: WorkSystemComponent | null;
  writtenComponent: string;
  group: string;
  // Without its "F3." code.
  description: string;
  code: string | null;
  consequence: string;
  // Null when missing or off the scale.
  gravityClass: number | null;
  probabilityClass: number | null;
  printedLevel: number | null;
  measures: ProposedMeasure[];
  measuresFrom: 'plan' | 'sheet' | null;
  actions: string | null;
  deadline: string | null;
  responsiblePerson: string | null;
  observations: string | null;
  flags: RiskFactorFlag[];
}

export type WorkSystemText = 'meansOfProduction' | 'workEnvironment' | 'exposure';

export type SheetFlag =
  | { kind: 'quote_not_found'; field: WorkSystemText }
  | { kind: 'text_cut'; field: WorkSystemText }
  | { kind: 'file_not_found' }
  | { kind: 'rows_not_found' }
  | { kind: 'no_factors' }
  // Most printed levels fit the grid with gravity and probability read the other way round.
  | { kind: 'classes_swapped' };

export interface ReadSheet {
  key: string;
  file: string;
  heading: string;
  kind: RiskEvaluationKind;
  name: string;
  // The proposal's posts, as the answer named them.
  posts: string[];
  rows: { first: string; last: string } | null;
  meansOfProduction: string | null;
  workEnvironment: string | null;
  exposure: string | null;
  factors: ReadFactor[];
  flags: SheetFlag[];
}

export interface LooseRow {
  row: string;
  file: string;
  text: string;
}

export interface UnmatchedPlanRow extends LooseRow {
  post: string;
  risk: string;
  // The sheet of the post the row is written under, by its key; null when none is known.
  sheet: string | null;
  // The row written out as a factor the specialist may add; null without a table or a risk.
  factor: ReadFactor | null;
}

export interface ReadRisks {
  sheets: ReadSheet[];
  // Rows written like factors that no sheet spans.
  unplacedRows: LooseRow[];
  // Plan and measures rows that the answer and the plan's own words join to no factor.
  unmatchedPlanRows: UnmatchedPlanRow[];
  unmatchedMeasureRows: LooseRow[];
}

const componentStems: [RegExp, WorkSystemComponent][] = [
  [/^mijlo\w* (de )?productie/, 'means_of_production'],
  [/^mediu\w* (de )?munca/, 'work_environment'],
  [/^sarcin\w* (de )?munca/, 'work_task'],
  [/^executant\w*$/, 'executant'],
];

export function componentOf(label: string): WorkSystemComponent | null {
  const folded = foldText(label);
  return componentStems.find(([stem]) => stem.test(folded))?.[1] ?? null;
}

const factorCode = /^\s*(F\s*\d{1,3})\s*[.):-]?\s*/iu;

export function splitCode(written: string) {
  const match = factorCode.exec(written);
  if (!match) return { code: null, description: written.trim() };
  return {
    code: match[1]!.replace(/\s+/g, '').toUpperCase(),
    description: written.slice(match[0].length).trim(),
  };
}

export function classOf(written: string, max: number) {
  const match = /^\s*(\d)\s*\.?\s*$/u.exec(written);
  const value = match ? Number(match[1]) : NaN;
  return value >= 1 && value <= max ? value : null;
}

// The wording of annex 3's gravity classes, as the packs abbreviate it ("ITM / 3-45 zile",
// "Invalid. Grad II"); null for one that names none.
export function consequenceClass(consequence: string): number | null {
  const folded = foldText(consequence);
  if (folded === '') return null;
  if (/\bdeces\b|\bmortal/.test(folded)) return 7;
  const grade = /\binvalid\w*\s+(?:de\s+)?grad\w*\s+(iii|ii|i|3|2|1)\b/.exec(folded)?.[1];
  if (grade) return { iii: 4, '3': 4, ii: 5, '2': 5, i: 6, '1': 6 }[grade] ?? null;
  if (/\b45\s+180\b/.test(folded)) return 3;
  if (/\b3\s+45\b/.test(folded)) return 2;
  if (/\bminor|\breversibil|\bneglijabil|\b3\s+zile\b/.test(folded)) return 1;
  return null;
}

const placeholder = /^[\s\-–—.,_/x]*$/iu;

// A cell's paragraphs are joined by " / ", and the packs break one measure over several lines of
// a narrow column ("Instruire asupra / conduitei preventive"): a piece that starts in lower case
// goes on from the one before it.
export function cellItems(text: string): string[] {
  const items: string[] = [];
  for (const piece of text.split(/(?:\s+\/)+\s+/u)) {
    const trimmed = piece.trim();
    if (placeholder.test(trimmed)) continue;
    const previous = items.at(-1);
    if (previous !== undefined && (/^\p{Ll}/u.test(trimmed) || /[,(–-]$/u.test(previous))) {
      items[items.length - 1] = `${previous} ${trimmed}`;
    } else {
      items.push(trimmed);
    }
  }
  return items;
}

export function fieldText(text: string | undefined, max = 2000): string | null {
  if (text === undefined) return null;
  const items = cellItems(text);
  if (items.length === 0) return null;
  return items
    .map((item, index) =>
      index === items.length - 1 || /[.;:!?]$/u.test(item) ? item : `${item};`
    )
    .join(' ')
    .slice(0, max)
    .trim();
}

const maxMeasures = 30;

const measureLabel =
  /m[ăa]suri(?:le)?\s+(tehnice|organizatorice|igienico[\s-]*sanitare|de\s+alt[ăa]\s+natur[ăa])\s*:/giu;

const labelKinds: [RegExp, PreventionMeasureKind][] = [
  [/^tehnic/u, 'technical'],
  [/^organiz/u, 'organizational'],
  [/^igien/u, 'hygienic_sanitary'],
  [/^de/u, 'other'],
];

const labelKind = (word: string) =>
  labelKinds.find(([pattern]) => pattern.test(word.toLowerCase()))?.[1] ?? 'other';

interface Segment {
  kind: PreventionMeasureKind | null;
  text: string;
  preamble?: boolean;
}

function labelledSegments(text: string): Segment[] | null {
  const labels = [...text.matchAll(measureLabel)];
  if (labels.length === 0) return null;
  const segments: Segment[] = [
    { kind: null, text: text.slice(0, labels[0]!.index), preamble: true },
  ];
  labels.forEach((label, index) => {
    const end = labels[index + 1]?.index ?? text.length;
    segments.push({
      kind: labelKind(label[1]!),
      text: text.slice(label.index + label[0].length, end),
    });
  });
  return segments;
}

function partSegments(
  text: string,
  parts: readonly { kind: PreventionMeasureKind; startWords: string }[]
): Segment[] {
  const found = parts
    .map((part) => ({ kind: part.kind, at: findQuotes(text, part.startWords)[0]?.start }))
    .filter((part): part is { kind: PreventionMeasureKind; at: number } => part.at !== undefined)
    .sort((a, b) => a.at - b.at);
  if (found.length === 0) return [{ kind: null, text }];
  return [
    { kind: null, text: text.slice(0, found[0]!.at), preamble: true },
    ...found.map((part, index) => ({
      kind: part.kind,
      text: text.slice(part.at, found[index + 1]?.at ?? text.length),
    })),
  ];
}

const measureText = (text: string) => text.replace(/^[\s/:;,.]+|[\s/]+$/gu, '').slice(0, 2000);

export function sheetMeasures(
  text: string,
  parts: readonly { kind: PreventionMeasureKind; startWords: string }[]
): { measures: ProposedMeasure[]; guessed: boolean } {
  const labelled = labelledSegments(text);
  const segments = labelled ?? partSegments(text, parts);
  let guessed = false;
  const measures: ProposedMeasure[] = [];
  for (const segment of segments) {
    let kind = segment.kind;
    // A heading such as "Măsuri propuse:" before the first start words is not a measure.
    const items = cellItems(segment.text).filter(
      (item) => !(segment.preamble && /:\s*$/u.test(item))
    );
    if (items.length === 0) continue;
    if (kind === null) {
      const partKind = labelled ? partSegments(segment.text, parts)[0]?.kind : null;
      kind = partKind ?? (labelled || segment.preamble ? null : (parts[0]?.kind ?? null));
      if (kind === null) {
        guessed = true;
        kind = 'organizational';
      }
    }
    for (const item of items) {
      const description = measureText(item);
      if (description !== '') measures.push({ kind, description });
    }
  }
  return { measures, guessed };
}

const planKinds = [
  ['technical', 'technical'],
  ['organizational', 'organizational'],
  ['hygienicSanitary', 'hygienic_sanitary'],
  ['other', 'other'],
] as const;

const personName = /\p{Lu}\p{Ll}+(?:[\s-]+\p{Lu}\p{Ll}+)*\s+(\p{Lu}{3,})(?![\p{L}.])/gu;

// "Responsabil SSM" is a role: a surname in capitals is never one of these.
const acronyms = new Set([
  'SSM',
  'PSI',
  'ISU',
  'ITM',
  'SRL',
  'PFA',
  'IGSU',
  'ISCIR',
  'PRAM',
  'RSVTI',
]);

// A plan's deadlines and people are roles ("Cond. loc muncă", "Administrator"); a name such as
// "Ramona CIMPEAN" or one of the client's people is a person.
export function namesPerson(text: string, people: readonly string[]) {
  for (const match of text.matchAll(personName)) if (!acronyms.has(match[1]!)) return true;
  const folded = ` ${foldName(text)} `;
  return people.some((person) => {
    const name = foldName(person);
    return name.includes(' ') && folded.includes(` ${name} `);
  });
}

function findAfter(text: string, quote: string, from: number, to: number) {
  return findQuotes(text.slice(from, to), quote).map((found) => ({
    start: found.start + from,
    end: found.end + from,
  }));
}

function spanText(
  text: string,
  region: { start: number; end: number },
  span: { startWords: string; endWords: string }
): string | null | undefined {
  if (span.startWords.trim() === '') return null;
  const start = findAfter(text, span.startWords, region.start, region.end)[0];
  if (!start) return undefined;
  const endQuote = span.endWords.trim() === '' ? span.startWords : span.endWords;
  const end = findAfter(text, endQuote, start.start, region.end)[0];
  if (!end) return undefined;
  // A quote is matched word by word, so the sentence's closing mark is taken from the file.
  const closing = /^[.;!?)»”"]*/u.exec(text.slice(end.end, region.end))![0].length;
  return text.slice(start.start, end.end + closing).trim();
}

const textLimits: Record<WorkSystemText, number> = {
  meansOfProduction: 2000,
  workEnvironment: 2000,
  exposure: 120,
};

type AnsweredSheet = RisksAnswer['sheets'][number];

interface Located {
  answered: AnsweredSheet;
  key: string;
  rows: TableRow[];
  region: { start: number; end: number };
}

function headingAt(text: string, heading: string, from: number, before: number) {
  const found = findAfter(text, heading, from, before);
  return found.at(-1)?.start ?? null;
}

function locate(answer: RisksAnswer, files: Map<string, RisksTextFile>, numbered: NumberedRows) {
  const located: Located[] = answer.sheets.map((answered, index) => ({
    answered,
    key: `sheet-${index + 1}`,
    rows:
      answered.firstRow && answered.lastRow
        ? rowsBetween(numbered, answered.firstRow, answered.lastRow).filter(
            (row) => row.file === answered.file
          )
        : [],
    region: { start: 0, end: 0 },
  }));
  for (const [path, file] of files) {
    const inFile = located.filter((sheet) => sheet.answered.file === path);
    let cursor = 0;
    inFile.forEach((sheet, index) => {
      const firstRowStart = sheet.rows[0]?.start;
      const later = inFile.slice(index + 1).find((next) => next.rows[0] !== undefined);
      const limit = firstRowStart ?? later?.rows[0]?.start ?? file.text.length;
      const start = headingAt(file.text, sheet.answered.heading, cursor, limit) ?? cursor;
      sheet.region = { start, end: sheet.rows.at(-1)?.end ?? limit };
      cursor = Math.max(cursor, sheet.rows.at(-1)?.end ?? start);
    });
    inFile.forEach((sheet, index) => {
      if (sheet.rows.length > 0) return;
      const next = inFile[index + 1];
      sheet.region.end = next ? Math.max(next.region.start, sheet.region.start) : file.text.length;
    });
  }
  return located;
}

// A row short of cells has lost them at its start, where the merged component and group stand.
const role = (cells: readonly string[], index: number | null, expected: number) => {
  if (index === null) return '';
  const position = index - 1 - Math.max(0, expected - cells.length);
  return position < 0 ? '' : (cells[position] ?? '');
};

const headerWords = /\b(?:clasa|gravitate|probabilitate|nivel)\b/;

function classFlags(
  factor: Pick<ReadFactor, 'gravityClass' | 'probabilityClass' | 'printedLevel' | 'consequence'>,
  written: { gravity: string; probability: string }
): RiskFactorFlag[] {
  const flags: RiskFactorFlag[] = [];
  if (factor.gravityClass === null) {
    flags.push({ kind: 'class_missing', field: 'gravity', written: written.gravity });
  }
  if (factor.probabilityClass === null) {
    flags.push({ kind: 'class_missing', field: 'probability', written: written.probability });
  }
  if (factor.gravityClass !== null && factor.probabilityClass !== null) {
    const grid = riskLevel(factor.gravityClass, factor.probabilityClass);
    if (factor.printedLevel !== null && factor.printedLevel !== grid) {
      flags.push({ kind: 'level_mismatch', printed: factor.printedLevel, grid });
    }
  }
  const fromWords = consequenceClass(factor.consequence);
  if (factor.gravityClass !== null && fromWords !== null && fromWords !== factor.gravityClass) {
    flags.push({
      kind: 'consequence_mismatch',
      consequence: factor.consequence,
      consequenceClass: fromWords,
    });
  }
  return flags;
}

function baseFactor(
  key: string,
  written: {
    component: string;
    group: string;
    description: string;
    consequence: string;
    gravity: string;
    probability: string;
    level: string;
  }
): ReadFactor {
  const { code, description } = splitCode(written.description);
  const component = componentOf(written.component);
  const factor: ReadFactor = {
    key,
    row: null,
    source: null,
    component,
    writtenComponent: written.component,
    group: written.group.trim().slice(0, 200).trim(),
    description: description.slice(0, 1000).trim(),
    code,
    consequence: written.consequence.trim(),
    gravityClass: classOf(written.gravity, 7),
    probabilityClass: classOf(written.probability, 6),
    printedLevel: classOf(written.level, 7),
    measures: [],
    measuresFrom: null,
    actions: null,
    deadline: null,
    responsiblePerson: null,
    observations: null,
    flags: [],
  };
  if (component === null) {
    factor.flags.push({ kind: 'unknown_component', written: written.component });
  }
  if (factor.group === '') factor.flags.push({ kind: 'missing_group' });
  factor.flags.push(...classFlags(factor, written));
  return factor;
}

function mostCommon(values: readonly number[]) {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 0;
}

function copiedFactors(sheet: Located): ReadFactor[] {
  const { columns } = sheet.answered;
  const expected = mostCommon(sheet.rows.map((row) => row.cells.length));
  const factors: ReadFactor[] = [];
  let component = '';
  let group = '';
  for (const row of sheet.rows) {
    const at = (index: number | null) => role(row.cells, index, expected);
    const description = at(columns.description);
    if (!/\p{L}{2,}/u.test(description)) continue;
    const classes = foldText(`${at(columns.gravity)} ${at(columns.probability)}`);
    if (headerWords.test(classes)) continue;
    const writtenComponent = at(columns.component);
    const writtenGroup = at(columns.group);
    if (writtenComponent !== '') {
      if (writtenComponent !== component) group = '';
      component = writtenComponent;
    }
    if (writtenGroup !== '') group = writtenGroup;
    const factor = baseFactor(`${sheet.key}.${factors.length + 1}`, {
      component,
      group,
      description,
      consequence: at(columns.consequence),
      gravity: at(columns.gravity),
      probability: at(columns.probability),
      level: at(columns.level),
    });
    factor.row = row.id;
    factor.source = { file: row.file, start: row.start, end: row.end };
    if (row.cells.length !== expected) {
      factor.flags.push({ kind: 'row_shape', cells: row.cells.length, expected });
    }
    factors.push(factor);
  }
  return factors;
}

function setMeasures(factor: ReadFactor, measures: ProposedMeasure[]) {
  if (measures.length > maxMeasures) {
    factor.flags.push({ kind: 'measures_cut', count: measures.length });
  }
  factor.measures = measures.slice(0, maxMeasures);
}

const planFields: PlanField[] = ['actions', 'deadline', 'responsiblePerson', 'observations'];

// The database's limits on a factor's plan fields.
const planFieldLimits: Record<PlanField, number> = {
  actions: 2000,
  deadline: 200,
  responsiblePerson: 200,
  observations: 1000,
};

const retypedPlanFields = (written: RetypedFactor) =>
  Object.fromEntries(
    planFields.map((field) => [
      field,
      fieldText(written[field] ?? undefined, planFieldLimits[field]),
    ])
  ) as Record<PlanField, string | null>;

function setPlanFields(
  factor: ReadFactor,
  fields: Record<PlanField, string | null>,
  people: readonly string[]
) {
  for (const field of planFields) {
    const written = fields[field];
    if (written === null) continue;
    const roles = field === 'responsiblePerson' ? planRoles(written) : written;
    const value = roles.length <= planFieldLimits[field] ? roles : written;
    factor[field] = value;
    factor.flags = factor.flags.filter(
      (flag) => !(flag.kind === 'person_named' && flag.field === field)
    );
    if (namesPerson(value, people)) {
      factor.flags.push({ kind: 'person_named', field, text: value });
    }
  }
}

// A PDF's text puts a table row's cells side by side, so a description that wraps in its cell
// goes on lines below, after the other cells' words: a quote of the whole row is not in the text,
// its first words are.
const leadingWords = (quote: string) => quote.trim().split(/\s+/u).slice(0, 5).join(' ');

function retypedFactors(sheet: Located, text: string, people: readonly string[]): ReadFactor[] {
  let component = '';
  let group = '';
  return sheet.answered.factors.map((written: RetypedFactor, index) => {
    if (written.component.trim() !== '') {
      if (written.component !== component) group = '';
      component = written.component;
    }
    if (written.group.trim() !== '') group = written.group;
    const factor = baseFactor(`${sheet.key}.${index + 1}`, { ...written, component, group });
    factor.flags.unshift({ kind: 'retyped' });
    const found =
      findAfter(text, written.quote, sheet.region.start, sheet.region.end)[0] ??
      findAfter(text, leadingWords(written.quote), sheet.region.start, sheet.region.end)[0];
    if (found) factor.source = { file: sheet.answered.file, ...found };
    else factor.flags.push({ kind: 'quote_not_found' });
    setMeasures(
      factor,
      written.measures
        .map((measure) => ({ kind: measure.kind, description: measureText(measure.description) }))
        .filter((measure) => !placeholder.test(measure.description))
    );
    setPlanFields(factor, retypedPlanFields(written), people);
    const planned = planFields.some((field) => factor[field] !== null);
    factor.measuresFrom = factor.measures.length > 0 || planned ? written.measuresFrom : null;
    return factor;
  });
}

const swapEvidence = 3;

// Only a factor whose two readings give different levels tells them apart, and a gravity of 7
// has no probability to swap with. The classes stay as written (ADR 015): the sheet is flagged.
export function classesSwapped(
  factors: readonly Pick<ReadFactor, 'gravityClass' | 'probabilityClass' | 'printedLevel'>[]
) {
  let swapped = 0;
  let telling = 0;
  for (const { gravityClass: gravity, probabilityClass: probability, printedLevel } of factors) {
    if (gravity === null || probability === null || printedLevel === null || gravity > 6) continue;
    const written = riskLevel(gravity, probability);
    const turned = riskLevel(probability, gravity);
    if (written === turned) continue;
    telling++;
    if (printedLevel === turned) swapped++;
  }
  return swapped >= swapEvidence && swapped * 3 >= telling * 2;
}

const descriptionKey = (text: string) => foldText(splitCode(text).description);

const looksLikeFactor = (cells: readonly string[]) =>
  cells.some((cell) => /^F\s?\d{1,3}\s*[.)]/u.test(cell)) &&
  cells.filter((cell) => /^[1-7]$/.test(cell)).length >= 3;

const rowText = (row: TableRow) => `| ${row.cells.join(' | ')} |`;

// A row the answer joins to a factor but places in no table, as when a table's last row is
// given one short, takes the nearest table above it in its file.
function planTableOf(tables: RisksAnswer['planTables'], row: TableRow) {
  const number = rowNumber(row.id)!;
  const above = tables
    .filter((table) => table.file === row.file && (rowNumber(table.firstRow) ?? Infinity) <= number)
    .sort((a, b) => rowNumber(b.firstRow)! - rowNumber(a.firstRow)!);
  return (
    above.find((table) => number <= (rowNumber(table.lastRow) ?? -Infinity)) ?? above[0] ?? null
  );
}

type PlanTable = RisksAnswer['planTables'][number];

const planCell = (row: TableRow) => (index: number | null) =>
  index === null ? '' : (row.cells[index - 1] ?? '');

function planMeasures(row: TableRow, table: PlanTable): ProposedMeasure[] {
  const at = planCell(row);
  return planKinds.flatMap(([column, kind]) =>
    cellItems(at(table.columns[column]))
      .map(measureText)
      .filter((description) => description !== '')
      .map((description) => ({ kind, description }))
  );
}

function planRowFields(row: TableRow, table: PlanTable): Record<PlanField, string | null> {
  const at = planCell(row);
  return {
    actions: fieldText(at(table.columns.actions), planFieldLimits.actions),
    deadline: fieldText(at(table.columns.deadline), planFieldLimits.deadline),
    responsiblePerson: fieldText(at(table.columns.responsible), planFieldLimits.responsiblePerson),
    observations: fieldText(at(table.columns.observations), planFieldLimits.observations),
  };
}

// The plan names no component, group or classes: the specialist chooses them on adding it.
function planRowFactor(
  row: TableRow,
  table: PlanTable,
  people: readonly string[]
): ReadFactor | null {
  const description = cellItems(planCell(row)(table.columns.risk)).join(' ').slice(0, 1000).trim();
  if (!/\p{L}{2,}/u.test(description)) return null;
  const factor: ReadFactor = {
    key: `plan-${row.id}`,
    row: row.id,
    source: { file: row.file, start: row.start, end: row.end },
    component: null,
    writtenComponent: '',
    group: '',
    description,
    code: null,
    consequence: '',
    gravityClass: null,
    probabilityClass: null,
    printedLevel: null,
    measures: [],
    measuresFrom: 'plan',
    actions: null,
    deadline: null,
    responsiblePerson: null,
    observations: null,
    flags: [],
  };
  setMeasures(factor, planMeasures(row, table));
  setPlanFields(factor, planRowFields(row, table), people);
  return factor;
}

export interface ReadRisksOptions {
  // The client's people, whose names in a plan field are a person rather than a role.
  people?: readonly string[];
}

export function readRisksAnswer(
  files: readonly RisksTextFile[],
  answer: RisksAnswer,
  options: ReadRisksOptions = {}
): ReadRisks {
  const numbered = numberRows(files);
  const byPath = new Map(files.map((file) => [file.path, file]));
  const located = locate(answer, byPath, numbered);
  const people = options.people ?? [];

  const sheets: ReadSheet[] = located.map((sheet) => {
    const { answered } = sheet;
    const file = byPath.get(answered.file);
    const flags: SheetFlag[] = [];
    if (!file) flags.push({ kind: 'file_not_found' });
    const factors = !file
      ? []
      : sheet.rows.length > 0
        ? copiedFactors(sheet)
        : retypedFactors(sheet, file.text, people);
    if (file && answered.firstRow !== '' && sheet.rows.length === 0) {
      flags.push({ kind: 'rows_not_found' });
    }
    if (factors.length === 0) flags.push({ kind: 'no_factors' });
    if (classesSwapped(factors)) flags.push({ kind: 'classes_swapped' });
    const texts = {} as Record<WorkSystemText, string | null>;
    for (const field of ['meansOfProduction', 'workEnvironment', 'exposure'] as const) {
      const found = file ? spanText(file.text, sheet.region, answered[field]) : null;
      if (found === undefined) flags.push({ kind: 'quote_not_found', field });
      let value = found ?? null;
      if (value !== null && value.length > textLimits[field]) {
        flags.push({ kind: 'text_cut', field });
        value = value.slice(0, textLimits[field]).trim();
      }
      texts[field] = value;
    }
    return {
      key: sheet.key,
      file: answered.file,
      heading: answered.heading,
      kind: answered.kind,
      name: answered.name,
      posts: answered.posts,
      rows:
        sheet.rows.length > 0 ? { first: sheet.rows[0]!.id, last: sheet.rows.at(-1)!.id } : null,
      ...texts,
      factors,
      flags,
    };
  });

  const factorOfRow = new Map<string, ReadFactor>();
  const sheetOf = new Map<ReadFactor, string>();
  for (const sheet of sheets) {
    for (const factor of sheet.factors) {
      if (factor.row) factorOfRow.set(factor.row, factor);
      sheetOf.set(factor, sheet.key);
    }
  }

  const unmatchedPlanRows: ReadRisks['unmatchedPlanRows'] = [];
  // A plan block is one post's rows of one table; its sheet is where its paired rows' factors are.
  const blockSheets = new Map<string, Map<string, number>>();
  const blockOf = new Map<UnmatchedPlanRow, string>();
  const blockKey = (table: PlanTable, post: string) =>
    `${answer.planTables.indexOf(table)}|${post}`;
  const unmatched = (row: TableRow, table: PlanTable, post: string) => {
    const item: UnmatchedPlanRow = {
      row: row.id,
      file: row.file,
      text: rowText(row),
      post,
      risk: planCell(row)(table.columns.risk),
      sheet: null,
      factor: planRowFactor(row, table, people),
    };
    unmatchedPlanRows.push(item);
    blockOf.set(item, blockKey(table, post));
  };
  const planned = new Set<ReadFactor>();
  const planRows = answer.plan
    .map((entry) => ({ entry, row: numbered.byId.get(entry.row) }))
    .filter((item): item is { entry: RisksAnswer['plan'][number]; row: TableRow } => !!item.row)
    .sort((a, b) => rowNumber(a.row.id)! - rowNumber(b.row.id)!);
  let post = '';
  let postTable: unknown = null;
  for (const { entry, row } of planRows) {
    const table = planTableOf(answer.planTables, row);
    if (!table) {
      unmatchedPlanRows.push({
        row: row.id,
        file: row.file,
        text: rowText(row),
        post: '',
        risk: '',
        sheet: null,
        factor: null,
      });
      continue;
    }
    const at = planCell(row);
    if (table !== postTable) post = '';
    postTable = table;
    const writtenPost = fieldText(at(table.columns.post));
    if (writtenPost) post = writtenPost;
    const risk = at(table.columns.risk);
    let factors = entry.factorRows.flatMap((id) => factorOfRow.get(id) ?? []);
    if (factors.length === 0) {
      const keys = new Set(cellItems(risk).map(descriptionKey));
      factors = sheets.flatMap((sheet) =>
        sheet.factors.filter(
          (factor) => factor.row === null && keys.has(foldText(factor.description))
        )
      );
    }
    if (factors.length === 0) {
      unmatched(row, table, post);
      continue;
    }
    const counts = blockSheets.get(blockKey(table, post)) ?? new Map<string, number>();
    for (const key of new Set(factors.map((factor) => sheetOf.get(factor)!))) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    blockSheets.set(blockKey(table, post), counts);
    const measures = planMeasures(row, table);
    const fields = planRowFields(row, table);
    // A factor written out from a PDF came with the measures the model wrote; a plan row of a
    // Word file joined to it by its description is copied over them, as copying never drifts.
    for (const factor of factors) {
      const first = !planned.has(factor);
      setMeasures(factor, first ? measures : [...factor.measures, ...measures]);
      factor.measuresFrom = 'plan';
      setPlanFields(
        factor,
        first
          ? fields
          : (Object.fromEntries(
              planFields.map((field) => [field, factor[field] === null ? fields[field] : null])
            ) as Record<PlanField, string | null>),
        people
      );
      planned.add(factor);
    }
  }

  const answeredPlanRows = new Set(answer.plan.map((entry) => entry.row));
  for (const table of answer.planTables) {
    let tablePost = '';
    for (const row of rowsBetween(numbered, table.firstRow, table.lastRow)) {
      if (row.file !== table.file) continue;
      const at = planCell(row);
      const writtenPost = fieldText(at(table.columns.post));
      if (writtenPost) tablePost = writtenPost;
      if (answeredPlanRows.has(row.id) || !/\p{L}{2,}/u.test(at(table.columns.risk))) continue;
      unmatched(row, table, tablePost);
    }
  }

  const named = (written: string) => {
    const folded = ` ${foldText(written)} `;
    const found = sheets.filter((sheet) => {
      const name = foldText(sheet.name);
      return sheet.factors.length > 0 && name !== '' && folded.includes(` ${name} `);
    });
    return found.length === 1 ? found[0]!.key : null;
  };
  for (const item of unmatchedPlanRows) {
    if (!item.factor) continue;
    const ranked = [...(blockSheets.get(blockOf.get(item)!) ?? [])].sort((a, b) => b[1] - a[1]);
    const [top, next] = ranked;
    item.sheet = top && (!next || top[1] > next[1]) ? top[0] : named(item.post);
  }
  unmatchedPlanRows.sort((a, b) => (rowNumber(a.row) ?? 0) - (rowNumber(b.row) ?? 0));

  const unmatchedMeasureRows: LooseRow[] = [];
  for (const entry of answer.measures) {
    const row = numbered.byId.get(entry.row);
    if (!row) continue;
    const factor = factorOfRow.get(entry.factorRow);
    if (!factor) {
      unmatchedMeasureRows.push({ row: row.id, file: row.file, text: rowText(row) });
      continue;
    }
    if (planned.has(factor) && factor.measures.length > 0) continue;
    const column = entry.column ?? row.cells.length;
    const { measures, guessed } = sheetMeasures(row.cells[column - 1] ?? '', entry.parts);
    setMeasures(factor, [...factor.measures, ...measures]);
    factor.measuresFrom = 'sheet';
    if (guessed && !factor.flags.some((flag) => flag.kind === 'measure_kind_guessed')) {
      factor.flags.push({ kind: 'measure_kind_guessed' });
    }
  }

  const accounted = new Set([
    ...located.flatMap((sheet) => sheet.rows.map((row) => row.id)),
    ...answer.measures.map((entry) => entry.row),
    ...answer.plan.map((entry) => entry.row),
  ]);
  const sheetFiles = new Set(answer.sheets.map((sheet) => sheet.file));
  const unplacedRows = numbered.rows
    .filter(
      (row) => sheetFiles.has(row.file) && !accounted.has(row.id) && looksLikeFactor(row.cells)
    )
    .map((row) => ({ row: row.id, file: row.file, text: rowText(row) }));

  return { sheets, unplacedRows, unmatchedPlanRows, unmatchedMeasureRows };
}

// Ticked by default only when the classes, the component and the group are known: the app never
// chooses a class (ADR 015), and the database takes no factor without a group.
export const factorComplete = (
  factor: Pick<ReadFactor, 'component' | 'group' | 'gravityClass' | 'probabilityClass'>
) =>
  factor.component !== null &&
  factor.group.trim() !== '' &&
  factor.gravityClass !== null &&
  factor.probabilityClass !== null;
