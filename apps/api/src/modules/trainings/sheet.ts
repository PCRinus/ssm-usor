import {
  type EmployeeTrainingRecord,
  type KnowledgeTest,
  type MissingSheetData,
  sheetRowKeys,
  supplementaryTrainingReasonLabels,
  tableRowOf,
  testGradeLabels,
  testRowCapacity,
  type TrainingDomain,
  type TrainingPhase,
} from '@ssm-usor/contracts';

import { countOf, runOn, withoutFinalStop } from '../../lib/romanian';
import { printedDate } from '../documents/context';
import { gapRules } from '../documents/gaps';

/**
 * While the signatures are collected on paper the printed sheet is the signed original, so each
 * periodic table runs on in blank rows to the end of its page (ADR 021). Turned off when the
 * electronic signature ships; planned sessions are never pre-printed either way.
 */
export const paperSignatureRows = true;

export type SheetRecord = Pick<EmployeeTrainingRecord, 'occupation' | 'admission'> & {
  training: Pick<
    EmployeeTrainingRecord['training'],
    | 'phase'
    | 'heldOn'
    | 'durationMinutes'
    | 'material'
    | 'trainer'
    | 'verifier'
    | 'supplementaryReason'
    | 'createdAt'
  >;
};

export type SheetTestResult = {
  test: KnowledgeTest;
  takenOn: string;
  material: string;
  examiner: { name: string; jobTitle: string } | null;
  createdAt: string;
};

export function toSheetTestResult(row: {
  test: SheetTestResult['test'];
  taken_on: string;
  material: string;
  examiner_name: string | null;
  examiner_job_title: string | null;
  created_at: string;
}): SheetTestResult {
  return {
    test: row.test,
    takenOn: row.taken_on,
    material: row.material,
    examiner:
      row.examiner_name !== null && row.examiner_job_title !== null
        ? { name: row.examiner_name, jobTitle: row.examiner_job_title }
        : null,
    createdAt: row.created_at,
  };
}

type Workplace = { id: string; name: string };

export type TrainingSheetFacts = {
  domain: TrainingDomain;
  branding: boolean;
  client: {
    legalName: string;
    // Two at most are needed: whether there are several, and the only one when there is one.
    activeWorkplaces: Workplace[];
  };
  employee: {
    lastName: string;
    firstName: string;
    employeeNumber: string | null;
    contractTitle: string;
    homeAddress: string | null;
    birthDate: string | null;
    birthPlace: string | null;
    bloodGroup: string | null;
    rhFactor: string | null;
    qualification: string | null;
    education: string | null;
    authorizations: string | null;
    commuteRoute: string | null;
    commuteMinutes: number | null;
    workplace: Workplace | null;
    position: { name: string; workZone: string | null };
  };
  /** The employee's training records of `domain`. */
  records: SheetRecord[];
  testResults: SheetTestResult[];
};

export type SheetIdentity = Omit<TrainingSheetFacts, 'domain' | 'records' | 'testResults'>;

/** Every value is text, empty where the form leaves its line blank. */
export type HiringLine = {
  heldOn: string;
  hours: string;
  trainer: string;
  trainerJobTitle: string;
  material: string;
  occupation: string;
  place: string;
};

export type SheetRow = {
  heldOn: string;
  hours: string;
  occupation: string;
  material: string;
  trainer: string;
  verifier: string;
};

export type TestResultRow = { date: string; material: string; grade: string; examiner: string };

export type TrainingSheetData = {
  branding: boolean;
  client: { legalName: string };
  employee: {
    name: string;
    employeeNumber: string;
    bloodGroup: string;
    homeAddress: string;
    birth: string;
    qualification: string;
    education: string;
    contractTitle: string;
    workplace: string;
    authorizations: string;
    commute: string;
  };
  hiring: { introductory: HiringLine; workplace: HiringLine };
  admission: { admittedOn: string; name: string; jobTitle: string };
  periodic: SheetRow[];
  supplementary: SheetRow[];
  /** Occupational safety only: the fire-safety sheet prints a pass as a periodic row. */
  testResults: TestResultRow[];
  blankRows: {
    periodic: Record<string, never>[];
    supplementary: Record<string, never>[];
    testResults: Record<string, never>[];
  };
  /** The names printed small under the hiring trainings' signature lines, per slot. */
  signers: {
    introductory: { trainer: string; verifier: string };
    workplace: { trainer: string; verifier: string };
  };
  form: SheetForm;
};

