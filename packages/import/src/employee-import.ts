import {
  type EmployeeImportFieldName,
  employeeImportFieldNames,
  isValidCnp,
  type TrainingDomain,
  type TrainingPhase,
} from '@ssm-usor/contracts';

import { checkCnp, parseBloodType, rowFlags } from './employee-checks';
import {
  type ClientWorkplace,
  type ExistingEmployee,
  findExistingEmployee,
  matchJobTitle,
  matchWorkplace,
  type Named,
} from './employee-match';
import {
  type EmployeeImportProposal,
  employeeImportProposalSchema,
  type JobTitleGroup,
  type PersonField,
  type PersonFlag,
  type ProposedSheetPage,
  type ProposedSheetPerson,
  type ProposedSheetRow,
  type RowFlagCode,
  type SheetPersonFields,
  type ThemeFillableField,
  type WorkplaceGroup,
} from './employee-proposal';
import { foldText, sameName } from './match';
import { sheetDate, type SheetPage, type SheetPageKind, type SheetRow } from './sheet-page';
import { compactCnp, placePages } from './sheet-people';

export interface SheetPageInput {
  id: string;
  fileId: string;
  page: number | null;
  label: string;
  reading: SheetPage | null;
}

export interface ThemeQuery {
  domain: TrainingDomain;
  phase: TrainingPhase;
  heldOn: string | null;
  jobPositionId: string | null;
}

export type ThemeDefaults = Partial<{
  trainerName: string | null;
  trainerJobTitle: string | null;
  material: string | null;
  durationMinutes: number | null;
}>;

/**
 * What the client's training themes and trainer propose for a training, as the app proposes it
 * for one typed by hand; null when they propose nothing.
 */
export type TrainingThemes = (query: ThemeQuery) => ThemeDefaults | null;

export interface EmployeeImportClient {
  jobPositions: readonly Named[];
  workplaces: readonly ClientWorkplace[];
  employees: readonly (ExistingEmployee & { jobPositionId: string | null })[];
}

export interface EmployeeImportInput {
  // In the upload's order, which places a page without a name after the one before it.
  pages: readonly SheetPageInput[];
  client: EmployeeImportClient;
  themes: TrainingThemes;
  // The Romanian day.
  today: string;
}

const priority: SheetPageKind[] = [
  'ssm_sheet_front',
  'psi_sheet_front',
  'commute_declaration',
  'ssm_periodic',
  'psi_periodic',
  'other',
];

const commutePriority: SheetPageKind[] = [
  'commute_declaration',
  ...priority.slice(0, 2),
  ...priority.slice(3),
];

type FieldValue = string | number;

const nonAscii = (value: FieldValue) =>
  typeof value === 'number' ? 0 : (value.match(/[^\p{ASCII}]/gu)?.length ?? 0);

const sameValue = (a: FieldValue, b: FieldValue) =>
  typeof a === 'number' || typeof b === 'number' ? a === b : foldText(a) === foldText(b);

function addOption(field: PersonField<FieldValue>, value: FieldValue, pageId: string) {
  const known = field.options.find((option) => sameValue(option.value, value));
  if (!known) {
    field.options.push({ value, pageIds: [pageId] });
    return;
  }
  if (!known.pageIds.includes(pageId)) known.pageIds.push(pageId);
  if (nonAscii(value) > nonAscii(known.value)) known.value = value;
}

const text = (value: string | null) => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

const emptyFields = () =>
  Object.fromEntries(
    employeeImportFieldNames.map((name) => [name, { options: [] }])
  ) as unknown as Record<EmployeeImportFieldName, PersonField<FieldValue>>;

const dateFields = new Set<EmployeeImportFieldName>(['birthDate', 'hiredAt', 'leftOn']);

interface ReadPage {
  input: SheetPageInput;
  reading: SheetPage;
}

