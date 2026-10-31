import {
  decodeCnp,
  isValidCnp,
  type TrainingDomain,
  type TrainingPhase,
  trainingPhaseLabels,
} from '@ssm-usor/contracts';

import type {
  EmployeeImportReview,
  EmployeeImportReviewChanges,
  EmployeeImportReviewChangesPeople,
  EmployeeImportReviewChangesPeopleFields,
} from '@/api/generated/api';
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

const differs = (a: FieldValue, b: FieldValue) =>
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
  const pages = new Set(pagesOf(context, person.id).map((page) => page.id));
  const options = field.options
    .map((option, index) => ({ ...option, index }))
    .filter((option) => option.pageIds.some((id) => pages.has(id)));
  const app = field.app;
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

export const isExisting = (person: Person) => person.existing !== null;

export function personName(context: Pick<ReviewContext, 'proposal' | 'changes'>, person: Person) {
  const last = resolveField(context, person, 'lastName').value;
  const first = resolveField(context, person, 'firstName').value;
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

const proposedRowIncluded = (row: SheetRow) =>
  !row.flags.includes('unsigned') &&
  !row.flags.includes('repeated') &&
  !row.flags.includes('in_app');

export const rowIncluded = (changes: Changes, row: SheetRow) =>
  changes.rows[row.id]?.included ?? proposedRowIncluded(row);

export function testIncluded(changes: Changes, row: SheetRow) {
  const test = row.test;
  if (!test) return false;
  const change = changes.rows[row.id];
  const proposed = test.verified && !test.inApp && (!row.testOnly || proposedRowIncluded(row));
  return change?.test ?? (row.testOnly ? (change?.included ?? proposed) : proposed);
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
  anchor: 'post' | 'cnp' | 'workplace' | 'personal' | 'employment' | 'trainings';
  label: string;
  tag: string;
  // A near post or workplace to confirm, rather than a gap.
  tone: 'destructive' | 'warning';
};

export type Note = { key: string; tag: string };

const rowDate = (row: SheetRow, values: RowValues) =>
  values.heldOn ? formatRoDate(values.heldOn) : trainingPhaseLabels[row.phase].toLowerCase();

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

export function decisionsOf(context: ReviewContext, person: Person): Decision[] {
  const decisions: Decision[] = [];
  const { proposal, changes } = context;
  const change = changes.people[person.id];
  if (!isExisting(person) && !change?.jobPositionId) {
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
            ? `Alege postul, pentru toate cele ${group.personIds.length} persoane`
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
    const effective = change?.cnpCorrection === true ? person.cnpCorrection : cnp.value;
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
        anchor: 'personal',
        label: 'Data nașterii nu se potrivește cu CNP-ul',
        tag: 'Data nașterii diferă de CNP',
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
        anchor: name === 'jobTitle' || name === 'hiredAt' ? 'employment' : 'personal',
        label: `${fieldLabels[name]}: fișele scriu valori diferite`,
        tag: `${fieldLabels[name]} diferă între fișe`,
        tone: 'destructive',
      });
    }
  }
  if (!isExisting(person)) {
    for (const name of requiredForNew) {
      const resolved = resolveField(context, person, name);
      if (!resolved.choice && !filled(resolved.value)) {
        decisions.push({
          key: `missing-${name}`,
          anchor: name === 'jobTitle' || name === 'hiredAt' ? 'employment' : 'personal',
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

  for (const { row } of ownRows(context, person.id)) {
    const values = rowValues(changes, row);
    if (!row.testOnly && rowIncluded(changes, row)) {
      const missing = (Object.keys(rowFieldLabels) as (keyof RowValues)[]).filter(
        (name) =>
          (name !== 'supplementaryReason' || row.phase === 'supplementary') && !filled(values[name])
      );
      if (missing.length > 0) {
        decisions.push({
          key: `row-${row.id}`,
          anchor: 'trainings',
          label: `Completează ${missing.map((name) => rowFieldLabels[name]).join(', ')} la instruirea din ${rowDate(row, values)}`,
          tag: `Lipsește ${rowFieldLabels[missing[0]!]} la o instruire`,
          tone: 'destructive',
        });
      } else if (values.heldOn !== null && values.heldOn > context.today) {
        decisions.push({
          key: `row-${row.id}`,
          anchor: 'trainings',
          label: `Corectează data instruirii din ${rowDate(row, values)}, care e în viitor`,
          tag: 'O instruire cu data în viitor',
          tone: 'destructive',
        });
      }
    }
    if (row.test && testIncluded(changes, row)) {
      const examiner = changes.rows[row.id]?.values ?? {};
      const name = 'examinerName' in examiner ? examiner.examinerName : row.test.examinerName;
      const title =
        'examinerJobTitle' in examiner ? examiner.examinerJobTitle : row.test.examinerJobTitle;
      if (!filled(name) || !filled(title)) {
        decisions.push({
          key: `test-${row.id}`,
          anchor: 'trainings',
          label: 'Completează examinatorul testului la angajare',
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
  const add = (key: string, tag: string) => {
    if (!notes.some((note) => note.key === key)) notes.push({ key, tag });
  };
  for (const { row } of rows) {
    if (row.flags.includes('unusual_duration') && rowIncluded(context.changes, row))
      add('duration', 'Durată neobișnuită la o instruire');
    if (row.flags.includes('before_hire') && rowIncluded(context.changes, row))
      add('before_hire', 'O instruire înainte de angajare');
    if (row.flags.includes('unsigned')) add('unsigned', 'Un rând nesemnat pe fișă');
    if (row.test && !row.test.verified && !row.test.inApp)
      add('verifier', 'Semnătura de verificare nu se vede');
  }
  if (pagesOf(context, person.id).some((page) => page.placement === 'placed_by_order'))
    add('order', 'O pagină pusă după ordine');
  if (person.flags.some((flag) => flag.code === 'leaver')) add('leaver', 'A plecat din firmă');
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

/** Moving on from a person with nothing left to decide checks them. */
export function leaving(context: ReviewContext, person: Person): Changes {
  if (stateOf(context, person.id) !== 'to_check') return context.changes;
  if (decisionsOf(context, person).length > 0) return context.changes;
  return withPersonChange(context.changes, person.id, (current) => ({
    ...current,
    state: 'checked',
  }));
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
  return (['ssm', 'psi'] as const).map((domain) => {
    const own = rows.filter(({ row }) => row.domain === domain);
    const shown = own.filter(({ row }) => !row.flags.includes('in_app'));
    const hiring = shown.filter(({ row }) => hiringPhases.has(row.phase) && !row.testOnly);
    return {
      domain,
      pages: [...new Set(own.map(({ page }) => page))],
      hiring: {
        domain,
        rows: hiring,
        test: hiring.find(({ row }) => row.test?.test === 'hiring') ?? null,
      },
      periodic: shown.filter(({ row }) => !hiringPhases.has(row.phase) && !row.testOnly),
      annualTests: shown.filter(({ row }) => row.testOnly),
      inApp: own.filter(({ row }) => row.flags.includes('in_app')),
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
    const match = ownRows(context, person.id).some(
      ({ row: each }) =>
        !each.testOnly &&
        rowIncluded(context.changes, each) &&
        heldKey({ ...each, ...rowValues(context.changes, each) }) === key
    );
    if (match) others.add(person.id);
  }
  return others.size;
}

export const isWritten = (context: ReviewContext, person: Person) =>
  stateOf(context, person.id) === 'checked' &&
  (context.changes.people[person.id]?.included ?? person.proposedIncluded);

/** What confirming creates, for the confirm dialog: the people marked checked only. */
export function confirmSummary(context: ReviewContext) {
  const written = context.proposal.people.filter((person) => isWritten(context, person));
  const toCheck = context.proposal.people.filter(
    (person) => stateOf(context, person.id) === 'to_check'
  );
  const leaverOf = (person: Person) => resolveField(context, person, 'leftOn').value !== null;
  const created = written.filter((person) => !isExisting(person));
  const held = new Set<string>();
  let rows = 0;
  const tests = { ssm: 0, psi: 0 };
  const files = new Set<string>();
  const unusual: { person: Person; row: SheetRow }[] = [];
  const unverified: Person[] = [];
  for (const person of written) {
    const seen = new Set<string>();
    const pages = pagesOf(context, person.id);
    for (const page of pages) files.add(page.fileId);
    let hiringRows = false;
    let hiringTest = false;
    for (const { row } of ownRows(context, person.id)) {
      if (row.test && testIncluded(context.changes, row)) {
        if (row.test.test === 'hiring') {
          tests[row.domain] += 1;
          hiringTest = true;
        }
      }
      if (row.testOnly || !rowIncluded(context.changes, row)) continue;
      const values = rowValues(context.changes, row);
      if (hiringPhases.has(row.phase) && row.domain === 'ssm') hiringRows = true;
      const own = `${row.domain}|${row.phase}|${values.heldOn}`;
      if (seen.has(own)) continue;
      seen.add(own);
      rows += 1;
      held.add(heldKey({ ...row, ...values }));
      if (row.flags.includes('unusual_duration') || row.flags.includes('before_hire'))
        unusual.push({ person, row });
    }
    if (hiringRows && !hiringTest) unverified.push(person);
  }
  const allFiles = new Set(context.proposal.pages.map((page) => page.fileId));
  const noContact = written.filter((person) =>
    person.flags.some((flag) => flag.code === 'no_contact')
  );
  const noCommute = written.filter(
    (person) => resolveField(context, person, 'commuteRoute').value === null
  );
  return {
    written,
    toCheck,
    created: created.filter((person) => !leaverOf(person)),
    leavers: created.filter(leaverOf),
    completed: written.filter(isExisting),
    trainingsHeld: held.size,
    rows,
    tests,
    files: files.size,
    filesLeft: allFiles.size - files.size,
    noContact,
    noCommute,
    unverified,
    unusual,
  };
}

export const phaseLabel = (phase: TrainingPhase) => trainingPhaseLabels[phase];