/**
 * Which variant of each part the template prints: the paper sheet with `on` false, else the signed
 * sheet's form (ADR 023), where a hiring block recorded from a paper sheet prints as text marked
 * signed on paper, and a table row prints its fields where `rows` holds it (signed-sheet.ts).
 */
export type SheetForm = {
  on: boolean;
  /** The line under the title of a continuation sheet; empty on the first. */
  continuation: string;
  /**
   * `materialPlaceholder` is the lines of en spaces the hiring block's material field is drawn
   * over, which the field takes its height from (signed-sheets/form.ts); empty on paper.
   */
  h1: { paper: boolean; materialPlaceholder: string };
  h2: { paper: boolean; materialPlaceholder: string };
  rows: Record<string, boolean>;
};

export function paperForm(domain: TrainingDomain): SheetForm {
  const rows = Object.fromEntries(
    sheetRowKeys(domain)
      .filter((key) => tableRowOf(key))
      .map((key) => [key, false])
  );
  return {
    on: false,
    continuation: '',
    h1: { paper: false, materialPlaceholder: '' },
    h2: { paper: false, materialPlaceholder: '' },
    rows,
  };
}

export function missingSheetDataOf(
  facts: Pick<TrainingSheetFacts, 'domain' | 'employee' | 'client'>
): MissingSheetData[] {
  const missing: MissingSheetData[] = [];
  if (facts.domain === 'ssm' && !facts.employee.commuteRoute?.trim()) {
    missing.push('employee.commute_route');
  }
  if (!facts.employee.workplace && facts.client.activeWorkplaces.length > 1) {
    missing.push('employee.workplace');
  }
  return missing;
}

/** Whole hours as "2", any other duration with one decimal and a comma: "1,5". */
export function hoursOf(minutes: number) {
  const tenths = Math.round(minutes / 6);
  return tenths % 10 === 0 ? String(tenths / 10) : `${Math.floor(tenths / 10)},${tenths % 10}`;
}

const text = (value: string | null | undefined) => value?.trim() ?? '';
const joined = (separator: string, ...parts: (string | null | undefined)[]) =>
  parts.map(text).filter(Boolean).join(separator);

export const chronological = (a: SheetRecord, b: SheetRecord) =>
  a.training.heldOn.localeCompare(b.training.heldOn) ||
  a.training.createdAt.localeCompare(b.training.createdAt);

// A hiring training recorded twice, after a change of post, prints the later one.
const latest = (records: SheetRecord[], phase: TrainingPhase) =>
  records
    .filter((record) => record.training.phase === phase)
    .sort(chronological)
    .at(-1) ?? null;

export function placeOfWork(facts: Pick<TrainingSheetFacts, 'employee' | 'client'>) {
  const { employee, client } = facts;
  const workplace =
    employee.workplace ??
    (client.activeWorkplaces.length === 1 ? client.activeWorkplaces[0] : null);
  return joined(' – ', workplace?.name, employee.position.workZone);
}

export const materialOf = (record: SheetRecord) => {
  const reason = record.training.supplementaryReason;
  const taught = text(record.training.material);
  if (!reason) return taught;
  return `${withoutFinalStop(taught)} (motivul: ${runOn(supplementaryTrainingReasonLabels[reason])})`;
};

function hiringLine(record: SheetRecord | null, place: string): HiringLine {
  if (!record) {
    return {
      heldOn: '',
      hours: '',
      trainer: '',
      trainerJobTitle: '',
      material: '',
      occupation: '',
      place,
    };
  }
  const { training } = record;
  return {
    heldOn: printedDate(training.heldOn),
    hours: hoursOf(training.durationMinutes),
    trainer: training.trainer.name,
    trainerJobTitle: training.trainer.jobTitle,
    material: materialOf(record),
    occupation: record.occupation,
    place,
  };
}

