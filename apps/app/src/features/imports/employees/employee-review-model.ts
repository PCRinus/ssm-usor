import {
  answerPeriod,
  answerSplit,
  bloodGroups,
  decodeCnp,
  handoverDay,
  isValidCnp,
  type NameSource,
  parseCommuteMeansKey,
  rhFactors,
  rowSigner,
  sameHomeAddress,
  type TrainingDomain,
  trainingDomainLabels,
  type TrainingPhase,
  trainingPhaseLabels,
  typedOnRow,
  type WhoTrainedAnswer,
} from '@ssm-usor/contracts';

import type {
  EmployeeImportReview,
  EmployeeImportReviewChanges,
  EmployeeImportReviewChangesPeople,
  EmployeeImportReviewChangesPeopleFields,
} from '@/api/generated/api';
import { roCount } from '@/features/employees/employee-format';
import { formatRoDate } from '@/lib/dates';

import { foldText } from '../review-model';

export type Review = NonNullable<EmployeeImportReview>;
export type Proposal = Review['proposal'];
export type Person = Proposal['people'][number];
export type SheetPage = Proposal['pages'][number];
export type SheetRow = SheetPage['rows'][number];
export type JobTitleGroup = Proposal['jobTitles'][number];
export type WorkplaceGroup = Proposal['workplaces'][number];
export type PersonState = Review['states'][string];
export type FieldName = keyof Person['fields'];
export type FieldValue = string | number;
export type PersonChange = EmployeeImportReviewChangesPeople[string];
export type FieldChange = NonNullable<EmployeeImportReviewChangesPeopleFields[FieldName]>;
export type RowChange = NonNullable<NonNullable<EmployeeImportReviewChanges>['rows']>[string];

export type Changes = {
  people: Record<string, PersonChange>;
  jobTitles: Record<string, { jobPositionId: string }>;
  workplaces: Record<string, { workplaceId: string | null }>;
  rows: Record<string, RowChange>;
  pages: Record<string, { personId: string | null }>;
};

export const emptyChanges = (): Changes => ({
  people: {},
  jobTitles: {},
  workplaces: {},
  rows: {},
  pages: {},
});

export function changesOf(stored: EmployeeImportReviewChanges | undefined): Changes {
  return {
    people: stored?.people ?? {},
    jobTitles: stored?.jobTitles ?? {},
    workplaces: stored?.workplaces ?? {},
    rows: stored?.rows ?? {},
    pages: stored?.pages ?? {},
  };
}

export type ReviewContext = {
  proposal: Proposal;
  changes: Changes;
  states: Record<string, PersonState>;
  // The client's workplaces: one is never asked.
  workplaceCount: number;
  // The Romanian day, YYYY-MM-DD.
  today: string;
};

export const stateOf = (context: Pick<ReviewContext, 'states'>, personId: string): PersonState =>
  context.states[personId] ?? 'to_check';

/** The review state, never checked for someone out of the import, whatever was saved. */
export const statesOf = (proposal: Proposal, changes: Changes): Record<string, PersonState> =>
  Object.fromEntries(
    proposal.people.map((person) => {
      const state = changes.people[person.id]?.state ?? 'to_check';
      const out = state === 'checked' && !personIncluded({ proposal, changes }, person);
      return [person.id, out ? 'set_aside' : state];
    })
  );

export const fieldLabels: Record<FieldName, string> = {
  lastName: 'Numele',
  firstName: 'Prenumele',
  cnp: 'CNP-ul',
  employeeNumber: 'Numărul de marcă',
  birthDate: 'Data nașterii',
  birthPlace: 'Locul nașterii',
  homeAddress: 'Domiciliul',
  residenceAddress: 'Adresa unde locuiește',
  education: 'Studiile',
  qualification: 'Calificarea',
  bloodGroup: 'Grupa sanguină',
  rhFactor: 'Rh-ul',
  jobTitle: 'Funcția',
  hiredAt: 'Data angajării',
  leftOn: 'Data plecării',
  workplace: 'Locul de muncă',
  commuteRoute: 'Traseul spre locul de muncă',
  commuteMeans: 'Mijloacele de transport',
  commuteMinutes: 'Durata drumului',
};

export const fieldTitles: Record<FieldName, string> = {
  lastName: 'Nume',
  firstName: 'Prenume',
  cnp: 'CNP',
  employeeNumber: 'Număr de marcă',
  birthDate: 'Data nașterii',
  birthPlace: 'Locul nașterii',
  homeAddress: 'Domiciliul',
  residenceAddress: 'Adresa unde locuiește',
  education: 'Studii',
  qualification: 'Calificarea',
  bloodGroup: 'Grupa sanguină',
  rhFactor: 'Rh',
  jobTitle: 'Funcția pe fișă',
  hiredAt: 'Data angajării',
  leftOn: 'Data plecării',
  workplace: 'Locul de muncă pe fișă',
  commuteRoute: 'Traseul spre locul de muncă',
  commuteMeans: 'Mijloace de transport',
  commuteMinutes: 'Durata drumului',
};

const requiredForNew = ['lastName', 'firstName', 'jobTitle', 'hiredAt'] as const;

export const requiredForNewField = (name: FieldName) =>
  (requiredForNew as readonly FieldName[]).includes(name);

// The reader tells a sheet's cover from its first page only by the rows: the cover has none.
// Printed booklets that carry the commute declaration put it on the SSM sheet before or facing
// the first page, never at the back.
const readingOrder = [
  'ssm_cover',
  'commute_declaration',
  'ssm_sheet_front',
  'ssm_periodic',
  'su_cover',
  'su_sheet_front',
  'su_periodic',
  'other',
  null,
] as const;

function readingPlace(page: SheetPage) {
  if (page.rows.length === 0 && page.kind === 'ssm_sheet_front')
    return readingOrder.indexOf('ssm_cover');
  if (page.rows.length === 0 && page.kind === 'su_sheet_front')
    return readingOrder.indexOf('su_cover');
  return readingOrder.indexOf(page.kind);
}

// The dates as read, not as edited, so the photos keep their numbers while the member corrects
// a date.
function readingKey(page: SheetPage) {
  return (
    page.rows
      .flatMap((row) => (row.heldOn ? [row.heldOn] : []))
      .sort()
      .at(0) ?? '~'
  );
}

type PageOwners = { changes: Pick<Changes, 'pages'> };

export function pagesOf(context: PageOwners & Pick<ReviewContext, 'proposal'>, personId: string) {
  return context.proposal.pages
    .filter((page) => ownerOf(context, page) === personId)
    .map((page, index) => ({ page, index, place: readingPlace(page), key: readingKey(page) }))
    .sort(
      (a, b) =>
        a.place - b.place || (a.key === b.key ? 0 : a.key < b.key ? -1 : 1) || a.index - b.index
    )
    .map(({ page }) => page);
}

export function ownerOf(context: PageOwners, page: SheetPage) {
  const moved = context.changes.pages[page.id];
  return moved === undefined ? page.personId : moved.personId;
}

export const unplacedPages = (proposal: Proposal) =>
  proposal.pages.filter((page) => page.personId === null);

export type ResolvedField = {
  value: FieldValue | null;
  // The sheets disagree, the app has no value to keep, and the member has not chosen.
  choice: boolean;
  edited: boolean;
  // The options the person's own pages give.
  options: { value: FieldValue; pageIds: string[]; index: number }[];
  // An existing employee's value; undefined for someone new.
  app: FieldValue | null | undefined;
  sheet: FieldValue | null;
  replaced: boolean;
};

