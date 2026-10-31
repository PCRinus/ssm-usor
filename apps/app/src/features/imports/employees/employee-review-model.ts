import {
  bloodGroups,
  decodeCnp,
  isValidCnp,
  rhFactors,
  type TrainingDomain,
  trainingDomainLabels,
  type TrainingPhase,
  trainingPhaseLabels,
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

export const statesOf = (proposal: Proposal, changes: Changes): Record<string, PersonState> =>
  Object.fromEntries(
    proposal.people.map((person) => [person.id, changes.people[person.id]?.state ?? 'to_check'])
  );

export const fieldLabels: Record<FieldName, string> = {
  lastName: 'Numele',
  firstName: 'Prenumele',
  cnp: 'CNP-ul',
  employeeNumber: 'Numărul de marcă',
  birthDate: 'Data nașterii',
  birthPlace: 'Locul nașterii',
  homeAddress: 'Domiciliul',
  education: 'Studiile',
  qualification: 'Calificarea',
  bloodGroup: 'Grupa sanguină',
  rhFactor: 'Rh-ul',
  jobTitle: 'Funcția',
  hiredAt: 'Data angajării',
  leftOn: 'Data plecării',
  workplace: 'Locul de muncă',
  commuteRoute: 'Traseul spre locul de muncă',
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
  education: 'Studii',
  qualification: 'Calificarea',
  bloodGroup: 'Grupa sanguină',
  rhFactor: 'Rh',
  jobTitle: 'Funcția pe fișă',
  hiredAt: 'Data angajării',
  leftOn: 'Data plecării',
  workplace: 'Locul de muncă pe fișă',
  commuteRoute: 'Traseul spre locul de muncă',
  commuteMinutes: 'Durata drumului',
};

const requiredForNew = ['lastName', 'firstName', 'jobTitle', 'hiredAt'] as const;

export const requiredForNewField = (name: FieldName) =>
  (requiredForNew as readonly FieldName[]).includes(name);

export function pagesOf(context: Pick<ReviewContext, 'proposal' | 'changes'>, personId: string) {
  return context.proposal.pages.filter((page) => ownerOf(context, page) === personId);
}

export function ownerOf(context: Pick<ReviewContext, 'changes'>, page: SheetPage) {
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

export const differs = (a: FieldValue, b: FieldValue) =>
  typeof a === 'number' || typeof b === 'number'
    ? Number(a) !== Number(b)
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
  const replaced = differs(kept, value) && change?.replace === true;
  return { ...base, value: replaced ? value : kept, choice, edited, replaced };
}

export const matchOf = (changes: Changes, person: Person) =>
  changes.people[person.id]?.existing === false ? null : person.existing;

export const matchedName = (person: Person) =>
  [person.fields.lastName.app, person.fields.firstName.app].filter(Boolean).join(' ') ||
  'angajatul din aplicație';

export const isExisting = (context: Pick<ReviewContext, 'changes'>, person: Person) =>
  matchOf(context.changes, person) !== null;

// The sheets carry no email or phone, so a person created new has neither.
export const withoutContact = (context: Pick<ReviewContext, 'changes'>, person: Person) =>
  person.flags.some((flag) => flag.code === 'no_contact') ||
  (person.existing !== null && !isExisting(context, person));

/** Whether a person is written unless the member decides otherwise, as `@ssm-usor/import`. */
export const includedByDefault = (leftOn: string | null, existing: boolean) =>
  leftOn === null || existing;

export function includedOf(context: Pick<ReviewContext, 'proposal' | 'changes'>, person: Person) {
  const leftOn = resolveField(context, person, 'leftOn').value;
  return (
    context.changes.people[person.id]?.included ??
    includedByDefault(typeof leftOn === 'string' ? leftOn : null, isExisting(context, person))
  );
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
const proposedRowIncluded = (row: SheetRow, matched: boolean) =>
  !row.flags.includes('unsigned') &&
  !row.flags.includes('repeated') &&
  !(matched && row.flags.includes('in_app'));

export const rowIncluded = (changes: Changes, row: SheetRow, matched: boolean) =>
  changes.rows[row.id]?.included ?? proposedRowIncluded(row, matched);

export const testInApp = (row: SheetRow, matched: boolean) => matched && row.test?.inApp === true;

/** Whether the test a row carries is ticked; it is written only on a row of `testedRows`. */
export function testIncluded(changes: Changes, row: SheetRow, matched: boolean) {
  const test = row.test;
  if (!test) return false;
  const change = changes.rows[row.id];
  const proposed =
    test.verified &&
    !testInApp(row, matched) &&
    (!row.testOnly || proposedRowIncluded(row, matched));
  return change?.test ?? (row.testOnly ? (change?.included ?? proposed) : proposed);
}

const testPhases: Record<TrainingDomain, TrainingPhase[]> = {
  ssm: ['introductory_general'],
  psi: ['workplace', 'introductory_general'],
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
  for (const domain of ['ssm', 'psi'] as const) {
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
  for (const row of rows) if (row.testOnly && row.test) ids.add(row.id);
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

export function rowValues(changes: Changes, row: SheetRow): RowValues {
  const values = changes.rows[row.id]?.values ?? {};
  const pick = <K extends keyof RowValues>(name: K) =>
    (name in values ? values[name] : row[name]) as RowValues[K];
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
  tag: string;
  // A near post or workplace to confirm, rather than a gap.
  tone: 'destructive' | 'warning';
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

const rowFieldLabels: Partial<Record<keyof RowValues, string>> = {
  heldOn: 'data',
  durationMinutes: 'durata',
  trainerName: 'cine a instruit',
  trainerJobTitle: 'funcția instructorului',
  material: 'materialul',
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
    const change = context.changes.people[person.id];
    if (change?.state === 'set_aside' || !includedOf(context, person)) continue;
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
      label: 'Spune dacă e angajatul cu același nume din aplicație',
      tag: 'Angajat de confirmat',
      tone: 'destructive',
    });
  } else if (twin) {
    decisions.push({
      key: 'match',
      anchor: 'match',
      label: `E propus ca același angajat din aplicație ca ${personName(context, twin)}`,
      tag: 'Același angajat la două persoane',
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
      });
    } else if (status === 'confirm') {
      decisions.push({
        key: 'post',
        anchor: 'post',
        label: 'Confirmă postul propus',
        tag: 'Post de confirmat',
        tone: 'warning',
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
        tag: `${fieldLabels[name]} apare la două persoane`,
        tone: 'destructive',
      });
    } else if (takenByMatch(context, person, name)) {
      decisions.push({
        key: `duplicate-${name}`,
        anchor: fieldAnchor(context, person, name),
        label: `${fieldLabels[name]} e al angajatului din aplicație: scoate-l sau corectează-l`,
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
      } else if (!inMinutesRange(values.durationMinutes)) {
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
      const own = changes.rows[row.id]?.values ?? {};
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
      const name = 'examinerName' in own ? own.examinerName : row.test.examinerName;
      const title = 'examinerJobTitle' in own ? own.examinerJobTitle : row.test.examinerJobTitle;
      if (!filled(name) || !filled(title)) {
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
  if (pagesOf(context, person.id).some((page) => page.placement === 'placed_by_order'))
    add('order', 'O pagină pusă după ordine');
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
};

export function peopleViews(context: ReviewContext): PersonView[] {
  return context.proposal.people.map((person, index) => ({
    person,
    number: index + 1,
    state: stateOf(context, person.id),
    name: personName(context, person),
    decisions: decisionsOf(context, person),
    notes: notesOf(context, person),
  }));
}

export function peopleCounts(context: Pick<ReviewContext, 'proposal' | 'states'>) {
  const counts = { total: 0, toCheck: 0, checked: 0, setAside: 0 };
  for (const person of context.proposal.people) {
    counts.total += 1;
    const state = stateOf(context, person.id);
    if (state === 'checked') counts.checked += 1;
    else if (state === 'set_aside') counts.setAside += 1;
    else counts.toCheck += 1;
  }
  return counts;
}

export function toCheckGroups(views: PersonView[]) {
  const toCheck = views.filter((view) => view.state === 'to_check');
  return {
    decide: toCheck.filter((view) => view.decisions.length > 0),
    unopened: toCheck.filter((view) => view.decisions.length === 0),
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
  return (['ssm', 'psi'] as const).map((domain) => {
    const own = rows.filter(({ row }) => row.domain === domain);
    const shown = own.filter(({ row }) => !inApp(row));
    const hiring = shown.filter(({ row }) => hiringPhases.has(row.phase) && !row.testOnly);
    return {
      domain,
      pages: [...new Set(own.map(({ page }) => page))],
      hiring: {
        domain,
        rows: hiring,
        test: own.find(({ row }) => !row.testOnly && tested.has(row.id)) ?? null,
      },
      periodic: shown.filter(({ row }) => !hiringPhases.has(row.phase) && !row.testOnly),
      annualTests: shown.filter(({ row }) => row.testOnly),
      inApp: own.filter(({ row }) => inApp(row)),
    };
  });
}

type HeldKeyRow = { domain: string; phase: string } & RowValues;

const heldKey = (row: HeldKeyRow) =>
  JSON.stringify([
    row.domain,
    row.phase,
    row.heldOn,
    foldText(row.trainerName ?? ''),
    row.durationMinutes,
    foldText(row.material ?? ''),
    row.phase === 'supplementary' ? row.supplementaryReason : null,
  ]);

/**
 * The people a row's training is held with: rows of others the confirm groups with it, as one
 * training held, when domain, phase, date, trainer, duration and material all match.
 */
export function heldWith(context: ReviewContext, personId: string, row: SheetRow) {
  const key = heldKey({ ...row, ...rowValues(context.changes, row) });
  const others = new Set<string>();
  for (const person of context.proposal.people) {
    if (person.id === personId || stateOf(context, person.id) === 'set_aside') continue;
    const matched = isExisting(context, person);
    const match = ownRows(context, person.id).some(
      ({ row: each }) =>
        !each.testOnly &&
        rowIncluded(context.changes, each, matched) &&
        heldKey({ ...each, ...rowValues(context.changes, each) }) === key
    );
    if (match) others.add(person.id);
  }
  return others.size;
}

export const isWritten = (context: ReviewContext, person: Person) =>
  stateOf(context, person.id) === 'checked' && includedOf(context, person);

// The phase of the hiring record whose test the app waits for, as `employee_test_due` reads it.
const testedHiringPhase: Record<TrainingDomain, TrainingPhase> = {
  ssm: 'introductory_general',
  psi: 'workplace',
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
  return (['ssm', 'psi'] as const).filter((domain) => {
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
  const tests = { ssm: 0, psi: 0 };
  const files = new Set<string>();
  const unusual: { person: Person; row: SheetRow }[] = [];
  const untested: { person: Person; domain: TrainingDomain }[] = [];
  for (const person of written) {
    const seen = new Set<string>();
    const pages = pagesOf(context, person.id);
    for (const page of pages) files.add(page.fileId);
    const matched = isExisting(context, person);
    const tested = testedRows(context, person.id);
    for (const { row } of ownRows(context, person.id)) {
      if (
        row.test?.test === 'hiring' &&
        tested.has(row.id) &&
        testIncluded(context.changes, row, matched)
      ) {
        tests[row.domain] += 1;
      }
      if (row.testOnly || !rowIncluded(context.changes, row, matched)) continue;
      const values = rowValues(context.changes, row);
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