function personFields(pages: readonly ReadPage[], today: string) {
  const fields = emptyFields();
  const flags: PersonFlag[] = [];
  const ordered = (order: SheetPageKind[]) =>
    [...pages].sort(
      (a, b) => order.indexOf(a.reading.pageKind) - order.indexOf(b.reading.pageKind)
    );
  const written = (page: SheetPage, name: EmployeeImportFieldName): string | number | null => {
    if (name in page.person) return page.person[name as keyof SheetPage['person']];
    return page.fields[name as keyof SheetPage['fields']] ?? null;
  };
  for (const name of employeeImportFieldNames) {
    if (name === 'bloodGroup' || name === 'rhFactor') continue;
    const order = name.startsWith('commute') ? commutePriority : priority;
    for (const { input, reading } of ordered(order)) {
      const value = written(reading, name);
      if (value === null) continue;
      if (typeof value === 'number') {
        if (name === 'commuteMinutes' && Number.isInteger(value) && value >= 1 && value <= 600) {
          addOption(fields[name], value, input.id);
        }
        continue;
      }
      if (dateFields.has(name)) {
        const date = sheetDate(value, today);
        if (!date) continue;
        if (
          date.monthOnly &&
          !flags.some((flag) => flag.code === 'month_only' && flag.field === name)
        ) {
          flags.push({ code: 'month_only', field: name });
        }
        addOption(fields[name], date.date, input.id);
        continue;
      }
      const cleaned = text(value);
      if (cleaned === null) continue;
      addOption(
        fields[name],
        name === 'cnp' ? (compactCnp(cleaned) ?? cleaned) : cleaned,
        input.id
      );
    }
  }
  for (const { input, reading } of ordered(priority)) {
    const { bloodGroup, rhFactor } = reading.fields;
    if (text(bloodGroup) === null && text(rhFactor) === null) continue;
    const parsed = parseBloodType(bloodGroup, rhFactor);
    if (parsed.group) addOption(fields.bloodGroup, parsed.group, input.id);
    if (parsed.rh) addOption(fields.rhFactor, parsed.rh, input.id);
    if (text(bloodGroup) !== null && parsed.group === null) {
      flags.push({ code: 'blood_group_not_read', detail: bloodGroup!.trim() });
    }
  }
  // The value most pages give comes first, so one page's misread name loses to the others.
  for (const field of Object.values(fields)) {
    field.options.sort((a, b) => b.pageIds.length - a.pageIds.length);
  }
  return { fields, flags };
}

const first = <T>(field: PersonField<T>) => field.options[0]?.value ?? null;

const appValues = (
  employee: ExistingEmployee
): Record<EmployeeImportFieldName, FieldValue | null> => ({
  lastName: employee.lastName,
  firstName: employee.firstName,
  cnp: employee.cnp,
  employeeNumber: employee.employeeNumber,
  birthDate: employee.birthDate,
  birthPlace: employee.birthPlace,
  homeAddress: employee.homeAddress,
  education: employee.education,
  qualification: employee.qualification,
  bloodGroup: employee.bloodGroup,
  rhFactor: employee.rhFactor,
  jobTitle: employee.jobTitle,
  hiredAt: employee.hiredAt,
  leftOn: employee.terminatedAt,
  workplace: null,
  commuteRoute: employee.commuteRoute,
  commuteMinutes: employee.commuteMinutes,
});

const pageDomain = (kind: SheetPageKind | null): TrainingDomain | null =>
  kind?.startsWith('ssm') ? 'ssm' : kind?.startsWith('psi') ? 'psi' : null;

// The test closes the introductory general training for occupational safety and the workplace
// training for fire safety, whose one test closes both (ADR 024).
const testPhases: Record<TrainingDomain, TrainingPhase[]> = {
  ssm: ['introductory_general'],
  psi: ['workplace', 'introductory_general'],
};

function closesTest(row: Pick<ProposedSheetRow, 'signatures'>) {
  const { verifier, trainer } = row.signatures;
  return verifier === 'present' || (verifier === 'no_box' && trainer === 'present');
}

function examinerOf(row: ProposedSheetRow) {
  if (row.signatures.verifier !== 'no_box' && row.verifierName !== null) {
    return { examinerName: row.verifierName, examinerJobTitle: row.verifierJobTitle };
  }
  return { examinerName: row.trainerName, examinerJobTitle: row.trainerJobTitle };
}

