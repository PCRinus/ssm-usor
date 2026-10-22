import {
  rowCapacity,
  sheetFieldNames,
  type SheetRowKey,
  sheetRowKeys,
  type SheetSignerSlot,
  type SheetTable,
  sheetTables,
  tableRowKey,
  tableRowOf,
  testGradeLabels,
  type TrainingDomain,
  type TrainingPhase,
  type TrainingSource,
} from '@ssm-usor/contracts';

import { printedDate } from '../documents/context';
import {
  buildTrainingSheetData,
  chronological,
  examinerOf,
  hoursOf,
  materialOf,
  paperForm,
  periodicTestMaterial,
  type SheetIdentity,
  type SheetRecord,
  type SheetTestResult,
  type TrainingSheetData,
} from '../trainings/sheet';

export type SheetTrainingRecord = SheetRecord & {
  id: string;
  employeeId: string;
  domain: TrainingDomain;
  source: TrainingSource;
};

export const paperSigned = 'semnat pe hârtie';
export const voidedNote = 'anulat';

export function rowKindOf(domain: TrainingDomain, phase: TrainingPhase): 'h1' | 'h2' | SheetTable {
  switch (phase) {
    case 'introductory_general':
      return 'h1';
    case 'workplace':
      return 'h2';
    case 'periodic':
      return 'p';
    case 'supplementary':
      return domain === 'ssm' ? 's' : 'p';
  }
}

export type PrintedRow = { rowKey: SheetRowKey; record: SheetTrainingRecord };

/**
 * The records signed on paper (`source` paper) that a new employee's first sheet prints as text,
 * marked signed on paper, in the rows they take first; a table that holds more runs on to the
 * continuation sheets. A hiring training prints only when it is the latest of its phase, the one
 * the sheet shows; a later one recorded in the app takes the block's fields instead.
 */
export function printedSheets(
  domain: TrainingDomain,
  records: SheetTrainingRecord[]
): PrintedRow[][] {
  const hiring = (['h1', 'h2'] as const).flatMap((rowKey) => {
    const latest = records
      .filter((record) => rowKindOf(domain, record.training.phase) === rowKey)
      .sort(chronological)
      .at(-1);
    return latest?.source === 'paper' ? [{ rowKey, record: latest }] : [];
  });
  const capacity = rowCapacity(domain);
  const tables = sheetTables(domain).map((table) =>
    records
      .filter(
        (record) => record.source === 'paper' && rowKindOf(domain, record.training.phase) === table
      )
      .sort(chronological)
      .map((record, index) => ({ table, index, record }))
  );
  const count = Math.max(1, ...tables.map((rows) => Math.ceil(rows.length / capacity)));
  return Array.from({ length: count }, (_, sheet) => [
    ...(sheet === 0 ? hiring : []),
    ...tables.flatMap((rows) =>
      rows.slice(sheet * capacity, (sheet + 1) * capacity).map(({ table, index, record }) => ({
        rowKey: tableRowKey(table, index - sheet * capacity + 1),
        record,
      }))
    ),
  ]);
}

export function continuationLine(sequence: number) {
  return sequence > 1 ? `Fișa nr. ${sequence}, în continuarea fișei nr. ${sequence - 1}` : '';
}

export type HiringMaterials = Partial<Record<'h1' | 'h2', string>>;

/**
 * `materials` are the hiring trainings recorded in the app that the sheet is drawn up with, whose
 * material fields are then drawn as tall as their text.
 */
export function signedSheetData(
  facts: SheetIdentity,
  domain: TrainingDomain,
  sequence: number,
  printed: PrintedRow[],
  materials: HiringMaterials = {}
): TrainingSheetData {
  // A result is never printed as text: every one takes a row of fields, as the app records it.
  const data = buildTrainingSheetData({
    ...facts,
    domain,
    records: printed.map((row) => row.record),
    testResults: [],
  });
  const keys = new Set<string>(printed.map((row) => row.rowKey));
  const form = paperForm(domain);
  return {
    ...data,
    blankRows: { periodic: [], supplementary: [], testResults: [] },
    form: {
      on: true,
      continuation: continuationLine(sequence),
      h1: { paper: keys.has('h1'), materialPlaceholder: materialPlaceholder(materials.h1) },
      h2: { paper: keys.has('h2'), materialPlaceholder: materialPlaceholder(materials.h2) },
      rows: Object.fromEntries(Object.keys(form.rows).map((key) => [key, !keys.has(key)])),
    },
  };
}

export function signatureFieldsOf(domain: TrainingDomain, printed: PrintedRow[]) {
  const keys = new Set<string>(printed.map((row) => row.rowKey));
  if (keys.has('h2')) keys.add('adm');
  return sheetRowKeys(domain)
    .filter((key) => !keys.has(key))
    .flatMap((key) => Object.values(sheetFieldNames(domain, key).signatures));
}

/** How many characters a line of the field holds at its size, and how many lines it has. */
type Box = { chars: number; lines: number };