// On the fire-safety sheet the one signature beside the trainee's is the person who verified,
// which the record names as its trainer when it has no verifier of its own (ADR 021).
function signersOf(domain: TrainingDomain, record: SheetRecord | null) {
  if (!record) return { trainer: '', verifier: '' };
  const { trainer, verifier } = record.training;
  return {
    trainer: trainer.name,
    verifier: verifier?.name ?? (domain === 'psi' ? trainer.name : ''),
  };
}

export const examinerOf = (result: Pick<SheetTestResult, 'examiner'>) =>
  result.examiner ? joined(', ', result.examiner.name, result.examiner.jobTitle) : '';

export const testResultRow = (result: SheetTestResult): TestResultRow => ({
  date: printedDate(result.takenOn),
  material: text(result.material),
  grade: testGradeLabels.admis,
  examiner: examinerOf(result),
});

/**
 * The fire-safety form has no test block, so a pass prints as a row of its periodic table, as
 * OMAI 712/2005 art. 30 has the annual one recorded there (ADR 024): the material says the test
 * and its grade, the examiner signs where the trainer does, and no duration is printed.
 */
export const periodicTestMaterial = (result: Pick<SheetTestResult, 'material'>) =>
  `${withoutFinalStop(text(result.material))}: ${testGradeLabels.admis.toLocaleLowerCase('ro')}`;

const testSheetRow = (result: SheetTestResult, occupation: string): SheetRow => ({
  heldOn: printedDate(result.takenOn),
  hours: '',
  occupation,
  material: periodicTestMaterial(result),
  trainer: result.examiner?.name ?? '',
  verifier: '',
});

export const chronologicalResults = (a: SheetTestResult, b: SheetTestResult) =>
  a.takenOn.localeCompare(b.takenOn) || a.createdAt.localeCompare(b.createdAt);

const sheetRow = (record: SheetRecord): SheetRow => ({
  heldOn: printedDate(record.training.heldOn),
  hours: hoursOf(record.training.durationMinutes),
  occupation: record.occupation,
  material: materialOf(record),
  trainer: record.training.trainer.name,
  verifier: record.training.verifier?.name ?? '',
});

/**
 * How many rows of the minimum height fit on a page of the periodic table, its heading and
 * column heads included, measured on LibreOffice's PDF of each template; the fire-safety table
 * starts a page lower than it continues, under its heading.
 */
const tableLayout = {
  ssm: { firstPage: 17, nextPages: 17, material: 27, occupation: 13 },
  psi: { firstPage: 17, nextPages: 18, material: 31, occupation: 15 },
} as const;
const rowTwips = 680;
const lineTwips = 184;
const cellPaddingTwips = 80;

function linesOf(value: string, perLine: number) {
  let lines = 1;
  let used = 0;
  for (const word of value.split(/\s+/).filter(Boolean)) {
    const length = word.length + (used > 0 ? 1 : 0);
    if (used + length > perLine && used > 0) {
      lines += Math.ceil(word.length / perLine);
      used = word.length % perLine;
    } else {
      used += length;
    }
  }
  return lines;
}

export function blankRowsAfter(rows: SheetRow[], domain: TrainingDomain) {
  if (!paperSignatureRows) return [];
  const layout = tableLayout[domain];
  let left = layout.firstPage * rowTwips;
  for (const row of rows) {
    const lines = Math.max(
      linesOf(row.material, layout.material),
      linesOf(row.occupation, layout.occupation)
    );
    const height = Math.max(rowTwips, lines * lineTwips + cellPaddingTwips);
    left = height > left ? layout.nextPages * rowTwips - height : left - height;
  }
  return Array.from({ length: Math.floor(left / rowTwips) }, () => ({}));
}

