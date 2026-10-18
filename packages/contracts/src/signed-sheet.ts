import type { TrainingDomain } from './trainings';

// Each name is the title of a content control in the sheet's template, which build_sheets.py in
// the document engine writes; the signer names the PDF field after it (ADR 023).

export const sheetSignerSlots = ['trainee', 'trainer', 'verifier', 'admitter'] as const;
export type SheetSignerSlot = (typeof sheetSignerSlots)[number];

/**
 * `h1` the introductory general training, `h2` the workplace training, `adm` its admission
 * block, `p1`… the periodic rows (and on the fire-safety sheet the supplementary ones), `s1`…
 * the occupational safety sheet's supplementary rows.
 */
export type SheetRowKey = 'h1' | 'h2' | 'adm' | `p${number}` | `s${number}`;

export type SheetTable = 'p' | 's';

const capacity: Record<TrainingDomain, number> = { ssm: 17, psi: 17 };

/** A page of rows, as on paper: a continuation sheet starts when a table's page is full. */
export function rowCapacity(domain: TrainingDomain) {
  return capacity[domain];
}

export function sheetTables(domain: TrainingDomain): SheetTable[] {
  return domain === 'ssm' ? ['p', 's'] : ['p'];
}

export function tableRowKey(table: SheetTable, index: number): SheetRowKey {
  return `${table}${index}`;
}

const rowKeyPattern = /^(h1|h2|adm|[ps][1-9][0-9]*)$/;

export function isSheetRowKey(value: string): value is SheetRowKey {
  return rowKeyPattern.test(value);
}

export function tableRowOf(rowKey: SheetRowKey): { table: SheetTable; index: number } | null {
  const table = rowKey[0];
  if (table !== 'p' && table !== 's') return null;
  return { table, index: Number(rowKey.slice(1)) };
}

export type SheetRowFields = {
  /** Locked by the row's signatures. */
  text: string[];
  /** Filled with "anulat" when the row is voided, after its signatures, so never locked. */
  note: string | null;
  signatures: Partial<Record<SheetSignerSlot, string>>;
};

const hiringText: Record<TrainingDomain, Record<'h1' | 'h2', string[]>> = {
  ssm: {
    h1: ['date', 'duration', 'trainer', 'trainer_job_title', 'material'],
    h2: ['date', 'place', 'duration', 'trainer', 'trainer_job_title', 'material'],
  },
  psi: {
    h1: ['date', 'duration', 'trainer', 'trainer_job_title', 'material'],
    h2: ['date', 'place', 'occupation', 'duration', 'trainer', 'trainer_job_title', 'material'],
  },
};

const tableText = ['date', 'duration', 'occupation', 'material'];

// The fire-safety form has one signature beside the trainee's, the trainer's or, as its caption
// says, the one who verified, whom the record names as its trainer (ADR 021); no verifier's.
const rowSlots: Record<TrainingDomain, Exclude<SheetSignerSlot, 'admitter'>[]> = {
  ssm: ['trainee', 'trainer', 'verifier'],
  psi: ['trainee', 'trainer'],
};

const named = (rowKey: string, columns: string[]) => columns.map((column) => `${rowKey}_${column}`);

const signaturesOf = (domain: TrainingDomain, rowKey: string) =>
  Object.fromEntries(rowSlots[domain].map((slot) => [slot, `${rowKey}_sig_${slot}`]));

/** The fields of one row of the sheet; the admission is a row of its own, `adm`. */
export function sheetFieldNames(domain: TrainingDomain, rowKey: SheetRowKey): SheetRowFields {
  if (rowKey === 'adm') {
    return {
      text: named('adm', ['name', 'job_title', 'date']),
      note: null,
      // The fire-safety form's admission has no signature.
      signatures: domain === 'ssm' ? { admitter: 'adm_sig' } : {},
    };
  }
  if (rowKey === 'h1' || rowKey === 'h2') {
    return {
      text: named(rowKey, hiringText[domain][rowKey]),
      note: `${rowKey}_note`,
      signatures: signaturesOf(domain, rowKey),
    };
  }
  const row = tableRowOf(rowKey);
  if (!row || !sheetTables(domain).includes(row.table)) {
    throw new Error(`The ${domain} sheet has no row ${rowKey}.`);
  }
  if (row.index < 1 || row.index > rowCapacity(domain)) {
    throw new Error(
      `The ${domain} sheet holds ${rowCapacity(domain)} rows a table, not ${row.index}.`
    );
  }
  return {
    text: named(rowKey, tableText),
    note: `${rowKey}_note`,
    signatures: signaturesOf(domain, rowKey),
  };
}

/**
 * The field a slot of the record on `rowKey` signs; null where the form has no signature for it.
 * The workplace record's admitter signs the admission block.
 */
export function signatureFieldOf(
  domain: TrainingDomain,
  rowKey: SheetRowKey,
  slot: SheetSignerSlot
): string | null {
  const fields = sheetFieldNames(domain, slot === 'admitter' && rowKey === 'h2' ? 'adm' : rowKey);
  return fields.signatures[slot] ?? null;
}

/**
 * What a signature on the record's row locks: the row's text, and on the workplace training's row
 * the admission's too, since one record fills both. Never a signature field still to be signed,
 * and never the note, which a void fills after the signatures.
 */
export function lockFieldsOf(domain: TrainingDomain, rowKey: SheetRowKey): string[] {
  const text = sheetFieldNames(domain, rowKey).text;
  return rowKey === 'h2' ? [...text, ...sheetFieldNames(domain, 'adm').text] : text;
}

export function sheetRowKeys(domain: TrainingDomain): SheetRowKey[] {
  return [
    'h1',
    'h2',
    'adm',
    ...sheetTables(domain).flatMap((table) =>
      Array.from({ length: rowCapacity(domain) }, (_, index) => tableRowKey(table, index + 1))
    ),
  ];
}