export const differs = (name: FieldName, a: FieldValue, b: FieldValue) =>
  typeof a === 'number' || typeof b === 'number'
    ? Number(a) !== Number(b)
    : name === 'homeAddress' || name === 'residenceAddress'
      ? !sameHomeAddress(a, b)
      : foldText(String(a)) !== foldText(String(b));

/** A person's field as confirming would take it, as `@ssm-usor/import` resolves it. */
export function resolveField(
  context: Pick<ReviewContext, 'proposal' | 'changes'>,
  person: Person,
  name: FieldName
): ResolvedField {
  const field = person.fields[name] as {
    options: { value: FieldValue; pageIds: string[] }[];
    app?: FieldValue | null;
  };
  const change = context.changes.people[person.id]?.fields?.[name];
  const declined = context.changes.people[person.id]?.existing === false;
  const pages = new Set(pagesOf(context, person.id).map((page) => page.id));
  const options = field.options
    .map((option, index) => ({ ...option, index }))
    .filter((option) => option.pageIds.some((id) => pages.has(id)));
  // A declined match leaves the person new: the employee's values are no one's to keep.
  const app = declined ? undefined : field.app;
  const sheet = options.length === 1 ? options[0]!.value : null;
  const base = { options, app, sheet, choice: false, replaced: false };
  if (change?.value !== undefined) {
    return {
      ...base,
      value: change.value,
      edited: true,
      replaced: app !== undefined && change.value !== app,
    };
  }
  let value: FieldValue | null = null;
  let choice = false;
  if (change?.option !== undefined) value = field.options[change.option]?.value ?? null;
  else if (options.length === 1) value = options[0]!.value;
  else if (options.length > 1) {
    if (app === null || app === undefined) choice = true;
    value = app ?? null;
  }
  const edited = change?.option !== undefined;
  const kept = app ?? null;
  if (value === null) return { ...base, value: kept, choice, edited };
  if (kept === null) return { ...base, value, choice, edited };
  const replaced = differs(name, kept, value) && change?.replace === true;
  return { ...base, value: replaced ? value : kept, choice, edited, replaced };
}

export const matchOf = (changes: Changes, person: Person) =>
  changes.people[person.id]?.existing === false ? null : person.existing;

export const matchedName = (person: Person) =>
  [person.fields.lastName.app, person.fields.firstName.app].filter(Boolean).join(' ') ||
  'lucrătorul din aplicație';

export const isExisting = (context: Pick<ReviewContext, 'changes'>, person: Person) =>
  matchOf(context.changes, person) !== null;

// The sheets carry no email or phone, so a person created new has neither.
export const withoutContact = (context: Pick<ReviewContext, 'changes'>, person: Person) =>
  person.flags.some((flag) => flag.code === 'no_contact') ||
  (person.existing !== null && !isExisting(context, person));

/** Whether a person is written unless the member decides otherwise, as `@ssm-usor/import`. */
export const includedByDefault = (leftOn: string | null, existing: boolean) =>
  leftOn === null || existing;

export function proposedPersonIncluded(
  context: Pick<ReviewContext, 'proposal' | 'changes'>,
  person: Person
) {
  const leftOn = resolveField(context, person, 'leftOn').value;
  return includedByDefault(typeof leftOn === 'string' ? leftOn : null, isExisting(context, person));
}

export const includedOf = (context: Pick<ReviewContext, 'proposal' | 'changes'>, person: Person) =>
  context.changes.people[person.id]?.included ?? proposedPersonIncluded(context, person);

/**
 * Whether the person is in the import: written at confirm once checked, as the payload's
 * `state === 'checked' && included` reads. Set aside, or a leaver not taken, is out.
 */
export const personIncluded = (
  context: Pick<ReviewContext, 'proposal' | 'changes'>,
  person: Person
) => context.changes.people[person.id]?.state !== 'set_aside' && includedOf(context, person);

/** The one switch for a person: out sets them aside, in takes them back to check. */
export function withPersonIncluded(
  context: Pick<ReviewContext, 'proposal' | 'changes'>,
  person: Person,
  included: boolean
): Changes {
  if (included === personIncluded(context, person)) return context.changes;
  const proposed = proposedPersonIncluded(context, person);
  return withPersonChange(context.changes, person.id, (change) => ({
    ...change,
    state: included ? undefined : 'set_aside',
    included: included && !proposed ? true : undefined,
  }));
}

// While the pages disagree on a name, the person goes by the one most pages give, which comes first.
const shownName = (field: ResolvedField) =>
  field.choice ? (field.options[0]?.value ?? null) : field.value;

export function personName(context: Pick<ReviewContext, 'proposal' | 'changes'>, person: Person) {
  const last = shownName(resolveField(context, person, 'lastName'));
  const first = shownName(resolveField(context, person, 'firstName'));
  const name = [last, first].filter((part) => part !== null && part !== '').join(' ');
  return name || 'Persoană fără nume';
}

export const titleGroupOf = (proposal: Proposal, person: Person) =>
  proposal.jobTitles.find((group) => group.id === person.jobTitleId) ?? null;

export const workplaceGroupOf = (proposal: Proposal, person: Person) =>
  proposal.workplaces.find((group) => group.id === person.workplaceId) ?? null;

export function positionOf(context: Pick<ReviewContext, 'proposal' | 'changes'>, person: Person) {
  const own = context.changes.people[person.id]?.jobPositionId;
  if (own) return own;
  const group = titleGroupOf(context.proposal, person);
  if (!group) return null;
  return context.changes.jobTitles[group.id]?.jobPositionId ?? group.proposedId;
}

export type GroupStatus = 'decide' | 'confirm' | 'decided' | 'exact';

/** Exact is assigned quietly, near waits for a confirmation, none for a choice. */
export function groupStatus(
  decided: boolean,
  group: Pick<JobTitleGroup | WorkplaceGroup, 'match'>
): GroupStatus {
  if (decided) return 'decided';
  if (group.match === 'exact') return 'exact';
  return group.match === 'near' ? 'confirm' : 'decide';
}

export const titleStatus = (changes: Changes, group: JobTitleGroup) =>
  groupStatus(changes.jobTitles[group.id] !== undefined, group);

export const workplaceStatus = (changes: Changes, group: WorkplaceGroup) =>
  groupStatus(changes.workplaces[group.id] !== undefined, group);

/** The workplace a person gets, or null; undefined where it is never asked. */
export function workplaceOf(context: ReviewContext, person: Person) {
  const own = context.changes.people[person.id]?.workplaceId;
  if (own !== undefined) return own;
  const group = workplaceGroupOf(context.proposal, person);
  if (!group) return undefined;
  const decided = context.changes.workplaces[group.id];
  return decided !== undefined ? decided.workplaceId : group.proposedId;
}

// `matched`: the row's person still completes the employee the proposal found, whose
// trainings and passes the flags compare with.
export const proposedRowIncluded = (row: SheetRow, matched: boolean) =>
  !row.flags.includes('unsigned') &&
  !row.flags.includes('repeated') &&
  !(matched && row.flags.includes('in_app'));

export const rowIncluded = (changes: Changes, row: SheetRow, matched: boolean) =>
  changes.rows[row.id]?.included ?? proposedRowIncluded(row, matched);

