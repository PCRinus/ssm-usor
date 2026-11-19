import { isValidCnp } from './cnp';
import { parseCommuteMeansKey } from './commute-means';
import { bloodGroups, employeeTextLimits, rhFactors } from './employees';
import { foldText } from './fold-text';
import { sameHomeAddress } from './home-address';
import type { EmployeeImportFieldName } from './imports';
import { foldName } from './name-match';
import {
  inMinutesRange,
  supplementaryTrainingReasons,
  type TrainingDomain,
  type TrainingPhase,
} from './trainings';

// The confirm and the review in the app both run these, so the review shows what confirming takes
// (ADR 032).

type FieldValue = string | number;

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const employeeTextLimitsOf = (
  name: EmployeeImportFieldName
): readonly [number, number] | undefined =>
  (employeeTextLimits as Partial<Record<EmployeeImportFieldName, readonly [number, number]>>)[name];

export function employeeImportValueAllowed(name: EmployeeImportFieldName, value: FieldValue) {
  if (name === 'cnp') return typeof value === 'string' && isValidCnp(value);
  if (name === 'bloodGroup') return (bloodGroups as readonly FieldValue[]).includes(value);
  if (name === 'rhFactor') return (rhFactors as readonly FieldValue[]).includes(value);
  if (name === 'commuteMinutes') {
    return inMinutesRange(value);
  }
  if (name === 'birthDate' || name === 'hiredAt' || name === 'leftOn') {
    return typeof value === 'string' && isoDate.test(value);
  }
  if (name === 'commuteMeans') {
    return typeof value === 'string' && parseCommuteMeansKey(value) !== null;
  }
  const limits = employeeTextLimitsOf(name);
  if (!limits || typeof value !== 'string') return typeof value === 'string';
  return value.trim().length >= limits[0] && value.trim().length <= limits[1];
}

export const employeeImportValuesDiffer = (
  name: EmployeeImportFieldName,
  a: FieldValue,
  b: FieldValue
) =>
  typeof a === 'number' || typeof b === 'number'
    ? Number(a) !== Number(b)
    : name === 'homeAddress' || name === 'residenceAddress'
      ? !sameHomeAddress(a, b)
      : foldText(a) !== foldText(b);

export type ImportedFieldOption<V extends FieldValue> = { value: V; pageIds: readonly string[] };

export type ResolvedImportField<V extends FieldValue, O extends ImportedFieldOption<V>> = {
  value: V | null;
  own: (O & { index: number })[];
  // The pages disagree, the app has no value to settle it, and the member has not chosen.
  choice: boolean;
  // The member chose an option the proposal no longer has.
  missingOption: boolean;
  edited: boolean;
  // A sheet's value set over a different one the app has.
  replace: boolean;
};

/**
 * A person's field as confirming takes it. `field.app` is the existing employee's value, and is
 * left out for someone new, a declined match included; `pages` are the person's own.
 */
export function resolveEmployeeImportField<V extends FieldValue, O extends ImportedFieldOption<V>>(
  name: EmployeeImportFieldName,
  field: { options: readonly O[]; app?: V | null },
  change: { option?: number; value?: V | null; replace?: boolean } | undefined,
  pages: ReadonlySet<string>
): ResolvedImportField<V, O> {
  const own = field.options
    .map((option, index) => ({ ...option, index }))
    .filter((option) => option.pageIds.some((id) => pages.has(id)));
  const base = { own, choice: false, missingOption: false, replace: false };
  if (change?.value !== undefined) {
    return {
      ...base,
      value: change.value,
      edited: true,
      replace: field.app !== undefined && change.value !== field.app,
    };
  }
  const app = field.app ?? null;
  const edited = change?.option !== undefined;
  let value: V | null = null;
  let choice = false;
  let missingOption = false;
  if (change?.option !== undefined) {
    value = field.options[change.option]?.value ?? null;
    missingOption = value === null;
  } else if (own.length === 1) {
    value = own[0]!.value;
  } else if (own.length > 1) {
    // Kept by default, the app's value settles a choice between the pages.
    choice = app === null;
    value = app;
  }
  if (value === null || app === null) {
    return { ...base, value: value ?? app, choice, missingOption, edited };
  }
  const replace = employeeImportValuesDiffer(name, app, value) && change?.replace === true;
  return { ...base, value: replace ? value : app, choice, edited, replace };
}

/**
 * Whether a person is written unless the member decides otherwise: a leaver is proposed unticked,
 * by the leave date as the member left it.
 */
export function personIncludedByDefault(leftOn: string | null, existing: boolean) {
  // An existing employee is completed either way; leaving is then a choice on the leave date.
  return leftOn === null || existing;
}

// The test closes the introductory general training for occupational safety and the workplace
// training for fire safety, whose one test closes both (ADR 024).
export const hiringTestPhases: Record<TrainingDomain, readonly TrainingPhase[]> = {
  ssm: ['introductory_general'],
  su: ['workplace', 'introductory_general'],
};

type HiringTestRow = {
  id: string;
  domain: TrainingDomain;
  phase: TrainingPhase;
  heldOn: string | null;
  testOnly: boolean;
  test: { test: string } | null;
};

/**
 * The rows whose paper hiring test is written, one a domain: the newest of the phase the test
 * closes, among the rows the person's pages now hold, with the dates as the member left them.
 */
