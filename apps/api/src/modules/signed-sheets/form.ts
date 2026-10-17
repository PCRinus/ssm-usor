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
  type TrainingDomain,
  type TrainingPhase,
  type TrainingSource,
} from '@ssm-usor/contracts';

import { printedDate } from '../documents/context';
import {
  buildTrainingSheetData,
  chronological,
  hoursOf,
  materialOf,
  paperForm,
  type SheetRecord,
  type TrainingSheetData,
  type TrainingSheetFacts,
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

export function signedSheetData(
  facts: Omit<TrainingSheetFacts, 'domain' | 'records'>,
  domain: TrainingDomain,
  sequence: number,
  printed: PrintedRow[]
): TrainingSheetData {
  const data = buildTrainingSheetData({
    ...facts,
    domain,
    records: printed.map((row) => row.record),
  });
  const keys = new Set<string>(printed.map((row) => row.rowKey));
  const form = paperForm(domain);
  return {
    ...data,
    blankRows: { periodic: [], supplementary: [] },
    form: {
      on: true,
      continuation: continuationLine(sequence),
      h1: { paper: keys.has('h1') },
      h2: { paper: keys.has('h2') },
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

/** How many characters of 8 pt text a line of the field holds, and how many lines it has. */
type Box = { chars: number; lines: number };

// The en spaces build_sheets.py puts on each line of the field's placeholder, which LibreOffice
// sizes the field by; 8 pt text averages about as wide as an en space.
const tableBoxes: Record<TrainingDomain, Record<string, Box>> = {
  ssm: { occupation: { chars: 14, lines: 3 }, material: { chars: 29, lines: 3 } },
  psi: { occupation: { chars: 16, lines: 3 }, material: { chars: 33, lines: 3 } },
};
const hiringBoxes: Record<string, Box> = { material: { chars: 72, lines: 3 } };

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

/**
 * The text broken into lines that keep the field's proportions, since the signer shrinks what it
 * writes to fit the field but does not wrap it: a text too long for the field gets more and
 * shorter-per-box lines, which the signer then scales down evenly.
 */
export function wrapToBox(text: string, box: Box) {
  for (let scale = 1; scale < 8; scale += 0.1) {
    const lines = linesAt(text, Math.floor(box.chars * scale));
    if (lines.length <= Math.floor(box.lines * scale)) return lines.join('\n');
  }
  return linesAt(text, box.chars * 8).join('\n');
}

function boxed(values: Record<string, string>, boxes: Record<string, Box>, rowKey: string) {
  return Object.fromEntries(
    Object.entries(values).map(([column, value]) => {
      const box = boxes[column];
      return [`${rowKey}_${column}`, box ? wrapToBox(value, box) : value];
    })
  );
}

/** `place` is the employee's place of work, which the workplace training prints. */
export function rowValues(
  domain: TrainingDomain,
  rowKey: SheetRowKey,
  record: SheetTrainingRecord,
  place: string
): Record<string, string> {
  const { training } = record;
  const note = { [`${rowKey}_note`]: record.source === 'paper' ? paperSigned : '' };
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