interface PersonContext {
  hiredAt: string | null;
  jobPositionId: string | null;
  existing: ExistingEmployee | null;
}

interface RowBuilder {
  nextId: () => string;
  themes: TrainingThemes;
  today: string;
}

function readRow(
  row: SheetRow,
  page: ReadPage,
  person: PersonContext,
  builder: RowBuilder
): ProposedSheetRow {
  const date = sheetDate(row.heldOn, builder.today);
  const testOnly = row.domain === 'psi' && row.annualTest;
  const proposed: ProposedSheetRow = {
    id: builder.nextId(),
    domain: row.domain,
    phase: testOnly ? 'periodic' : row.phase,
    heldOn: date?.date ?? null,
    durationMinutes:
      row.durationMinutes !== null && row.durationMinutes > 0 ? row.durationMinutes : null,
    trainerName: text(row.trainerName),
    trainerJobTitle: text(row.trainerJobTitle),
    verifierName: text(row.verifierName),
    verifierJobTitle: text(row.verifierJobTitle),
    material: text(row.material),
    supplementaryReason: row.phase === 'supplementary' ? row.supplementaryReason : null,
    signatures: {
      trainee: row.traineeSignature,
      trainer: row.trainerSignature,
      verifier: row.verifierSignature,
    },
    admission: null,
    fromThemes: [],
    testOnly,
    test: null,
    flags: [],
    proposedIncluded: true,
  };
  const flags: RowFlagCode[] = [];
  if (date?.monthOnly) flags.push('month_only');

  const pageIsOf = pageDomain(page.reading.pageKind);
  if (proposed.phase === 'workplace' && (pageIsOf === null || pageIsOf === row.domain)) {
    const admission = page.reading.admission;
    const admittedOn = sheetDate(admission.admittedOn, builder.today)?.date ?? null;
    const parts = [admittedOn, text(admission.admittedByName), text(admission.admittedByJobTitle)];
    if (parts.some((part) => part !== null)) {
      proposed.admission = {
        admittedOn: parts[0]!,
        admittedByName: parts[1]!,
        admittedByJobTitle: parts[2]!,
      };
      if (parts.includes(null)) flags.push('admission_incomplete');
    }
  }

  const defaults = builder.themes({
    domain: proposed.domain,
    phase: proposed.phase,
    heldOn: proposed.heldOn,
    jobPositionId: person.jobPositionId,
  });
  if (defaults) {
    const fill = (field: ThemeFillableField, value: string | number | null | undefined) => {
      if (value === null || value === undefined || proposed[field] !== null) return;
      (proposed as Record<ThemeFillableField, string | number | null>)[field] = value;
      proposed.fromThemes.push(field);
    };
    const trainerWasMissing = proposed.trainerName === null;
    fill('trainerName', text(defaults.trainerName ?? null));
    // Another trainer's job title is not this one's.
    if (
      trainerWasMissing ||
      (defaults.trainerName &&
        proposed.trainerName &&
        sameName(defaults.trainerName, proposed.trainerName))
    ) {
      fill('trainerJobTitle', text(defaults.trainerJobTitle ?? null));
    }
    if (!testOnly) {
      fill('material', text(defaults.material ?? null));
      fill('durationMinutes', defaults.durationMinutes);
    }
    if (proposed.fromThemes.length > 0) flags.push('from_client_themes');
  }

  flags.push(
    ...rowFlags(
      { ...proposed, monthOnly: date?.monthOnly ?? false },
      { hiredAt: person.hiredAt, today: builder.today }
    )
  );
  proposed.flags = flags;
  proposed.proposedIncluded = !flags.includes('unsigned');

  // Every row of a phase the hiring test closes keeps what its verifier box shows, so the row
  // that carries the test can be chosen again once pages move between people.
  if (!testOnly && testPhases[proposed.domain].includes(proposed.phase)) {
    proposed.test = {
      test: 'hiring',
      takenOn: proposed.heldOn,
      ...examinerOf(proposed),
      verified: closesTest(proposed),
      inApp:
        person.existing?.testResults.some(
          (result) => result.domain === proposed.domain && result.test === 'hiring'
        ) ?? false,
    };
  }
  if (testOnly) {
    proposed.test = {
      test: 'annual',
      takenOn: proposed.heldOn,
      ...examinerOf(proposed),
      verified: closesTest(proposed),
      inApp:
        person.existing?.testResults.some(
          (result) =>
            result.domain === 'psi' &&
            result.test === 'annual' &&
            result.takenOn === proposed.heldOn
        ) ?? false,
    };
  }
  return proposed;
}