export function hiringTestRowIds(rows: readonly HiringTestRow[]): Set<string> {
  const ids = new Set<string>();
  for (const domain of ['ssm', 'su'] as const) {
    const phase = hiringTestPhases[domain].find((each) =>
      rows.some((row) => row.domain === domain && row.phase === each && !row.testOnly)
    );
    const newest = rows
      .filter(
        (row) =>
          row.domain === domain &&
          row.phase === phase &&
          !row.testOnly &&
          row.test?.test === 'hiring'
      )
      .sort((a, b) => (b.heldOn ?? '').localeCompare(a.heldOn ?? ''))[0];
    if (newest) ids.add(newest.id);
  }
  return ids;
}

const sameTrimmed = (a: unknown, b: unknown) =>
  (typeof a === 'string' ? a.trim() : (a ?? null)) ===
  (typeof b === 'string' ? b.trim() : (b ?? null));

/**
 * A row's value as the member left it. A value an older proposal took from the client's themes is
 * no reading of the sheet, so it counts as empty unless the member typed one (ADR 042).
 */
export function reviewedRowValue(
  values: Readonly<Record<string, unknown>> | undefined,
  name: string,
  proposed: unknown,
  themed: boolean
): unknown {
  // The row dialogs saved every field on any edit, so a stored change equal to the themed value
  // is that save, not a value the member typed.
  if (values && name in values && !(themed && sameTrimmed(values[name], proposed))) {
    return values[name];
  }
  return themed ? null : proposed;
}

type ExaminerRow = {
  signatures: { verifier: string };
  verifierName: string | null;
  fromThemes: readonly string[];
  test: { examinerName: string | null; examinerJobTitle: string | null } | null;
};

/**
 * The examiner a row's test names, as the member left it: the verifier's box, else the trainer's,
 * never a trainer an older proposal took from the client's themes.
 */
export function rowExaminer(
  row: ExaminerRow,
  values: Readonly<Record<string, unknown>> | undefined
) {
  const byVerifier = row.signatures.verifier !== 'no_box' && row.verifierName !== null;
  const stored = values ?? {};
  // An examiner is a name and a function together: once the member typed one, the other saved
  // with it is theirs too, else a function equal to the themed one could never be kept.
  const typed = (['examinerName', 'examinerJobTitle'] as const).some(
    (name) => name in stored && !sameTrimmed(stored[name], row.test?.[name] ?? null)
  );
  const examiner = (name: 'examinerName' | 'examinerJobTitle', trainer: string) =>
    reviewedRowValue(
      values,
      name,
      row.test?.[name] ?? null,
      !(typed && name in stored) && !byVerifier && row.fromThemes.includes(trainer)
    ) as string | null;
  return {
    examinerName: examiner('examinerName', 'trainerName'),
    examinerJobTitle: examiner('examinerJobTitle', 'trainerJobTitle'),
  };
}

const filled = (value: unknown) =>
  value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '');

type TrainingRowField = 'heldOn' | 'durationMinutes' | 'supplementaryReason';

export type TrainingRowProblem = { field: TrainingRowField; problem: 'missing' | 'invalid' };

export function trainingRowProblems(
  values: Readonly<Record<TrainingRowField, unknown>>,
  phase: TrainingPhase,
  today: string
): TrainingRowProblem[] {
  const { heldOn, durationMinutes, supplementaryReason } = values;
  // A paper training holds what its sheet writes: only its day is needed (ADR 042).
  const required: TrainingRowField[] =
    phase === 'supplementary' ? ['heldOn', 'supplementaryReason'] : ['heldOn'];
  const problems: TrainingRowProblem[] = required
    .filter((field) => !filled(values[field]))
    .map((field) => ({ field, problem: 'missing' }));
  if (filled(heldOn) && (!isoDate.test(String(heldOn)) || String(heldOn) > today)) {
    problems.push({ field: 'heldOn', problem: 'invalid' });
  }
  if (filled(durationMinutes) && !inMinutesRange(durationMinutes)) {
    problems.push({ field: 'durationMinutes', problem: 'invalid' });
  }
  if (
    phase === 'supplementary' &&
    filled(supplementaryReason) &&
    !(supplementaryTrainingReasons as readonly unknown[]).includes(supplementaryReason)
  ) {
    problems.push({ field: 'supplementaryReason', problem: 'invalid' });
  }
  return problems;
}

type HeldRowValues = {
  domain: string;
  phase: string;
  heldOn: string | null;
  durationMinutes: number | null;
  trainerName: string | null;
  trainerJobTitle: string | null;
  verifierName: string | null;
  verifierJobTitle: string | null;
  material: string | null;
  supplementaryReason: string | null;
};

const folded = (value: string | null, fold: (value: string) => string) =>
  value === null || value.trim() === '' ? null : fold(value);

/**
 * What makes rows of several people one training held. A training held has one duration and one
 * material, while the periodic material differs per post, so rows that differ in any of them stay
 * separate trainings held on the same day (Mircea, 2026-10-31). The reason, the trainer's function
 * and the verifier are columns of the training too: rows that differ in them stay apart rather
 * than lend one person's sheet to another's record (ADR 042). A value two rows both lack is the
 * same on both, and a verifier is kept only with both halves written.
 */
export function heldTrainingKey(row: HeldRowValues) {
  const verified =
    folded(row.verifierName, foldName) !== null && folded(row.verifierJobTitle, foldText) !== null;
  return JSON.stringify([
    row.domain,
    row.phase,
    row.heldOn,
    folded(row.trainerName, foldName),
    folded(row.trainerJobTitle, foldText),
    verified ? folded(row.verifierName, foldName) : null,
    verified ? folded(row.verifierJobTitle, foldText) : null,
    row.durationMinutes,
    folded(row.material, foldText),
    row.phase === 'supplementary' ? row.supplementaryReason : null,
  ]);
}
