import {
  bloodGroups,
  decodeCnp,
  type EmployeeImportChanges,
  type EmployeeImportFieldName,
  employeeImportFieldNames,
  type ImportBlocker,
  isValidCnp,
  type KnowledgeTest,
  rhFactors,
  type SupplementaryTrainingReason,
  supplementaryTrainingReasons,
  testResultMaterial,
  type TrainingDomain,
  type TrainingPhase,
} from '@ssm-usor/contracts';

import { hiringTestRowIds, includedByDefault } from './employee-import';
import type { ExistingEmployee } from './employee-match';
import type {
  EmployeeImportProposal,
  PersonField,
  ProposedSheetPage,
  ProposedSheetPerson,
  ProposedSheetRow,
} from './employee-proposal';
import { groupHeldTrainings, type HeldRow } from './held-trainings';
import { foldText } from './match';

type Value = string | number;

/**
 * An employee to create, or with `id` an existing employee of the client to complete: its empty
 * columns are filled and those in `replace` overwritten, the others kept. Every column is
 * optional on an existing employee; a new one has `job_position_id`, `last_name`, `first_name`,
 * `job_title` and `hired_at`, and `status` with `terminated_at` for a leaver. A post is never
 * created here: `job_position_id` is always one of the client's.
 */
export interface EmployeePayloadRow {
  // The person's id in the proposal, which the other lists name as `employee_key`.
  key: string;
  id?: string;
  replace?: string[];
  job_position_id?: string;
  workplace_id?: string;
  last_name?: string;
  first_name?: string;
  cnp?: string;
  employee_number?: string;
  birth_date?: string;
  birth_place?: string;
  home_address?: string;
  education?: string;
  qualification?: string;
  blood_group?: string;
  rh_factor?: string;
  job_title?: string;
  hired_at?: string;
  commute_route?: string;
  commute_minutes?: number;
  status?: 'active' | 'terminated';
  terminated_at?: string;
}

/** A training held, `source` paper, with one record per attendee. */
export interface TrainingPayloadRow {
  key: string;
  domain: TrainingDomain;
  phase: TrainingPhase;
  held_on: string;
  duration_minutes: number;
  material: string;
  trainer_name: string;
  trainer_job_title: string;
  // Both or neither.
  verifier_name?: string;
  verifier_job_title?: string;
  supplementary_reason?: SupplementaryTrainingReason;
  records: {
    employee_key: string;
    // "Admis la lucru": all three or none, on a workplace training only.
    admitted_on?: string;
    admitted_by_name?: string;
    admitted_by_job_title?: string;
  }[];
}

/** A paper test result, grade `admis`, `source` paper. */
export interface TestResultPayloadRow {
  employee_key: string;
  domain: TrainingDomain;
  test: KnowledgeTest;
  taken_on: string;
  material: string;
  examiner_name: string;
  examiner_job_title: string;
}

/**
 * A photograph, or with `page` a page of a PDF, kept as the employee's file in the import's
 * folder: the photograph's upright copy, the page's image.
 */
export interface EmployeeFilePayloadRow {
  employee_key: string;
  import_file_id: string;
  page?: number;
}

type Counts = { changed: number; unticked: number; kept: number };

export type EmployeeImportQuality = Record<'people' | 'rows' | 'tests', Counts>;

/**
 * The JSON `apply_employee_import(import, expected version, payload)` takes (ADR 032): shaped
 * like the tables, every list naming an employee by its `key`.
 */
export interface EmployeeImportPayload {
  employees: EmployeePayloadRow[];
  trainings: TrainingPayloadRow[];
  test_results: TestResultPayloadRow[];
  files: EmployeeFilePayloadRow[];
  quality: EmployeeImportQuality;
}

export interface EmployeeImportRecords {
  jobPositions: readonly { id: string }[];
  workplaces: readonly { id: string }[];
  employees: readonly ExistingEmployee[];
}

export interface EmployeeMapping {
  payload: EmployeeImportPayload;
  blockers: ImportBlocker[];
  // Still "De verificat": left out, which confirming warns about by name.
  toCheck: string[];
}