function markRepeats(rows: ProposedSheetRow[], existing: ExistingEmployee | null) {
  let inApp = 0;
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.heldOn === null) continue;
    const key = `${row.domain}|${row.testOnly ? 'test' : row.phase}|${row.heldOn}`;
    if (
      !row.testOnly &&
      existing?.trainings.some(
        (training) =>
          training.domain === row.domain &&
          training.phase === row.phase &&
          training.heldOn === row.heldOn
      )
    ) {
      row.flags.push('in_app');
      row.proposedIncluded = false;
      inApp++;
    } else if (seen.has(key)) {
      row.flags.push('repeated');
      row.proposedIncluded = false;
    }
    seen.add(key);
  }
  return inApp;
}

/**
 * The rows whose paper hiring test is written, one a domain: the newest of the phase the test
 * closes, among the rows the person's pages now hold, with the dates as the member left them.
 */
export function hiringTestRowIds(
  rows: readonly Pick<
    ProposedSheetRow,
    'id' | 'domain' | 'phase' | 'heldOn' | 'testOnly' | 'test'
  >[]
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

function referenceGroups<G extends { id: string; personIds: string[] }>(
  people: readonly { personId: string; key: string; written: string }[],
  prefix: string,
  make: (id: string, written: string) => G
) {
  const groups = new Map<string, G>();
  for (const { personId, key, written } of people) {
    let group = groups.get(key);
    if (!group) {
      group = make(`${prefix}-${groups.size + 1}`, written);
      groups.set(key, group);
    }
    group.personIds.push(personId);
  }
  return [...groups.values()];
}

export function toEmployeeProposal(input: EmployeeImportInput): EmployeeImportProposal {
  const { client, today } = input;
  const placed = placePages(input.pages);
  const byId = new Map(input.pages.map((page) => [page.id, page]));
  const personIdOf = (group: number) => `person-${group + 1}`;

  const people: ProposedSheetPerson[] = [];
  const contexts = new Map<string, PersonContext>();
  for (const [index, pageIds] of placed.groups.entries()) {
    const id = personIdOf(index);
    const pages = pageIds.map((pageId) => {
      const page = byId.get(pageId)!;
      return { input: page, reading: page.reading! };
    });
    const { fields, flags } = personFields(pages, today);
    const writtenCnp = first(fields.cnp) as string | null;
    const birthDate = first(fields.birthDate) as string | null;
    let cnpCorrection: string | null = null;
    if (writtenCnp !== null) {
      const check = checkCnp(writtenCnp, birthDate);
      if (check.status !== 'valid') {
        flags.push({
          code: check.status === 'invalid' ? 'invalid_cnp' : 'cnp_birth_date_mismatch',
          field: 'cnp',
        });
        cnpCorrection = check.correction;
        if (cnpCorrection !== null) flags.push({ code: 'cnp_correction', field: 'cnp' });
      }
    }
    const key = {
      cnp: cnpCorrection ?? (writtenCnp !== null && isValidCnp(writtenCnp) ? writtenCnp : null),
      lastName: first(fields.lastName) as string | null,
      firstName: first(fields.firstName) as string | null,
      birthDate,
    };
    const found = findExistingEmployee(key, client.employees);
    const existing = found?.employee ?? null;
    if (existing) {
      const app = appValues(existing);
      for (const name of employeeImportFieldNames) {
        if (name !== 'workplace') fields[name].app = app[name];
      }
    }
    const leftOn = first(fields.leftOn);
    if (leftOn !== null && (existing === null || existing.terminatedAt === null)) {
      flags.push({ code: 'leaver', field: 'leftOn' });
    }
    if (!existing?.hasContact) flags.push({ code: 'no_contact' });

    people.push({
      id,
      pageIds,
      fields: fields as unknown as SheetPersonFields,
      cnpCorrection,
      existing: found ? { employeeId: found.employee.id, matchedBy: found.matchedBy } : null,
      jobTitleId: null,
      workplaceId: null,
      rowsInApp: 0,
      flags,
      // An existing employee is completed either way; leaving is then a choice on the leave date.
      proposedIncluded: leftOn === null || existing !== null,
    });
    contexts.set(id, {
      hiredAt: (first(fields.hiredAt) as string | null) ?? existing?.hiredAt ?? null,
      jobPositionId: existing?.jobPositionId ?? null,
      existing,
    });
  }

  const jobTitles: JobTitleGroup[] = referenceGroups(
    people.flatMap((person) => {
      const title = first(person.fields.jobTitle);
      return person.existing === null && title !== null
        ? [{ personId: person.id, key: foldText(title), written: title }]
        : [];
    }),
    'title',
    (id, title) => ({ id, title, ...matchJobTitle(title, client.jobPositions), personIds: [] })
  );
  for (const group of jobTitles) {
    for (const personId of group.personIds) {
      people.find((person) => person.id === personId)!.jobTitleId = group.id;
      contexts.get(personId)!.jobPositionId = group.proposedId;
    }
  }

  const workplaces: WorkplaceGroup[] =
    client.workplaces.length < 2
      ? []
      : referenceGroups(
          people.flatMap((person) => {
            const written = first(person.fields.workplace) ?? '';
            const existing = client.employees.find(
              (each) => each.id === person.existing?.employeeId
            );
            return existing?.workplaceId
              ? []
              : [{ personId: person.id, key: foldText(written), written }];
          }),
          'workplace',
          (id, written) => ({
            id,
            text: written,
            ...matchWorkplace(written, client.workplaces),
            personIds: [],
          })
        );
  for (const group of workplaces) {
    for (const personId of group.personIds) {
      people.find((person) => person.id === personId)!.workplaceId = group.id;
    }
  }

  let rowCount = 0;
  const builder: RowBuilder = {
    nextId: () => `row-${++rowCount}`,
    themes: input.themes,
    today,
  };
  const rowsByPage = new Map<string, ProposedSheetRow[]>();
  for (const person of people) {
    const context = contexts.get(person.id)!;
    const rows = person.pageIds.flatMap((pageId) => {
      const page = byId.get(pageId)!;
      const read = { input: page, reading: page.reading! };
      const pageRows = page.reading!.trainings.map((row) => readRow(row, read, context, builder));
      rowsByPage.set(pageId, pageRows);
      return pageRows;
    });
    person.rowsInApp = markRepeats(rows, context.existing);
  }

  const pages: ProposedSheetPage[] = input.pages.map((page) => {
    const placement = placed.placements.get(page.id)!;
    const unplacedRows =
      placement.group === null && page.reading
        ? page.reading.trainings.map((row) =>
            readRow(
              row,
              { input: page, reading: page.reading! },
              { hiredAt: null, jobPositionId: null, existing: null },
              builder
            )
          )
        : [];
    return {
      id: page.id,
      fileId: page.fileId,
      page: page.page,
      label: page.label,
      kind: page.reading?.pageKind ?? null,
      personId: placement.group === null ? null : personIdOf(placement.group),
      placement: placement.placement,
      rows: rowsByPage.get(page.id) ?? unplacedRows,
      unreadable: page.reading?.unreadable.filter((each) => each.trim() !== '') ?? [],
      notes: page.reading?.notes.filter((each) => each.trim() !== '') ?? [],
    };
  });

  return employeeImportProposalSchema.parse({
    pages,
    people,
    jobTitles,
    workplaces,
    clientHasPositions: client.jobPositions.length > 0,
  });
}