// The en spaces on each line of the field's placeholder, which LibreOffice sizes the field by;
// text averages about as wide as an en space of its size. A table's boxes are build_sheets.py's
// placeholders at 8 pt; the hiring material's is drawn here (`materialPlaceholder`) at 10 pt.
const tableBoxes: Record<TrainingDomain, Record<string, Box>> = {
  ssm: { occupation: { chars: 14, lines: 3 }, material: { chars: 29, lines: 3 } },
  psi: { occupation: { chars: 16, lines: 3 }, material: { chars: 33, lines: 3 } },
};
const testBoxes: Record<string, Box> = {
  material: { chars: 47, lines: 3 },
  examiner: { chars: 25, lines: 2 },
};
const hiringBoxes: Record<string, Box> = { material: { chars: 57, lines: 7 } };

function linesAt(text: string, width: number) {
  const lines: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const last = lines.at(-1);
    if (last !== undefined && last.length + 1 + word.length <= width) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
  }
  return lines;
}

// The signer does not wrap: it sets a text too long for its field in a smaller size. Lines in
// the field's proportions lose the least size.
export function wrapToBox(text: string, box: Box) {
  for (let scale = 1; scale < 8; scale += 0.1) {
    const lines = linesAt(text, Math.floor(box.chars * scale));
    if (lines.length <= Math.floor(box.lines * scale)) return lines.join('\n');
  }
  return linesAt(text, box.chars * 8).join('\n');
}

/**
 * The lines of en spaces a hiring block's material field is drawn over, which LibreOffice sizes
 * the field by: as many as the material wraps to when the sheet is drawn up with it, else as
 * many as the box holds, for a material recorded later.
 */
export function materialPlaceholder(material?: string) {
  const box = hiringBoxes.material!;
  const lines = material === undefined ? box.lines : wrapToBox(material, box).split('\n').length;
  return Array.from({ length: lines }, () => '\u2002'.repeat(box.chars)).join('\n');
}

function boxed(values: Record<string, string>, boxes: Record<string, Box>, rowKey: string) {
  return Object.fromEntries(
    Object.entries(values).map(([column, value]) => {
      const box = boxes[column];
      return [`${rowKey}_${column}`, box ? wrapToBox(value, box) : value];
    })
  );
}

/**
 * `place` is the employee's place of work, which the workplace training prints. `byHand` is true
 * when nobody is asked to sign the record electronically, which the note then says, as it does for
 * a record from paper.
 */
export function rowValues(
  domain: TrainingDomain,
  rowKey: SheetRowKey,
  record: SheetTrainingRecord,
  place: string,
  byHand = false
): Record<string, string> {
  const { training } = record;
  const note = {
    [`${rowKey}_note`]: record.source === 'paper' || byHand ? paperSigned : '',
  };
  if (tableRowOf(rowKey)) {
    return {
      ...boxed(
        {
          date: printedDate(training.heldOn),
          duration: hoursOf(training.durationMinutes),
          occupation: record.occupation,
          material: materialOf(record),
        },
        tableBoxes[domain],
        rowKey
      ),
      ...note,
    };
  }
  const hiring: Record<string, string> = {
    date: printedDate(training.heldOn),
    duration: hoursOf(training.durationMinutes),
    trainer: training.trainer.name,
    trainer_job_title: training.trainer.jobTitle,
    material: materialOf(record),
  };
  if (rowKey === 'h2') {
    hiring.place = place;
    if (domain === 'psi') hiring.occupation = record.occupation;
  }
  const values = { ...boxed(hiring, hiringBoxes, rowKey), ...note };
  if (rowKey !== 'h2') return values;
  const { admission } = record;
  return {
    ...values,
    adm_name: admission?.name ?? '',
    adm_job_title: admission?.jobTitle ?? '',
    adm_date: admission ? printedDate(admission.admittedOn) : '',
  };
}

/**
 * A test result's row: on the occupational safety sheet annex 11's four columns of a `t` row; on
 * the fire-safety sheet a periodic row, with no duration and the examiner after the material,
 * since the row's one other column is a signature nobody gives (ADR 024). `occupation` is the
 * employee's position, which the fire-safety row prints.
 */
export function resultRowValues(
  domain: TrainingDomain,
  rowKey: SheetRowKey,
  result: SheetTestResult,
  occupation: string
): Record<string, string> {
  const note = { [`${rowKey}_note`]: '' };
  if (domain === 'ssm') {
    return {
      ...boxed(
        {
          date: printedDate(result.takenOn),
          material: result.material.trim(),
          grade: testGradeLabels.admis,
          examiner: examinerOf(result),
        },
        testBoxes,
        rowKey
      ),
      ...note,
    };
  }
  const examiner = examinerOf(result);
  return {
    ...boxed(
      {
        date: printedDate(result.takenOn),
        duration: '',
        occupation,
        material: examiner
          ? `${periodicTestMaterial(result)} (examinator: ${examiner})`
          : periodicTestMaterial(result),
      },
      tableBoxes[domain],
      rowKey
    ),
    ...note,
  };
}

const slotLabels: Record<SheetSignerSlot, string> = {
  trainee: 'semnătura celui instruit',
  trainer: 'semnătura celui care a instruit',
  verifier: 'semnătura celui care a verificat instruirea',
  admitter: 'admiterea la lucru',
};

export function signatureReason(record: SheetTrainingRecord, slot: SheetSignerSlot) {
  return `Instruirea din ${printedDate(record.training.heldOn)}: ${slotLabels[slot]}`;
}

const romanianDay = new Intl.DateTimeFormat('ro-RO', {
  timeZone: 'Europe/Bucharest',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function signedOn(moment: Date) {
  return romanianDay.format(moment);
}