const columns: Record<Exclude<EmployeeImportFieldName, 'workplace' | 'leftOn'>, string> = {
  lastName: 'last_name',
  firstName: 'first_name',
  cnp: 'cnp',
  employeeNumber: 'employee_number',
  birthDate: 'birth_date',
  birthPlace: 'birth_place',
  homeAddress: 'home_address',
  education: 'education',
  qualification: 'qualification',
  bloodGroup: 'blood_group',
  rhFactor: 'rh_factor',
  jobTitle: 'job_title',
  hiredAt: 'hired_at',
  commuteRoute: 'commute_route',
  commuteMinutes: 'commute_minutes',
};

// The lengths the employee form and the database take.
const textLimits: Partial<Record<EmployeeImportFieldName, [number, number]>> = {
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

function allowed(name: EmployeeImportFieldName, value: Value): boolean {
  if (name === 'cnp') return typeof value === 'string' && isValidCnp(value);
  if (name === 'bloodGroup') return (bloodGroups as readonly Value[]).includes(value);
  if (name === 'rhFactor') return (rhFactors as readonly Value[]).includes(value);
  if (name === 'commuteMinutes') {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 600;
  }
  if (name === 'birthDate' || name === 'hiredAt' || name === 'leftOn') {
    return typeof value === 'string' && isoDate.test(value);
  }
  const limits = textLimits[name];
  if (!limits || typeof value !== 'string') return typeof value === 'string';
  return value.trim().length >= limits[0] && value.trim().length <= limits[1];
}

const differs = (a: Value, b: Value) =>
  typeof a === 'number' || typeof b === 'number'
    ? Number(a) !== Number(b)
    : foldText(a) !== foldText(b);

interface Resolved {
  value: Value | null;
  // A sheet's value set over a different one the app has.
  replace: boolean;
  changed: boolean;
}

type PersonChange = EmployeeImportChanges['people'][string];
type RowChange = EmployeeImportChanges['rows'][string];

function resolveField(
  field: PersonField<Value>,
  change: NonNullable<PersonChange['fields']>[EmployeeImportFieldName],
  pages: ReadonlySet<string>,
  block: (code: ImportBlocker['code']) => void
): Resolved {
  if (change?.value !== undefined) {
    return {
      value: change.value,
      replace: field.app !== undefined && change.value !== field.app,
      changed: true,
    };
  }
  const own = field.options.filter((option) => option.pageIds.some((id) => pages.has(id)));
  const app = field.app ?? null;
  let value: Value | null = null;
  if (change?.option !== undefined) {
    value = field.options[change.option]?.value ?? null;
    if (value === null) block('invalid');
  } else if (own.length === 1) {
    value = own[0]!.value;
  } else if (own.length > 1) {
    // Kept by default, the app's value settles a choice between the pages.
    if (app === null) block('choice');
    value = app;
  }
  if (value === null) return { value: app, replace: false, changed: change?.option !== undefined };
  if (app === null) return { value, replace: false, changed: change?.option !== undefined };
  const replace = differs(app, value) && change?.replace === true;
  return {
    value: replace ? value : app,
    replace,
    changed: replace || change?.option !== undefined,
  };
}

const rowValue = <K extends keyof ProposedSheetRow>(
  row: ProposedSheetRow,
  change: RowChange | undefined,
  name: K
) =>
  (change?.values && name in change.values
    ? change.values[name]
    : row[name]) as ProposedSheetRow[K];

const admissionValue = (
  row: ProposedSheetRow,
  change: RowChange | undefined,
  name: 'admittedOn' | 'admittedByName' | 'admittedByJobTitle'
) =>
  (change?.values && name in change.values
    ? change.values[name]
    : (row.admission?.[name] ?? null)) as string | null;

const filled = (value: unknown): value is Value =>
  value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '');

function dropEmpty<T extends object>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => filled(value) || Array.isArray(value))
  ) as T;
}

// What the sheets give, or the member wrote, whatever the app's value: every page's while they
// disagree.
function sheetValues(
  field: PersonField<Value>,
  change: NonNullable<PersonChange['fields']>[EmployeeImportFieldName],
  pages: ReadonlySet<string>
): Value[] {
  if (change?.value !== undefined) return change.value === null ? [] : [change.value];
  const chosen = change?.option === undefined ? undefined : field.options[change.option];
  if (chosen) return [chosen.value];
  return field.options
    .filter((option) => option.pageIds.some((id) => pages.has(id)))
    .map((option) => option.value);
}