function sheetParts(facts: TrainingSheetFacts) {
  const { domain, employee, records } = facts;
  const place = placeOfWork(facts);
  const introductory = latest(records, 'introductory_general');
  const workplace = latest(records, 'workplace');
  const periodic = [
    ...records
      .filter(
        (record) =>
          record.training.phase === 'periodic' ||
          (domain === 'psi' && record.training.phase === 'supplementary')
      )
      .map((record) => ({
        day: record.training.heldOn,
        createdAt: record.training.createdAt,
        row: sheetRow(record),
      })),
    ...(domain === 'psi'
      ? facts.testResults.map((result) => ({
          day: result.takenOn,
          createdAt: result.createdAt,
          row: testSheetRow(result, employee.position.name.trim()),
        }))
      : []),
  ]
    .sort((a, b) => a.day.localeCompare(b.day) || a.createdAt.localeCompare(b.createdAt))
    .map(({ row }) => row);
  const testResults =
    domain === 'ssm' ? [...facts.testResults].sort(chronologicalResults).map(testResultRow) : [];
  const supplementary =
    domain === 'ssm'
      ? records
          .filter((record) => record.training.phase === 'supplementary')
          .sort(chronological)
          .map(sheetRow)
      : [];
  const admission = workplace?.admission ?? null;
  return {
    branding: () => facts.branding,
    client: () => ({ legalName: facts.client.legalName }),
    employee: () => ({
      name: `${employee.lastName.trim().toLocaleUpperCase('ro')} ${employee.firstName.trim()}`,
      employeeNumber: text(employee.employeeNumber),
      bloodGroup: joined(' ', employee.bloodGroup, employee.rhFactor && `Rh${employee.rhFactor}`),
      homeAddress: text(employee.homeAddress),
      birth: joined(
        ', ',
        employee.birthDate && printedDate(employee.birthDate),
        employee.birthPlace
      ),
      qualification: text(employee.qualification),
      education: text(employee.education),
      contractTitle: text(employee.contractTitle),
      workplace: place,
      authorizations: text(employee.authorizations),
      commute: joined(
        ' ',
        employee.commuteRoute && withoutFinalStop(employee.commuteRoute.trim()),
        employee.commuteMinutes ? `(${countOf(employee.commuteMinutes, 'minut', 'minute')})` : null
      ),
    }),
    hiring: () => ({
      introductory: hiringLine(introductory, ''),
      workplace: hiringLine(workplace, place),
    }),
    admission: () => ({
      admittedOn: admission ? printedDate(admission.admittedOn) : '',
      name: admission?.name ?? '',
      jobTitle: admission?.jobTitle ?? '',
    }),
    periodic: () => periodic,
    supplementary: () => supplementary,
    testResults: () => testResults,
    blankRows: () => ({
      periodic: blankRowsAfter(periodic, domain),
      supplementary: domain === 'ssm' ? blankRowsAfter(supplementary, domain) : [],
      // Annex 11 prints five rows whatever the signatures are collected on.
      testResults:
        domain === 'ssm'
          ? Array.from({ length: Math.max(0, testRowCapacity - testResults.length) }, () => ({}))
          : [],
    }),
    signers: () => ({
      introductory: signersOf(domain, introductory),
      workplace: signersOf(domain, workplace),
    }),
    form: () => paperForm(domain),
  };
}

const sheetGaps = gapRules<TrainingSheetFacts, MissingSheetData, TrainingSheetData>({
  missing: missingSheetDataOf,
  printedAs: { 'employee.commute_route': ['employee'], 'employee.workplace': ['employee'] },
  parts: sheetParts,
});

/** Throws while `missingSheetDataOf` names anything: check the readiness first. */
export const buildTrainingSheetData: (facts: TrainingSheetFacts) => TrainingSheetData =
  sheetGaps.build;

export function trainingSheetFileName(
  domain: TrainingDomain,
  employee: Pick<TrainingSheetFacts['employee'], 'lastName' | 'firstName'>
) {
  const words = `${employee.lastName} ${employee.firstName}`
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase());
  return `Fisa-${domain.toUpperCase()}-${words.join('-')}.pdf`;
}