export const testInApp = (row: SheetRow, matched: boolean) => matched && row.test?.inApp === true;

// An annual test follows its row's signature, not its training: one the app already has still
// leaves the test written on its row to take.
export const proposedTestIncluded = (row: SheetRow, matched: boolean) =>
  row.test?.verified === true &&
  !testInApp(row, matched) &&
  (row.test.test === 'hiring' ||
    (!row.flags.includes('unsigned') && !row.flags.includes('repeated')));

/** Whether the test a row carries is ticked; it is written only on a row of `testedRows`. */
export function testIncluded(changes: Changes, row: SheetRow, matched: boolean) {
  if (!row.test) return false;
  const change = changes.rows[row.id];
  const proposed = proposedTestIncluded(row, matched);
  return change?.test ?? (row.testOnly ? (change?.included ?? proposed) : proposed);
}

const testPhases: Record<TrainingDomain, TrainingPhase[]> = {
  ssm: ['introductory_general'],
  su: ['workplace', 'introductory_general'],
};

/**
 * The rows whose paper hiring test is written, one a domain, as `@ssm-usor/import`'s
 * `hiringTestRowIds`: the newest of the phase the test closes, among the rows the person's pages
 * now hold, with the dates as the member left them.
 */
export function hiringTestRowIds(
  rows: readonly Pick<SheetRow, 'id' | 'domain' | 'phase' | 'heldOn' | 'testOnly' | 'test'>[]
): Set<string> {
  const ids = new Set<string>();
  for (const domain of ['ssm', 'su'] as const) {
    const phase = testPhases[domain].find((each) =>
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

/** The rows of a person whose test confirming writes: the annual tests and one hiring test. */
export function testedRows(context: Pick<ReviewContext, 'proposal' | 'changes'>, personId: string) {
  const rows = ownRows(context, personId).map(({ row }) => row);
  const ids = hiringTestRowIds(
    rows.map((row) => ({ ...row, heldOn: rowValues(context.changes, row).heldOn }))
  );
  for (const row of rows) if (row.test?.test === 'annual') ids.add(row.id);
  return ids;
}

export type RowValues = {
  heldOn: string | null;
  durationMinutes: number | null;
  trainerName: string | null;
  trainerJobTitle: string | null;
  material: string | null;
  supplementaryReason: string | null;
  verifierName: string | null;
  verifierJobTitle: string | null;
};

// As `@ssm-usor/import`: a value an older proposal took from the client's themes is no reading
// of the sheet, so it counts as empty unless the member typed one (ADR 042).
const sameValue = (a: unknown, b: unknown) =>
  (typeof a === 'string' ? a.trim() : (a ?? null)) ===
  (typeof b === 'string' ? b.trim() : (b ?? null));

// The row dialogs saved every field on any edit, so a stored change equal to the themed value is
// that save, not a value the member typed.
function reviewedValue(
  values: Record<string, unknown>,
  name: string,
  proposed: unknown,
  themed: boolean
) {
  if (name in values && !(themed && sameValue(values[name], proposed))) return values[name];
  return themed ? null : proposed;
}

export function rowValues(changes: Changes, row: SheetRow): RowValues {
  const values: Record<string, unknown> = changes.rows[row.id]?.values ?? {};
  const fromThemes: readonly string[] = row.fromThemes;
  const pick = <K extends keyof RowValues>(name: K) =>
    reviewedValue(values, name, row[name], fromThemes.includes(name)) as RowValues[K];
  return {
    heldOn: pick('heldOn'),
    durationMinutes: pick('durationMinutes'),
    trainerName: pick('trainerName'),
    trainerJobTitle: pick('trainerJobTitle'),
    material: pick('material'),
    supplementaryReason: pick('supplementaryReason'),
    verifierName: pick('verifierName'),
    verifierJobTitle: pick('verifierJobTitle'),
  };
}

/**
 * The examiner a row's test names, as the member left it: the verifier's box, else the trainer's,
 * never a trainer an older proposal took from the client's themes, as `@ssm-usor/import` reads it.
 */
export function examinerValues(changes: Changes, row: SheetRow) {
  const own: Record<string, unknown> = changes.rows[row.id]?.values ?? {};
  const byVerifier = row.signatures.verifier !== 'no_box' && row.verifierName !== null;
  const typed = (['examinerName', 'examinerJobTitle'] as const).some(
    (name) => name in own && !sameValue(own[name], row.test?.[name] ?? null)
  );
  const examiner = (name: 'examinerName' | 'examinerJobTitle', trainer: string) =>
    reviewedValue(
      own,
      name,
      row.test?.[name] ?? null,
      !(typed && name in own) &&
        !byVerifier &&
        (row.fromThemes as readonly string[]).includes(trainer)
    ) as string | null;
  return {
    examinerName: examiner('examinerName', 'trainerName'),
    examinerJobTitle: examiner('examinerJobTitle', 'trainerJobTitle'),
  };
}

export const handoverOf = (
  context: Pick<ReviewContext, 'proposal' | 'changes'>,
  personId: string
) => handoverDay(pagesOf(context, personId));

export const answerOf = (
  changes: Changes,
  personId: string,
  domain: TrainingDomain
): WhoTrainedAnswer | undefined => changes.people[personId]?.whoTrained?.[domain];

export type SignedValues = RowValues & {
  trainerFrom: NameSource | null;
  verifierFrom: NameSource | null;
};

const signerFields = {
  trainer: ['trainerName', 'trainerJobTitle'],
  verifier: ['verifierName', 'verifierJobTitle'],
} as const;

/**
 * A row's values with the trainer and verifier confirming writes, as `@ssm-usor/import`: typed on
 * the row, read off the sheet, or the person's answer for the row's period.
 */
export function signedValues(
  context: Pick<ReviewContext, 'proposal' | 'changes'>,
  personId: string,
  row: SheetRow,
  handover = handoverOf(context, personId)
): SignedValues {
  const values = rowValues(context.changes, row);
  const answer = answerOf(context.changes, personId, row.domain);
  const period = answerPeriod(values.heldOn, answerSplit(handover, answer));
  const stored = context.changes.rows[row.id]?.values;
  const signer = (role: 'trainer' | 'verifier') => {
    const [name, jobTitle] = signerFields[role];
    return rowSigner({
      domain: row.domain,
      phase: row.phase,
      role,
      name: values[name],
      jobTitle: values[jobTitle],
      typed: typedOnRow(stored, row, signerFields[role], row.fromThemes),
      period,
      answer,
    });
  };
  const trainer = signer('trainer');
  const verifier = signer('verifier');
  return {
    ...values,
    trainerName: trainer.name,
    trainerJobTitle: trainer.jobTitle,
    verifierName: verifier.name,
    verifierJobTitle: verifier.jobTitle,
    trainerFrom: trainer.source,
    verifierFrom: verifier.source,
  };
}

const filled = (value: unknown) =>
  value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '');

export type Decision = {
  key: string;
  // Where on the person page it is answered.
  anchor:
    | 'post'
    | 'match'
    | 'cnp'
    | 'workplace'
    | 'personal'
    | 'employment'
    | 'medical'
    | 'existing'
    | 'trainings';
  label: string;
  namesPerson?: boolean;
  tag: string;
  // A near post or workplace to confirm, rather than a gap.
  tone: 'destructive' | 'warning';
  // Answered once for everyone with the same text on their sheets, above the people list.
  above?: 'post' | 'workplace';
};

export type Note = { key: string; tag: string };

const rowDate = (row: SheetRow, values: RowValues) =>
  values.heldOn ? formatRoDate(values.heldOn) : trainingPhaseLabels[row.phase].toLowerCase();

const phaseGenitives: Record<TrainingPhase, string> = {
  introductory_general: 'introductiv-generale',
  workplace: 'la locul de muncă',
  periodic: 'periodice',
  supplementary: 'periodice suplimentare',
};

function missingLabel(row: SheetRow, values: RowValues, missing: string[]) {
  if (values.heldOn)
    return `Completează ${missing.join(', ')} la instruirea din ${rowDate(row, values)}`;
  return missing.length === 1
    ? `Completează data instruirii ${phaseGenitives[row.phase]}`
    : `Completează ${missing.join(', ')} la instruirea ${rowDate(row, values)}`;
}

// A paper training holds what its sheet writes: its trainer, material and duration may stay
// empty (ADR 042).
const rowFieldLabels: Partial<Record<keyof RowValues, string>> = {
  heldOn: 'data',
  supplementaryReason: 'motivul',
};

export const ownRows = (context: Pick<ReviewContext, 'proposal' | 'changes'>, personId: string) =>
  pagesOf(context, personId).flatMap((page) => page.rows.map((row) => ({ row, page })));

const cnpUnreadable = (value: FieldValue | null) =>
  typeof value === 'string' && /[^0-9]/.test(value);

const employmentFields = new Set<FieldName>(['jobTitle', 'hiredAt', 'employeeNumber', 'leftOn']);
const medicalFields = new Set<FieldName>([
  'bloodGroup',
  'rhFactor',
  'commuteRoute',
  'commuteMeans',
  'commuteMinutes',
]);

function fieldAnchor(
  context: Pick<ReviewContext, 'changes'>,
  person: Person,
  name: FieldName
): Decision['anchor'] {
  if (isExisting(context, person)) return 'existing';
  if (employmentFields.has(name)) return 'employment';
  return medicalFields.has(name) ? 'medical' : 'personal';
}

// As `@ssm-usor/import` checks a value before confirming: the employee form's and the
// database's limits.
const textLimits: Partial<Record<FieldName, [number, number]>> = {
  lastName: [1, 100],
  firstName: [1, 100],
  employeeNumber: [1, 40],
  birthPlace: [1, 160],
  homeAddress: [1, 240],
  residenceAddress: [1, 240],
  education: [1, 160],
  qualification: [1, 160],
  jobTitle: [2, 160],
  commuteRoute: [1, 1000],
};

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

const inMinutesRange = (value: unknown) =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 600;

function invalidField(
  context: Pick<ReviewContext, 'changes'>,
  person: Person,
  name: FieldName,
  value: FieldValue
): Decision | null {
  const lower = fieldLabels[name].toLowerCase();
  const decision = (label: string): Decision => ({
    key: `invalid-${name}`,
    anchor: fieldAnchor(context, person, name),
    label,
    tag: `${fieldLabels[name]} de corectat`,
    tone: 'destructive',
  });
  if (name === 'commuteMinutes') {
    return inMinutesRange(value) ? null : decision(`Corectează ${lower}: între 1 și 600 de minute`);
  }
  if (name === 'bloodGroup' || name === 'rhFactor') {
    const allowed: readonly FieldValue[] = name === 'bloodGroup' ? bloodGroups : rhFactors;
    return allowed.includes(value) ? null : decision(`Corectează ${lower}`);
  }
  if (name === 'birthDate' || name === 'hiredAt' || name === 'leftOn') {
    return typeof value === 'string' && isoDate.test(value)
      ? null
      : decision(`Corectează ${lower}`);
  }
  if (name === 'commuteMeans') {
    return typeof value === 'string' && parseCommuteMeansKey(value) !== null
      ? null
      : decision(`Corectează ${lower}`);
  }
  if (typeof value !== 'string') return decision(`Corectează ${lower}`);
  const limits = textLimits[name];
  if (!limits) return null;
  const length = value.trim().length;
  if (length < limits[0]) {
    return decision(
      `Corectează ${lower}: are cel puțin ${roCount(limits[0], 'caracter', 'caractere')}`
    );
  }
  if (length > limits[1]) {
    return decision(
      `Corectează ${lower}: are cel mult ${roCount(limits[1], 'caracter', 'caractere')}`
    );
  }
  return null;
}

/** The CNP confirming would take: the offered correction when the member took it. */
export function effectiveCnp(context: Pick<ReviewContext, 'proposal' | 'changes'>, person: Person) {
  return context.changes.people[person.id]?.cnpCorrection === true && person.cnpCorrection !== null
    ? person.cnpCorrection
    : resolveField(context, person, 'cnp').value;
}

type Unique = 'cnp' | 'employeeNumber';
type Holders = Record<Unique | 'employee', Map<string, string[]>>;

const holdersByProposal = new WeakMap<Proposal, WeakMap<Changes, Holders>>();

const uniqueValue = (
  context: Pick<ReviewContext, 'proposal' | 'changes'>,
  person: Person,
  name: Unique
) => {
  const value =
    name === 'cnp' ? effectiveCnp(context, person) : resolveField(context, person, name).value;
  if (value === null || (name === 'cnp' && !isValidCnp(String(value)))) return null;
  return foldText(String(value));
};

// Who would hold each CNP, employee number and existing employee: a client's employees each have
// their own, and an employee is completed once, so confirming refuses a second person with one.
function holdersOf(context: Pick<ReviewContext, 'proposal' | 'changes'>): Holders {
  let byChanges = holdersByProposal.get(context.proposal);
  if (!byChanges) {
    byChanges = new WeakMap();
    holdersByProposal.set(context.proposal, byChanges);
  }
  const known = byChanges.get(context.changes);
  if (known) return known;
  const holders: Holders = { cnp: new Map(), employeeNumber: new Map(), employee: new Map() };
  const hold = (name: keyof Holders, key: string | null, personId: string) => {
    if (key !== null) holders[name].set(key, [...(holders[name].get(key) ?? []), personId]);
  };
  for (const person of context.proposal.people) {
    if (!personIncluded(context, person)) continue;
    for (const name of ['cnp', 'employeeNumber'] as const) {
      hold(name, uniqueValue(context, person, name), person.id);
    }
    hold('employee', matchOf(context.changes, person)?.employeeId ?? null, person.id);
  }
  byChanges.set(context.changes, holders);
  return holders;
}

export const formerLeftOn = (person: Person) =>
  person.flags.find((flag) => flag.code === 'former_employee')?.detail ?? null;

// What the sheets give, or the member wrote, whatever the app's value: every page's while they
// disagree, as the confirm reads a rehire.
function sheetValues(
  context: Pick<ReviewContext, 'proposal' | 'changes'>,
  person: Person,
  name: FieldName
): FieldValue[] {
  const change = context.changes.people[person.id]?.fields?.[name];
  if (change?.value !== undefined) return change.value === null ? [] : [change.value];
  const field = person.fields[name] as { options: { value: FieldValue; pageIds: string[] }[] };
  const chosen = change?.option === undefined ? undefined : field.options[change.option];
  if (chosen) return [chosen.value];
  const pages = new Set(pagesOf(context, person.id).map((page) => page.id));
  return field.options
    .filter((option) => option.pageIds.some((id) => pages.has(id)))
    .map((option) => option.value);
}

/** A sheet hire date after the former employee left: in the app a rehire is a new employee. */
export function isRehire(context: Pick<ReviewContext, 'proposal' | 'changes'>, person: Person) {
  const leftAt = formerLeftOn(person);
  return (
    leftAt !== null &&
    isExisting(context, person) &&
    sheetValues(context, person, 'hiredAt').some((day) => String(day) > leftAt)
  );
}

/** The CNP or employee number a declined match leaves equal to that employee's in the app. */
export function takenByMatch(
  context: Pick<ReviewContext, 'proposal' | 'changes'>,
  person: Person,
  name: Unique
) {
  if (person.existing === null || isExisting(context, person)) return false;
  const app = (person.fields[name] as { app?: FieldValue | null }).app;
  const key = uniqueValue(context, person, name);
  return app !== null && app !== undefined && key !== null && key === foldText(String(app));
}

const testName = (row: SheetRow) =>
  row.test?.test === 'hiring'
    ? 'testului la angajare'
    : `testului anual ${trainingDomainLabels[row.domain]}`;

export function decisionsOf(context: ReviewContext, person: Person): Decision[] {
  const decisions: Decision[] = [];
  // Confirming neither creates nor completes a person set aside, so nothing of theirs is asked.
  if (stateOf(context, person.id) === 'set_aside') return decisions;
  const { proposal, changes } = context;
  const change = changes.people[person.id];
  const match = matchOf(changes, person);
  const holders = holdersOf(context);
  const sameEmployee = match
    ? holders.employee.get(match.employeeId)?.find((id) => id !== person.id)
    : undefined;
  const twin = proposal.people.find((each) => each.id === sameEmployee);
  if (match?.matchedBy === 'name_only' && change?.existing === undefined) {
    decisions.push({
      key: 'match',
      anchor: 'match',
      label: 'Spune dacă e lucrătorul cu același nume din aplicație',
      tag: 'Lucrător de confirmat',
      tone: 'destructive',
    });
  } else if (twin) {
    decisions.push({
      key: 'match',
      anchor: 'match',
      label: `E propus ca același lucrător din aplicație ca ${personName(context, twin)}`,
      namesPerson: true,
      tag: 'Același lucrător la două persoane',
      tone: 'destructive',
    });
  }
  if (isRehire(context, person)) {
    decisions.push({
      key: 'rehire',
      anchor: 'match',
      label: `Fișa scrie o angajare după plecarea din ${formatRoDate(formerLeftOn(person)!)}: alege cum îl preiei`,
      tag: 'Reangajat după plecare',
      tone: 'destructive',
    });
  }
  if (!isExisting(context, person) && !change?.jobPositionId) {
    const group = titleGroupOf(proposal, person);
    const status = group ? titleStatus(changes, group) : 'decide';
    if (!group) {
      decisions.push({
        key: 'post',
        anchor: 'post',
        label: 'Alege postul',
        tag: 'Post de hotărât',
        tone: 'destructive',
      });
    } else if (status === 'decide') {
      decisions.push({
        key: 'post',
        anchor: 'post',
        label:
          group.personIds.length > 1
            ? `Alege postul, pentru toate cele ${roCount(group.personIds.length, 'persoană', 'persoane')}`
            : 'Alege postul',
        tag: 'Post de hotărât',
        tone: 'destructive',
        above: 'post',
      });
    } else if (status === 'confirm') {
      decisions.push({
        key: 'post',
        anchor: 'post',
        label: 'Confirmă postul propus',
        tag: 'Post de confirmat',
        tone: 'warning',
        above: 'post',
      });
    }
  }

  const cnp = resolveField(context, person, 'cnp');
  const cnpAnswered = change?.cnpCorrection !== undefined || change?.fields?.cnp !== undefined;
  if (person.cnpCorrection !== null && !cnpAnswered) {
    decisions.push({
      key: 'cnp',
      anchor: 'cnp',
      label: 'Alege ce faci cu CNP-ul',
      tag: 'CNP cu o cifră necitită',
      tone: 'destructive',
    });
  } else if (
    cnp.value !== null &&
    change?.cnpCorrection !== true &&
    (cnpUnreadable(cnp.value) || !isValidCnp(String(cnp.value)))
  ) {
    decisions.push({
      key: 'cnp',
      anchor: 'cnp',
      label: 'Corectează CNP-ul',
      tag: 'CNP de corectat',
      tone: 'destructive',
    });
  } else {
    const effective = effectiveCnp(context, person);
    const birthDate = resolveField(context, person, 'birthDate').value;
    if (
      typeof effective === 'string' &&
      isValidCnp(effective) &&
      typeof birthDate === 'string' &&
      decodeCnp(effective).birthDate !== null &&
      decodeCnp(effective).birthDate !== birthDate
    ) {
      decisions.push({
        key: 'birthDate',
        anchor: fieldAnchor(context, person, 'birthDate'),
        label: 'Data nașterii nu se potrivește cu CNP-ul',
        tag: 'Data nașterii diferă de CNP',
        tone: 'destructive',
      });
    }
  }

  for (const name of ['cnp', 'employeeNumber'] as const) {
    const key = uniqueValue(context, person, name);
    const otherId =
      key === null ? undefined : holders[name].get(key)?.find((id) => id !== person.id);
    const other = proposal.people.find((each) => each.id === otherId);
    if (other) {
      decisions.push({
        key: `duplicate-${name}`,
        anchor: fieldAnchor(context, person, name),
        label: `${fieldLabels[name]} apare și la ${personName(context, other)}`,
        namesPerson: true,
        tag: `${fieldLabels[name]} apare la două persoane`,
        tone: 'destructive',
      });
    } else if (takenByMatch(context, person, name)) {
      decisions.push({
        key: `duplicate-${name}`,
        anchor: fieldAnchor(context, person, name),
        label: `${fieldLabels[name]} e al lucrătorului din aplicație: scoate-l sau corectează-l`,
        tag: `${fieldLabels[name]} e deja în aplicație`,
        tone: 'destructive',
      });
    }
  }

  for (const name of Object.keys(person.fields) as FieldName[]) {
    if (name === 'cnp') continue;
    const resolved = resolveField(context, person, name);
    if (resolved.choice) {
      decisions.push({
        key: `choice-${name}`,
        anchor: fieldAnchor(context, person, name),
        label: `${fieldLabels[name]}: fișele scriu valori diferite`,
        tag: `${fieldLabels[name]} diferă între fișe`,
        tone: 'destructive',
      });
    } else if (resolved.value !== null && name !== 'workplace') {
      const invalid = invalidField(context, person, name, resolved.value);
      if (invalid) decisions.push(invalid);
    }
  }
  if (!isExisting(context, person)) {
    for (const name of requiredForNew) {
      const resolved = resolveField(context, person, name);
      if (!resolved.choice && !filled(resolved.value)) {
        decisions.push({
          key: `missing-${name}`,
          anchor: fieldAnchor(context, person, name),
          label: `Completează ${fieldLabels[name].toLowerCase()}`,
          tag: `Lipsește ${fieldLabels[name].toLowerCase()}`,
          tone: 'destructive',
        });
      }
    }
  }

  const group = workplaceGroupOf(proposal, person);
  if (
    group &&
    context.workplaceCount > 1 &&
    change?.workplaceId === undefined &&
    workplaceStatus(changes, group) !== 'exact' &&
    workplaceStatus(changes, group) !== 'decided'
  ) {
    decisions.push({
      key: 'workplace',
      anchor: 'workplace',
      label: 'Alege locul de muncă',
      tag: 'Loc de muncă de ales',
      tone: 'warning',
      above: 'workplace',
    });
  }

  const matched = match !== null;
  const tested = testedRows(context, person.id);
  for (const { row } of ownRows(context, person.id)) {
    const values = rowValues(changes, row);
    let dateAsked = false;
    if (!row.testOnly && rowIncluded(changes, row, matched)) {
      const missing = (Object.keys(rowFieldLabels) as (keyof RowValues)[]).filter(
        (name) =>
          (name !== 'supplementaryReason' || row.phase === 'supplementary') && !filled(values[name])
      );
      if (missing.length > 0) {
        dateAsked = missing.includes('heldOn');
        decisions.push({
          key: `row-${row.id}`,
          anchor: 'trainings',
          label: missingLabel(
            row,
            values,
            missing.map((name) => rowFieldLabels[name]!)
          ),
          tag: `Lipsește ${rowFieldLabels[missing[0]!]} la o instruire`,
          tone: 'destructive',
        });
      } else if (values.durationMinutes !== null && !inMinutesRange(values.durationMinutes)) {
        decisions.push({
          key: `row-${row.id}`,
          anchor: 'trainings',
          label: `Corectează durata instruirii din ${rowDate(row, values)}: între 1 și 600 de minute`,
          tag: 'O instruire cu durata de corectat',
          tone: 'destructive',
        });
      } else if (values.heldOn !== null && values.heldOn > context.today) {
        dateAsked = true;
        decisions.push({
          key: `row-${row.id}`,
          anchor: 'trainings',
          label: `Corectează data instruirii din ${rowDate(row, values)}, care e în viitor`,
          tag: 'O instruire cu data în viitor',
          tone: 'destructive',
        });
      }
    }
    if (row.test && tested.has(row.id) && testIncluded(changes, row, matched)) {
      const takenOn = values.heldOn;
      // A test on a training row takes the row's date, so the row's own decision answers both.
      if (!dateAsked) {
        if (takenOn === null || !filled(takenOn)) {
          decisions.push({
            key: `test-date-${row.id}`,
            anchor: 'trainings',
            label: `Completează data ${testName(row)}`,
            tag: 'Lipsește data unui test',
            tone: 'destructive',
          });
        } else if (!isoDate.test(takenOn) || takenOn > context.today) {
          decisions.push({
            key: `test-date-${row.id}`,
            anchor: 'trainings',
            label: `Corectează data ${testName(row)}, care e în viitor`,
            tag: 'Un test cu data în viitor',
            tone: 'destructive',
          });
        }
      }
      const examiner = examinerValues(changes, row);
      // A sheet may name no examiner; one it names has a name and a function.
      if (filled(examiner.examinerName) !== filled(examiner.examinerJobTitle)) {
        decisions.push({
          key: `test-${row.id}`,
          anchor: 'trainings',
          label: `Completează examinatorul ${testName(row)}`,
          tag: 'Lipsește examinatorul unui test',
          tone: 'destructive',
        });
      }
    }
  }
  return decisions;
}

const handoverTextLength = 160;

/**
 * The handovers a new prevention service wrote on the person's pages: the days, each once, oldest
 * first, and, for a line whose day is not a past one, its text as written, each once.
 */
export function handoversOf(context: Pick<ReviewContext, 'proposal' | 'changes'>, person: Person) {
  const handovers = pagesOf(context, person.id).flatMap((page) => page.handovers ?? []);
  const texts = handovers.flatMap((handover) => {
    const text = handover.text.trim().replace(/\s+/g, ' ');
    if (handover.date || text === '') return [];
    return [text.length > handoverTextLength ? `${text.slice(0, handoverTextLength - 1)}…` : text];
  });
  return {
    dates: [
      ...new Set(handovers.flatMap((handover) => (handover.date ? [handover.date] : []))),
    ].sort(),
    undated: [...new Set(texts)],
  };
}

export function notesOf(context: ReviewContext, person: Person): Note[] {
  const notes: Note[] = [];
  const rows = ownRows(context, person.id);
  const matched = isExisting(context, person);
  const tested = testedRows(context, person.id);
  const add = (key: string, tag: string) => {
    if (!notes.some((note) => note.key === key)) notes.push({ key, tag });
  };
  for (const { row } of rows) {
    if (row.flags.includes('unusual_duration') && rowIncluded(context.changes, row, matched))
      add('duration', 'Durată neobișnuită la o instruire');
    if (row.flags.includes('before_hire') && rowIncluded(context.changes, row, matched))
      add('before_hire', 'O instruire înainte de angajare');
    if (row.flags.includes('unsigned')) add('unsigned', 'Un rând nesemnat pe fișă');
    if (tested.has(row.id) && row.test && !row.test.verified && !testInApp(row, matched))
      add('verifier', 'Semnătura de verificare nu se vede');
  }
  const placements = new Set(pagesOf(context, person.id).map((page) => page.placement));
  if (placements.has('placed_by_job_title')) add('job_title', 'O pagină pusă după funcție');
  if (placements.has('placed_by_order')) add('order', 'O pagină pusă după ordine');
  const handovers = handoversOf(context, person);
  for (const date of handovers.dates) {
    add(`handover-${date}`, `Preluare consemnată pe fișă: ${formatRoDate(date)}`);
  }
  if (handovers.undated.length > 0) add('handover', 'Preluare consemnată pe fișă');
  const former = matched ? formerLeftOn(person) : null;
  if (former !== null) add('leaver', `A plecat din firmă la ${formatRoDate(former)}`);
  else if (resolveField(context, person, 'leftOn').value !== null)
    add('leaver', 'A plecat din firmă');
  return notes;
}

export type PersonView = {
  person: Person;
  number: number;
  state: PersonState;
  name: string;
  decisions: Decision[];
  notes: Note[];
  included: boolean;
};

export function peopleViews(context: ReviewContext): PersonView[] {
  return context.proposal.people.map((person, index) => ({
    person,
    number: index + 1,
    state: stateOf(context, person.id),
    name: personName(context, person),
    decisions: decisionsOf(context, person),
    notes: notesOf(context, person),
    included: personIncluded(context, person),
  }));
}

const toCheck = (view: PersonView) => view.state === 'to_check' && view.included;

export const firstToCheck = (views: PersonView[]) => views.find(toCheck);

const ownDecisions = (view: Pick<PersonView, 'decisions'>) =>
  view.decisions.filter((decision) => !decision.above);

const abbreviation = /^(?:Rh|CNP)\b/;

const lowerFirst = (label: string) =>
  /^\p{Lu}\p{Ll}/u.test(label) && !abbreviation.test(label)
    ? label[0]!.toLowerCase() + label.slice(1)
    : label;

const joinAnd = (parts: string[]) =>
  parts.length > 1 ? `${parts.slice(0, -1).join(', ')} și ${parts.at(-1)}` : (parts[0] ?? '');

export function decisionSummary(view: Pick<PersonView, 'decisions'>) {
  const own = ownDecisions(view);
  const differing = own
    .filter((decision) => decision.key.startsWith('choice-'))
    .map((decision, index) => {
      const label = fieldLabels[decision.key.slice('choice-'.length) as FieldName];
      return index === 0 ? label : lowerFirst(label);
    });
  const parts: string[] = [];
  for (const decision of own) {
    const part = decision.key.startsWith('choice-')
      ? `${joinAnd(differing)} diferă între fișe`
      : decision.tag;
    if (!parts.includes(part)) parts.push(part);
  }
  return { count: own.length, text: parts.join(' · ') };
}

export type PeopleGroup = {
  key: 'decide' | 'waiting' | 'unopened' | 'checked' | 'set_aside';
  title: string;
  views: PersonView[];
};

function waitingTitle(views: PersonView[]) {
  const above = new Set(views.flatMap((view) => view.decisions.map((decision) => decision.above)));
  if (!above.has('workplace')) return 'Așteaptă doar postul';
  if (!above.has('post')) return 'Așteaptă doar locul de muncă';
  return 'Așteaptă doar postul sau locul de muncă';
}

export function peopleGroups(views: PersonView[]): PeopleGroup[] {
  const checking = views.filter(toCheck);
  const waiting = checking.filter(
    (view) => view.decisions.length > 0 && ownDecisions(view).length === 0
  );
  const groups: PeopleGroup[] = [
    {
      key: 'decide',
      title: 'Cu ceva de hotărât',
      views: checking.filter((view) => ownDecisions(view).length > 0),
    },
    { key: 'waiting', title: waitingTitle(waiting), views: waiting },
    {
      key: 'unopened',
      title: 'Încă nedeschise',
      views: checking.filter((view) => view.decisions.length === 0),
    },
    {
      key: 'checked',
      title: 'Verificați',
      views: views.filter((view) => view.state === 'checked'),
    },
    {
      key: 'set_aside',
      title: 'Lăsați deoparte',
      views: views.filter((view) => !view.included),
    },
  ];
  return groups.filter((group) => group.views.length > 0);
}

const openGroups = <Group extends JobTitleGroup | WorkplaceGroup>(
  groups: Group[],
  status: (group: Group) => GroupStatus
) => {
  const statuses = groups.map(status);
  return {
    decide: statuses.filter((each) => each === 'decide').length,
    confirm: statuses.filter((each) => each === 'confirm').length,
  };
};

export function hubCounts(context: ReviewContext, views: PersonView[]) {
  const { proposal, changes } = context;
  const unplaced = unplacedPages(proposal);
  const checking = views.filter(toCheck);
  const setAside = views.filter((view) => !view.included).length;
  return {
    posts: openGroups(proposal.jobTitles, (group) => titleStatus(changes, group)),
    workplaces:
      context.workplaceCount > 1
        ? openGroups(proposal.workplaces, (group) => workplaceStatus(changes, group))
        : { decide: 0, confirm: 0 },
    people: {
      total: views.length,
      toCheck: checking.length,
      checked: views.filter((view) => view.state === 'checked').length,
      setAside,
      deciding: checking.filter((view) => ownDecisions(view).length > 0).length,
      included: views.length - setAside,
    },
    photos: {
      total: unplaced.length,
      toAssign: unplaced.filter((page) => changes.pages[page.id] === undefined).length,
    },
  };
}

export function nextToCheck(context: ReviewContext, afterId?: string) {
  const people = context.proposal.people;
  const start = afterId ? people.findIndex((person) => person.id === afterId) + 1 : 0;
  const ordered = [...people.slice(start), ...people.slice(0, start)];
  return ordered.find(
    (person) => person.id !== afterId && stateOf(context, person.id) === 'to_check'
  );
}

export function withPersonChange(
  changes: Changes,
  personId: string,
  change: (current: PersonChange) => PersonChange
): Changes {
  const next = change(changes.people[personId] ?? {});
  const people = { ...changes.people };
  if (Object.values(next).every((value) => value === undefined)) delete people[personId];
  else people[personId] = next;
  return { ...changes, people };
}

export function withField(
  changes: Changes,
  personId: string,
  name: FieldName,
  field: FieldChange | null
) {
  return withPersonChange(changes, personId, (current) => {
    const fields = { ...current.fields };
    if (field === null) delete fields[name];
    else fields[name] = field;
    return { ...current, fields: Object.keys(fields).length > 0 ? fields : undefined };
  });
}

export function withRow(
  changes: Changes,
  rowId: string,
  change: (current: RowChange) => RowChange
) {
  const next = change(changes.rows[rowId] ?? {});
  const rows = { ...changes.rows };
  if (Object.values(next).every((value) => value === undefined)) delete rows[rowId];
  else rows[rowId] = next;
  return { ...changes, rows };
}

/**
 * The person created new instead of completing the employee proposed. A rehire's CNP and employee
 * number stay the former employee's, so they are left out.
 */
export function withMatchDeclined(
  context: Pick<ReviewContext, 'proposal' | 'changes'>,
  person: Person,
  rehire: boolean
): Changes {
  let changes = withPersonChange(context.changes, person.id, (current) => ({
    ...current,
    existing: false,
  }));
  if (!rehire) return changes;
  for (const name of ['cnp', 'employeeNumber'] as const) {
    if (takenByMatch({ ...context, changes }, person, name)) {
      changes = withField(changes, person.id, name, { value: null });
      if (name === 'cnp') {
        changes = withPersonChange(changes, person.id, (current) => ({
          ...current,
          cnpCorrection: undefined,
        }));
      }
    }
  }
  return changes;
}

export function withMatchRestored(changes: Changes, person: Person): Changes {
  let next = withPersonChange(changes, person.id, (current) => ({
    ...current,
    existing: undefined,
  }));
  for (const name of ['cnp', 'employeeNumber'] as const) {
    if (next.people[person.id]?.fields?.[name]?.value === null) {
      next = withField(next, person.id, name, null);
    }
  }
  return next;
}

/** Moving on from a person with nothing left to decide checks them. */
export function leaving(context: ReviewContext, person: Person): Changes {
  if (stateOf(context, person.id) !== 'to_check') return context.changes;
  if (!personIncluded(context, person)) {
    return withPersonChange(context.changes, person.id, (current) => ({
      ...current,
      state: 'set_aside',
    }));
  }
  if (decisionsOf(context, person).length > 0) return context.changes;
  return withPersonChange(context.changes, person.id, (current) => ({
    ...current,
    state: 'checked',
  }));
}

/**
 * The changes with every checked person who has something to decide again, after an edit, a
 * page given or a choice, back to check: confirming would refuse them.
 */
export function reopened(context: Omit<ReviewContext, 'states'>): Changes {
  const full = { ...context, states: statesOf(context.proposal, context.changes) };
  let changes = context.changes;
  for (const person of context.proposal.people) {
    if (context.changes.people[person.id]?.state === 'checked' && !personIncluded(full, person)) {
      changes = withPersonChange(changes, person.id, (current) => ({
        ...current,
        state: 'set_aside',
      }));
      continue;
    }
    if (stateOf(full, person.id) !== 'checked') continue;
    if (decisionsOf(full, person).length === 0) continue;
    changes = withPersonChange(changes, person.id, (current) => ({ ...current, state: undefined }));
  }
  return changes;
}

export type HiringBlock = {
  domain: TrainingDomain;
  rows: { row: SheetRow; page: SheetPage }[];
  test: { row: SheetRow; page: SheetPage } | null;
};

export type DomainTrainings = {
  domain: TrainingDomain;
  pages: SheetPage[];
  hiring: HiringBlock;
  periodic: { row: SheetRow; page: SheetPage }[];
  annualTests: { row: SheetRow; page: SheetPage }[];
  inApp: { row: SheetRow; page: SheetPage }[];
};

const hiringPhases = new Set<TrainingPhase>(['introductory_general', 'workplace']);

export function trainingsByDomain(
  context: Pick<ReviewContext, 'proposal' | 'changes'>,
  personId: string
): DomainTrainings[] {
  const rows = ownRows(context, personId);
  const person = context.proposal.people.find((each) => each.id === personId);
  const matched = person !== undefined && isExisting(context, person);
  const tested = testedRows(context, personId);
  const inApp = (row: SheetRow) => matched && row.flags.includes('in_app');
  return (['ssm', 'su'] as const).map((domain) => {
    const own = rows.filter(({ row }) => row.domain === domain);
    const shown = own.filter(({ row }) => !inApp(row));
    const hiring = shown.filter(({ row }) => hiringPhases.has(row.phase) && !row.testOnly);
    return {
      domain,
      pages: [...new Set(own.map(({ page }) => page))],
      hiring: {
        domain,
        rows: hiring,
        test: own.find(({ row }) => row.test?.test === 'hiring' && tested.has(row.id)) ?? null,
      },
      periodic: shown.filter(({ row }) => !hiringPhases.has(row.phase) && !row.testOnly),
      // From every row, since a training the app already has hides its row but not its test.
      annualTests: own.filter(({ row }) => row.test?.test === 'annual'),
      inApp: own.filter(({ row }) => inApp(row)),
    };
  });
}

type HeldKeyRow = { domain: string; phase: string } & RowValues;

// As `@ssm-usor/import`'s grouping, which keeps a verifier only when both halves are written.
const heldKey = (row: HeldKeyRow) => {
  const verified = filled(row.verifierName) && filled(row.verifierJobTitle);
  return JSON.stringify([
    row.domain,
    row.phase,
    row.heldOn,
    foldText(row.trainerName ?? ''),
    foldText(row.trainerJobTitle ?? ''),
    verified ? foldText(row.verifierName ?? '') : '',
    verified ? foldText(row.verifierJobTitle ?? '') : '',
    row.durationMinutes,
    foldText(row.material ?? ''),
    row.phase === 'supplementary' ? row.supplementaryReason : null,
  ]);
};

/**
 * The people a row's training is held with: rows of others the confirm groups with it, as one
 * training held, when domain, phase, date, trainer and their function, verifier, duration and
 * material all match.
 */
export function heldWith(context: ReviewContext, personId: string, row: SheetRow) {
  const key = heldKey({ ...row, ...signedValues(context, personId, row) });
  const others = new Set<string>();
  for (const person of context.proposal.people) {
    if (person.id === personId || stateOf(context, person.id) === 'set_aside') continue;
    const matched = isExisting(context, person);
    const handover = handoverOf(context, person.id);
    const match = ownRows(context, person.id).some(
      ({ row: each }) =>
        !each.testOnly &&
        rowIncluded(context.changes, each, matched) &&
        heldKey({ ...each, ...signedValues(context, person.id, each, handover) }) === key
    );
    if (match) others.add(person.id);
  }
  return others.size;
}

export const isWritten = (context: ReviewContext, person: Person) =>
  stateOf(context, person.id) === 'checked' && personIncluded(context, person);

// The phase of the hiring record whose test the app waits for, as `employee_test_due` reads it.
const testedHiringPhase: Record<TrainingDomain, TrainingPhase> = {
  ssm: 'introductory_general',
  su: 'workplace',
};

function endsTerminated(context: ReviewContext, person: Person) {
  const leftOn = resolveField(context, person, 'leftOn');
  if (!isExisting(context, person)) return leftOn.value !== null;
  return (
    (leftOn.app !== null && leftOn.app !== undefined) ||
    (leftOn.value !== null && context.changes.people[person.id]?.fields?.leftOn?.replace === true)
  );
}

/**
 * The domains whose hiring test a written person is left without: a hiring record transcribed
 * from paper and no pass, ticked here or already in the app, which the app shows as
 * "Neverificat pe fișă".
 */
export function untestedDomains(context: ReviewContext, person: Person): TrainingDomain[] {
  if (endsTerminated(context, person)) return [];
  const rows = ownRows(context, person.id).map(({ row }) => row);
  const matched = isExisting(context, person);
  const tested = testedRows(context, person.id);
  return (['ssm', 'su'] as const).filter((domain) => {
    const own = rows.filter((row) => row.domain === domain);
    const transcribed = own.some(
      (row) =>
        !row.testOnly &&
        row.phase === testedHiringPhase[domain] &&
        rowIncluded(context.changes, row, matched)
    );
    const passed = own.some(
      (row) =>
        testInApp(row, matched) ||
        (tested.has(row.id) && testIncluded(context.changes, row, matched))
    );
    return transcribed && !passed;
  });
}

/** What confirming creates, for the confirm dialog: the people marked checked only. */
export function confirmSummary(context: ReviewContext) {
  const written = context.proposal.people.filter((person) => isWritten(context, person));
  const toCheck = context.proposal.people.filter(
    (person) => stateOf(context, person.id) === 'to_check'
  );
  const leaverOf = (person: Person) => resolveField(context, person, 'leftOn').value !== null;
  const created = written.filter((person) => !isExisting(context, person));
  const held = new Set<string>();
  let rows = 0;
  const tests = { ssm: 0, su: 0 };
  const files = new Set<string>();
  const unusual: { person: Person; row: SheetRow }[] = [];
  const untested: { person: Person; domain: TrainingDomain }[] = [];
  for (const person of written) {
    const seen = new Set<string>();
    const pages = pagesOf(context, person.id);
    for (const page of pages) files.add(page.fileId);
    const matched = isExisting(context, person);
    const tested = testedRows(context, person.id);
    const handover = handoverOf(context, person.id);
    for (const { row } of ownRows(context, person.id)) {
      if (
        row.test?.test === 'hiring' &&
        tested.has(row.id) &&
        testIncluded(context.changes, row, matched)
      ) {
        tests[row.domain] += 1;
      }
      if (row.testOnly || !rowIncluded(context.changes, row, matched)) continue;
      const values = signedValues(context, person.id, row, handover);
      const own = `${row.domain}|${row.phase}|${values.heldOn}`;
      if (seen.has(own)) continue;
      seen.add(own);
      rows += 1;
      held.add(heldKey({ ...row, ...values }));
      if (row.flags.includes('unusual_duration') || row.flags.includes('before_hire'))
        unusual.push({ person, row });
    }
    for (const domain of untestedDomains(context, person)) untested.push({ person, domain });
  }
  const allFiles = new Set(context.proposal.pages.map((page) => page.fileId));
  const noContact = written.filter((person) => withoutContact(context, person));
  const noCommute = written.filter(
    (person) => resolveField(context, person, 'commuteRoute').value === null
  );
  return {
    written,
    toCheck,
    created: created.filter((person) => !leaverOf(person)),
    leavers: created.filter(leaverOf),
    completed: written.filter((person) => isExisting(context, person)),
    trainingsHeld: held.size,
    rows,
    tests,
    files: files.size,
    filesLeft: allFiles.size - files.size,
    noContact,
    noCommute,
    untested,
    unusual,
  };
}

export const phaseLabel = (phase: TrainingPhase) => trainingPhaseLabels[phase];