/** The employee a person completes, unless the member declined the match. */
export function matchOf(person: ProposedSheetPerson, change: PersonChange | undefined) {
  return change?.existing === false ? null : person.existing;
}

// A declined match leaves the person new: the employee's values are no one's to keep.
function fieldsOf(person: ProposedSheetPerson, change: PersonChange | undefined) {
  if (matchOf(person, change) !== null || person.existing === null) return person.fields;
  return Object.fromEntries(
    Object.entries(person.fields).map(([name, field]) => [name, { options: field.options }])
  ) as ProposedSheetPerson['fields'];
}

/**
 * The files a person's pages become: each photograph, and each of their own pages of a PDF, so
 * a PDF holding several people's pages gives each of them only theirs.
 */
export function sheetFilesOf(
  personId: string,
  pages: readonly Pick<ProposedSheetPage, 'fileId' | 'page'>[]
): EmployeeFilePayloadRow[] {
  const files = new Map<string, EmployeeFilePayloadRow>();
  for (const { fileId, page } of pages) {
    files.set(`${fileId}:${page ?? ''}`, {
      employee_key: personId,
      import_file_id: fileId,
      ...(page === null ? {} : { page }),
    });
  }
  return [...files.values()];
}

/**
 * The proposal with the member's changes, shaped as `apply_employee_import` takes it, and what
 * keeps it from being confirmed. Only people marked checked are written.
 */
export function toEmployeePayload(input: {
  proposal: EmployeeImportProposal;
  changes: EmployeeImportChanges | null;
  records: EmployeeImportRecords;
  // The Romanian day.
  today: string;
}): EmployeeMapping {
  const { proposal, records, today } = input;
  const changes: EmployeeImportChanges = input.changes ?? {
    people: {},
    jobTitles: {},
    workplaces: {},
    rows: {},
    pages: {},
  };
  const blockers: ImportBlocker[] = [];
  const block = (path: string, code: ImportBlocker['code']) => {
    if (!blockers.some((known) => known.path === path && known.code === code)) {
      blockers.push({ path, code });
    }
  };
  const quality: EmployeeImportQuality = {
    people: { changed: 0, unticked: 0, kept: 0 },
    rows: { changed: 0, unticked: 0, kept: 0 },
    tests: { changed: 0, unticked: 0, kept: 0 },
  };
  const positionIds = new Set(records.jobPositions.map((position) => position.id));
  const workplaceIds = new Set(records.workplaces.map((workplace) => workplace.id));
  const peopleIds = new Set(proposal.people.map((person) => person.id));

  const pagesOf = new Map<string, string[]>();
  for (const page of proposal.pages) {
    const assigned = changes.pages[page.id];
    const personId = assigned === undefined ? page.personId : assigned.personId;
    if (personId === null) continue;
    if (!peopleIds.has(personId)) {
      block(`pages.${page.id}`, 'unknown_reference');
      continue;
    }
    pagesOf.set(personId, [...(pagesOf.get(personId) ?? []), page.id]);
  }

  const toCheck: string[] = [];
  const written = proposal.people.filter((person) => {
    const change = changes.people[person.id];
    const state = change?.state ?? 'to_check';
    if (state === 'to_check') toCheck.push(person.id);
    const leftOn = resolveField(
      fieldsOf(person, change).leftOn,
      change?.fields?.leftOn,
      new Set(pagesOf.get(person.id) ?? []),
      () => {}
    ).value;
    const included =
      state === 'checked' &&
      (change?.included ??
        includedByDefault(
          typeof leftOn === 'string' ? leftOn : null,
          matchOf(person, change) !== null
        ));
    if (!included) quality.people.unticked++;
    return included;
  });

  const employees: EmployeePayloadRow[] = [];
  const heldRows: HeldRow[] = [];
  const admissions = new Map<string, TrainingPayloadRow['records'][number]>();
  const testResults: TestResultPayloadRow[] = [];
  const files: EmployeeFilePayloadRow[] = [];
  const cnps = new Map<string, string>();
  const numbers = new Map<string, string>();
  const completed = new Set<string>();

  for (const person of written) {
    const change = changes.people[person.id];
    const pages = new Set(pagesOf.get(person.id) ?? []);
    const path = `people.${person.id}`;
    const match = matchOf(person, change);
    const existing = match
      ? records.employees.find((employee) => employee.id === match.employeeId)
      : undefined;
    if (match && !existing) block(path, 'unknown_reference');
    if (match?.matchedBy === 'name_only' && change?.existing === undefined) {
      block(`${path}.existing`, 'choice');
    }
    if (existing && completed.has(existing.id)) block(`${path}.existing`, 'invalid');
    if (existing) completed.add(existing.id);

    const fields = fieldsOf(person, change);
    const values = {} as Record<EmployeeImportFieldName, Value | null>;
    const replace: string[] = [];
    let changed = false;
    for (const name of employeeImportFieldNames) {
      const field = fields[name] as PersonField<Value>;
      const fieldPath = `${path}.fields.${name}`;
      const resolved = resolveField(field, change?.fields?.[name], pages, (code) =>
        block(fieldPath, code)
      );
      let value = resolved.value;
      if (name === 'cnp' && change?.cnpCorrection === true && person.cnpCorrection !== null) {
        value = person.cnpCorrection;
        if (field.app !== undefined && field.app !== null && field.app !== value)
          replace.push('cnp');
        changed = true;
      } else if (resolved.replace && name in columns) {
        replace.push(columns[name as keyof typeof columns]);
      }
      changed ||= resolved.changed;
      values[name] = value;
      if (value !== null && !allowed(name, value)) block(fieldPath, 'invalid');
    }
    const cnp = values.cnp;
    if (typeof cnp === 'string' && isValidCnp(cnp) && typeof values.birthDate === 'string') {
      const encoded = decodeCnp(cnp).birthDate;
      if (encoded !== null && encoded !== values.birthDate)
        block(`${path}.fields.birthDate`, 'invalid');
    }
    for (const [taken, value, name] of [
      [cnps, cnp, 'cnp'],
      [numbers, values.employeeNumber, 'employeeNumber'],
    ] as const) {
      if (value === null) continue;
      const key = foldText(String(value));
      const other = records.employees.find(
        (employee) =>
          employee.id !== existing?.id &&
          foldText(String((name === 'cnp' ? employee.cnp : employee.employeeNumber) ?? '')) === key
      );
      if (other || (taken.has(key) && taken.get(key) !== person.id))
        block(`${path}.fields.${name}`, 'invalid');
      taken.set(key, person.id);
    }

    // A rehire is a new employee in the app, never the former one reactivated.
    const leftAt = existing?.terminatedAt ?? null;
    if (
      leftAt !== null &&
      sheetValues(fields.hiredAt, change?.fields?.hiredAt, pages).some(
        (day) => String(day) > leftAt
      )
    ) {
      block(`${path}.fields.hiredAt`, 'invalid');
    }

    const row: EmployeePayloadRow = { key: person.id };
    if (existing) row.id = existing.id;
    for (const [name, column] of Object.entries(columns)) {
      const value = values[name as EmployeeImportFieldName];
      if (filled(value)) (row as unknown as Record<string, Value>)[column] = value;
    }
    if (!existing) {
      for (const name of ['lastName', 'firstName', 'jobTitle', 'hiredAt'] as const) {
        const fieldPath = `${path}.fields.${name}`;
        if (!filled(values[name]) && !blockers.some((known) => known.path === fieldPath)) {
          block(fieldPath, 'missing');
        }
      }
      const title = proposal.jobTitles.find((group) => group.id === person.jobTitleId);
      const positionId =
        change?.jobPositionId ??
        (title ? (changes.jobTitles[title.id]?.jobPositionId ?? title.proposedId) : null);
      if (positionId === null)
        block(title ? `jobTitles.${title.id}` : `${path}.jobPosition`, 'missing');
      else if (!positionIds.has(positionId)) block(`${path}.jobPosition`, 'unknown_reference');
      else row.job_position_id = positionId;
    }
    const group = proposal.workplaces.find((each) => each.id === person.workplaceId);
    const onlyWorkplace = records.workplaces.length === 1 ? records.workplaces[0]!.id : null;
    const workplaceId =
      change?.workplaceId !== undefined
        ? change.workplaceId
        : group
          ? changes.workplaces[group.id] !== undefined
            ? changes.workplaces[group.id]!.workplaceId
            : group.proposedId
          : onlyWorkplace;
    if (workplaceId !== null && !workplaceIds.has(workplaceId)) {
      block(`${path}.workplace`, 'unknown_reference');
    } else if (workplaceId !== null) {
      row.workplace_id = workplaceId;
    }
    const leftOn = values.leftOn;
    const leaving =
      typeof leftOn === 'string' &&
      (!existing || (existing.terminatedAt === null && change?.fields?.leftOn?.replace === true));
    if (leaving) {
      row.status = 'terminated';
      row.terminated_at = leftOn;
      if (existing) replace.push('status', 'terminated_at');
    } else if (!existing) {
      row.status = 'active';
    }
    if (replace.length > 0) row.replace = [...new Set(replace)];
    employees.push(row);
    if (changed) quality.people.changed++;
    else quality.people.kept++;

    const ownPages = proposal.pages.filter((page) => pages.has(page.id));
    const rows = ownPages.flatMap((page) => page.rows);
    files.push(...sheetFilesOf(person.id, ownPages));

    const hiringTests = hiringTestRowIds(
      rows.map((each) => ({ ...each, heldOn: rowValue(each, changes.rows[each.id], 'heldOn') }))
    );
    const seen = new Set<string>();
    for (const sheetRow of rows) {
      addRow(sheetRow, person, existing, seen, hiringTests);
    }
  }

  function addRow(
    sheetRow: ProposedSheetRow,
    person: ProposedSheetPerson,
    existing: ExistingEmployee | undefined,
    seen: Set<string>,
    hiringTests: ReadonlySet<string>
  ) {
    const change = changes.rows[sheetRow.id];
    const path = `rows.${sheetRow.id}`;
    const value = <K extends keyof ProposedSheetRow>(name: K) => rowValue(sheetRow, change, name);
    const heldOn = value('heldOn');
    const changed = change?.values !== undefined && Object.keys(change.values).length > 0;
    const inApp =
      !sheetRow.testOnly &&
      heldOn !== null &&
      (existing?.trainings.some(
        (training) =>
          training.domain === sheetRow.domain &&
          training.phase === sheetRow.phase &&
          training.heldOn === heldOn
      ) ??
        false);
    const proposedIncluded =
      !sheetRow.flags.includes('unsigned') && !sheetRow.flags.includes('repeated') && !inApp;

    const test = sheetRow.testOnly || hiringTests.has(sheetRow.id) ? sheetRow.test : null;
    if (test) {
      const testInApp = existing?.testResults.some(
        (result) =>
          result.domain === sheetRow.domain &&
          result.test === test.test &&
          (test.test === 'hiring' || result.takenOn === heldOn)
      );
      const proposedTest = test.verified && !testInApp && (!sheetRow.testOnly || proposedIncluded);
      const included =
        change?.test ?? (sheetRow.testOnly ? (change?.included ?? proposedTest) : proposedTest);
      if (!included) {
        if (proposedTest) quality.tests.unticked++;
      } else {
        const examinerName = (change?.values?.examinerName ?? test.examinerName) as string | null;
        const examinerJobTitle = (change?.values?.examinerJobTitle ?? test.examinerJobTitle) as
          string | null;
        // A sheet dates its test only by the row it signs, so the row's date as the member left
        // it is the test's.
        const takenOn = filled(heldOn) ? String(heldOn) : null;
        const pastDay = takenOn !== null && isoDate.test(takenOn) && takenOn <= today;
        if (takenOn === null) block(`${path}.test.takenOn`, 'missing');
        else if (!pastDay) block(`${path}.test.takenOn`, 'invalid');
        if (!filled(examinerName)) block(`${path}.test.examinerName`, 'missing');
        if (!filled(examinerJobTitle)) block(`${path}.test.examinerJobTitle`, 'missing');
        if (pastDay && filled(examinerName) && filled(examinerJobTitle)) {
          testResults.push({
            employee_key: person.id,
            domain: sheetRow.domain,
            test: test.test,
            taken_on: takenOn,
            material: testResultMaterial(sheetRow.domain, test.test),
            examiner_name: String(examinerName).trim(),
            examiner_job_title: String(examinerJobTitle).trim(),
          });
        }
        if (change?.test !== undefined && change.test !== proposedTest) quality.tests.changed++;
        else quality.tests.kept++;
      }
    }
    if (sheetRow.testOnly) return;

    const included = change?.included ?? proposedIncluded;
    if (!included) {
      if (proposedIncluded) quality.rows.unticked++;
      return;
    }
    if (changed || (change?.included !== undefined && change.included !== proposedIncluded))
      quality.rows.changed++;
    else quality.rows.kept++;

    const duration = value('durationMinutes');
    const trainerName = value('trainerName');
    const trainerJobTitle = value('trainerJobTitle');
    const material = value('material');
    const reason = value('supplementaryReason');
    const required: [string, unknown][] = [
      ['heldOn', heldOn],
      ['durationMinutes', duration],
      ['trainerName', trainerName],
      ['trainerJobTitle', trainerJobTitle],
      ['material', material],
    ];
    if (sheetRow.phase === 'supplementary') required.push(['supplementaryReason', reason]);
    let complete = true;
    for (const [name, each] of required) {
      if (!filled(each)) {
        block(`${path}.${name}`, 'missing');
        complete = false;
      }
    }
    if (filled(heldOn) && (!isoDate.test(String(heldOn)) || String(heldOn) > today)) {
      block(`${path}.heldOn`, 'invalid');
      complete = false;
    }
    if (
      filled(duration) &&
      !(Number.isInteger(duration) && Number(duration) >= 1 && Number(duration) <= 600)
    ) {
      block(`${path}.durationMinutes`, 'invalid');
      complete = false;
    }
    if (
      sheetRow.phase === 'supplementary' &&
      filled(reason) &&
      !(supplementaryTrainingReasons as readonly unknown[]).includes(reason)
    ) {
      block(`${path}.supplementaryReason`, 'invalid');
      complete = false;
    }
    if (!complete) return;
    // A person's two rows of one domain, phase and day are one training of theirs.
    const key = `${sheetRow.domain}|${sheetRow.phase}|${heldOn}`;
    if (seen.has(key)) return;
    seen.add(key);

    const verifierName = value('verifierName');
    const verifierJobTitle = value('verifierJobTitle');
    const hasVerifier = filled(verifierName) && filled(verifierJobTitle);
    heldRows.push({
      rowId: sheetRow.id,
      personId: person.id,
      domain: sheetRow.domain,
      phase: sheetRow.phase,
      heldOn: String(heldOn),
      durationMinutes: Number(duration),
      trainerName: String(trainerName).trim(),
      trainerJobTitle: String(trainerJobTitle).trim(),
      verifierName: hasVerifier ? String(verifierName).trim() : null,
      verifierJobTitle: hasVerifier ? String(verifierJobTitle).trim() : null,
      material: String(material).trim(),
      supplementaryReason:
        sheetRow.phase === 'supplementary' ? (reason as SupplementaryTrainingReason) : null,
    });
    const admittedOn = admissionValue(sheetRow, change, 'admittedOn');
    const admittedByName = admissionValue(sheetRow, change, 'admittedByName');
    const admittedByJobTitle = admissionValue(sheetRow, change, 'admittedByJobTitle');
    admissions.set(
      sheetRow.id,
      dropEmpty({
        employee_key: person.id,
        ...(sheetRow.phase === 'workplace' &&
        filled(admittedOn) &&
        filled(admittedByName) &&
        filled(admittedByJobTitle)
          ? {
              admitted_on: admittedOn,
              admitted_by_name: admittedByName.trim(),
              admitted_by_job_title: admittedByJobTitle.trim(),
            }
          : {}),
      })
    );
  }

  const trainings: TrainingPayloadRow[] = groupHeldTrainings(heldRows).map((held) =>
    dropEmpty({
      key: held.key,
      domain: held.domain,
      phase: held.phase,
      held_on: held.heldOn,
      duration_minutes: held.durationMinutes,
      material: held.material,
      trainer_name: held.trainerName,
      trainer_job_title: held.trainerJobTitle!,
      verifier_name: held.verifierName ?? undefined,
      verifier_job_title: held.verifierJobTitle ?? undefined,
      supplementary_reason: held.supplementaryReason ?? undefined,
      records: held.rows.map(({ rowId }) => admissions.get(rowId)!),
    })
  );

  return {
    payload: { employees, trainings, test_results: testResults, files, quality },
    blockers,
    toCheck,
  };
}
