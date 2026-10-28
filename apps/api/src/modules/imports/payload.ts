import type { ImportBlocker, ImportChanges } from '@ssm-usor/contracts';
import {
  type Field,
  type Flag,
  foldText,
  type Proposal,
  proposedEmployeeSchema,
  proposedFireEquipmentSchema,
  proposedFireInstallationSchema,
  proposedIncluded,
  proposedJobPositionSchema,
  proposedProtectiveEquipmentSchema,
  proposedResponsiblePersonSchema,
  proposedWorkplaceSchema,
  sameName,
} from '@ssm-usor/import';
import type { z } from 'zod';

type Value = string | number;
type Row = Record<string, unknown>;
type FieldChange = ImportChanges['fields'][string];
type ItemChange = ImportChanges['items'][string];

export interface ExistingRecords {
  client: Row | null;
  fireSafety: Row | null;
  workplaces: { id: string; name: string; address_line: string | null }[];
  jobPositions: { id: string; name: string }[];
  employees: { id: string; last_name: string; first_name: string; cnp: string | null }[];
  responsiblePersons: { full_name: string }[];
}

export const noExistingRecords: ExistingRecords = {
  client: null,
  fireSafety: null,
  workplaces: [],
  jobPositions: [],
  employees: [],
  responsiblePersons: [],
};

export interface RegisteredCompany {
  cui: string;
  legalName: string;
  vatPayer: boolean;
  inactive: boolean;
}

const clientColumns: Record<string, string> = {
  'client.legalName': 'legal_name',
  'client.cui': 'cui',
  'client.tradeRegisterNumber': 'trade_register_number',
  'client.caenCode': 'caen_code',
  'client.countyCode': 'county_code',
  'client.locality': 'locality',
  'client.addressLine': 'address_line',
  'client.legalRepresentativeName': 'legal_representative_name',
  'client.legalRepresentativeRole': 'legal_representative_role',
  'client.contactName': 'contact_name',
  'client.contactPhone': 'contact_phone',
  'client.contactEmail': 'contact_email',
  'trainingSchedule.periodicTrainingMinutes': 'periodic_training_minutes',
  'trainingSchedule.administrativeTrainingIntervalMonths':
    'administrative_training_interval_months',
  'trainingSchedule.workerTrainingIntervalMonths': 'worker_training_interval_months',
  'trainingSchedule.trainingFirstMonth': 'training_first_month',
  'trainingSchedule.trainingDayFrom': 'training_day_from',
  'trainingSchedule.trainingDayTo': 'training_day_to',
};

const fireSafetyColumns: Record<string, string> = {
  'fireSafety.periodicTrainingHours': 'periodic_training_hours',
  'fireSafety.administrativeTrainingIntervalMonths': 'administrative_training_interval_months',
  'fireSafety.workerTrainingIntervalMonths': 'worker_training_interval_months',
  'fireSafety.smokingPolicy': 'smoking_policy',
  'fireSafety.smokingPlace': 'smoking_place',
  'fireSafety.wasteContractor': 'waste_contractor',
};

const integerColumns = new Set([
  'periodic_training_minutes',
  'administrative_training_interval_months',
  'worker_training_interval_months',
  'training_first_month',
  'training_day_from',
  'training_day_to',
  'periodic_training_hours',
]);

const workplaceColumns: Record<string, string> = {
  name: 'name',
  isRegisteredOffice: 'is_registered_office',
  countyCode: 'county_code',
  locality: 'locality',
  addressLine: 'address_line',
  activity: 'activity',
};

const jobPositionColumns: Record<string, string> = {
  name: 'name',
  staffCategory: 'staff_category',
  workZone: 'work_zone',
  activities: 'activities',
  trainingIntervalMonths: 'training_interval_months',
};

const sections = [
  'client',
  'trainingSchedule',
  'fireSafety',
  'workplaces',
  'jobPositions',
  'responsiblePersons',
  'fireEquipment',
  'fireInstallations',
  'protectiveEquipment',
  'employees',
] as const;

type Section = (typeof sections)[number];

export type Quality = Record<Section, { changed: number; unticked: number; kept: number }>;

// A flag on a value the member left as proposed keeps it from being written.
const invalidCodes = new Set(['value_not_allowed', 'invalid_cui', 'invalid_cnp']);

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const empty = (value: unknown) =>
  value === null ||
  value === undefined ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0);

const differs = (current: unknown, proposed: unknown) =>
  typeof current === 'number' || typeof proposed === 'number'
    ? Number(current) !== Number(proposed)
    : foldText(String(current)) !== foldText(String(proposed));

function columnValue(column: string, value: Value | null): Value | null {
  if (value === null) return null;
  if (!integerColumns.has(column)) return String(value).trim() || null;
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(number) ? number : null;
}

interface Resolution {
  value: Value | null;
  // The option taken, whose flags then apply; null for the member's own value or nothing.
  option: number | null;
  choice: boolean;
  changed: boolean;
  unticked: boolean;
}

/** A single value as the member decided it: a choice between own options blocks until made. */
export function resolveField(field: Field<Value>, change: FieldChange | undefined): Resolution {
  const none = { value: null, option: null, choice: false, changed: false, unticked: false };
  if (change?.value !== undefined) return { ...none, value: change.value, changed: true };
  if (change?.option !== undefined) {
    const option = field.options[change.option];
    return option ? { ...none, value: option.value, option: change.option, changed: true } : none;
  }
  const own = field.options.flatMap((option, index) =>
    option.otherCompanyName === null ? [index] : []
  );
  if (own.length > 1) return { ...none, choice: true };
  if (own.length === 1) {
    if (change?.included === false) return { ...none, unticked: true };
    return { ...none, value: field.options[own[0]!]!.value, option: own[0]! };
  }
  if (field.options.length > 0 && change?.included === true) {
    return { ...none, value: field.options[0]!.value, option: 0, changed: true };
  }
  return none;
}

function fieldsOf(proposal: Proposal) {
  return Object.entries({
    client: proposal.client,
    trainingSchedule: proposal.trainingSchedule,
    fireSafety: proposal.fireSafety,
  } as Record<string, Record<string, Field<Value>>>).flatMap(([group, fields]) =>
    Object.entries(fields).map(([name, field]) => ({
      section: group as Section,
      path: `${group}.${name}`,
      field,
    }))
  );
}

type ItemList =
  | 'workplaces'
  | 'jobPositions'
  | 'responsiblePersons'
  | 'fireEquipment'
  | 'fireInstallations'
  | 'protectiveEquipment'
  | 'employees';

const itemSchemas = {
  workplaces: proposedWorkplaceSchema,
  jobPositions: proposedJobPositionSchema,
  responsiblePersons: proposedResponsiblePersonSchema,
  fireEquipment: proposedFireEquipmentSchema,
  fireInstallations: proposedFireInstallationSchema,
  protectiveEquipment: proposedProtectiveEquipmentSchema,
  employees: proposedEmployeeSchema,
} satisfies Record<ItemList, z.ZodType>;

const referenceFields = new Set(['workplace', 'jobPosition', 'employee']);

export interface ClientImportPayload {
  client: Row;
  workplaces: Row[];
  job_positions: Row[];
  equipment: Row[];
  employees: Row[];
  responsible_persons: Row[];
  fire_safety?: Row;
  fire_equipment: Row[];
  fire_installations: Row[];
  quality: Quality;
}

export interface Mapping {
  payload: ClientImportPayload;
  blockers: ImportBlocker[];
}

/**
 * The proposal with the member's changes, shaped as `apply_client_import` takes it (ADR 030,
 * docs/data-model.md), and what keeps it from being confirmed.
 */
export function toClientPayload(input: {
  proposal: Proposal;
  changes: ImportChanges | null;
  intoExistingClient: boolean;
  existing: ExistingRecords;
  registeredCompany?: RegisteredCompany | null;
}): Mapping {
  const { proposal, existing, intoExistingClient } = input;
  const changes: ImportChanges = input.changes ?? { fields: {}, items: {} };
  const blockers: ImportBlocker[] = [];
  const block = (path: string, code: ImportBlocker['code']) => {
    if (!blockers.some((known) => known.path === path && known.code === code)) {
      blockers.push({ path, code });
    }
  };
  const quality = Object.fromEntries(
    sections.map((section) => [section, { changed: 0, unticked: 0, kept: 0 }])
  ) as Quality;
  const flags = proposal.flags;
  const flagged = (prefix: string) =>
    flags.filter(
      (flag: Flag) =>
        invalidCodes.has(flag.code) && (flag.path === prefix || flag.path.startsWith(`${prefix}.`))
    );

  const client: Row = {};
  const clientReplace: string[] = [];
  const fireSafety: Row = {};
  const fireReplace: string[] = [];
  for (const { section, path, field } of fieldsOf(proposal)) {
    const change = changes.fields[path];
    const resolved = resolveField(field, change);
    if (resolved.changed) quality[section].changed++;
    if (resolved.unticked) quality[section].unticked++;
    if (resolved.choice) block(path, 'choice');
    const inFireSafety = path in fireSafetyColumns;
    const column = inFireSafety ? fireSafetyColumns[path] : clientColumns[path];
    if (!column) continue;
    const value = columnValue(column, resolved.value);
    const current = (inFireSafety ? existing.fireSafety : existing.client)?.[column];
    const replace = Boolean(change?.replace) && intoExistingClient;
    const written = !intoExistingClient || empty(current) || replace;
    if (value === null) continue;
    if (column === 'cui' && intoExistingClient) continue;
    if (intoExistingClient && !empty(current) && !replace && differs(current, value)) {
      quality[section].kept++;
    }
    if (
      written &&
      resolved.option !== null &&
      flagged(`${path}.options.${resolved.option}`).length
    ) {
      block(path, 'invalid');
    }
    (inFireSafety ? fireSafety : client)[column] = value;
    if (replace) (inFireSafety ? fireReplace : clientReplace).push(column);
  }
  if (!intoExistingClient) {
    for (const [path, column] of [
      ['client.legalName', 'legal_name'],
      ['client.cui', 'cui'],
    ] as const) {
      if (client[column] === undefined && !blockers.some((known) => known.path === path)) {
        block(path, 'missing');
      }
    }
    if (
      input.registeredCompany &&
      client.cui !== undefined &&
      input.registeredCompany.cui === client.cui
    ) {
      client.vat_payer = input.registeredCompany.vatPayer;
    }
  }
  if (clientReplace.length) client.replace = clientReplace;
  if (fireReplace.length) fireSafety.replace = fireReplace;

  type Included<T> = { item: T; index: number; values: Record<string, unknown> };
  const included = <L extends ItemList>(
    list: L,
    proposedOf: (item: Proposal[L][number]) => boolean = proposedIncluded
  ): Included<Proposal[L][number]>[] => {
    const items = proposal[list] as Proposal[L][number][];
    return items.flatMap((item, index) => {
      const change: ItemChange | undefined = changes.items[item.id];
      const proposed = proposedOf(item);
      const take = change?.included ?? proposed;
      const edited = Object.keys(change?.values ?? {}).length > 0;
      if (proposed && change?.included === false) quality[list].unticked++;
      if (!take) return [];
      if (edited || (!proposed && change?.included === true)) quality[list].changed++;
      const written = change?.values ?? {};
      const own = Object.fromEntries(
        Object.entries(item as unknown as Record<string, unknown>).filter(
          ([key]) => !referenceFields.has(key)
        )
      );
      // A reference is in `values` only when the member set it; the proposal's is on the item.
      const values: Record<string, unknown> = { ...own, ...written };
      const parsed = (
        itemSchemas[list] as unknown as z.ZodObject<Record<string, z.ZodType>>
      ).safeParse({
        ...(item as unknown as Record<string, unknown>),
        ...Object.fromEntries(Object.entries(written).filter(([key]) => !referenceFields.has(key))),
      });
      if (!parsed.success) block(`${list}.${index}`, 'invalid');
      for (const flag of flagged(`${list}.${index}`)) {
        const field = flag.path.split('.')[2];
        if (field === undefined || !(field in (change?.values ?? {}))) block(flag.path, 'invalid');
      }
      return [{ item, index, values }];
    });
  };

  const reference = (written: unknown, proposedId: string | null) =>
    written === undefined ? proposedId : typeof written === 'string' ? written : null;

  // The member picked the row on the review; it may have been archived since, or never be the
  // client's, which the database would refuse as a broken payload.
  const existingRow = (
    rows: { id: string }[],
    id: string | null | undefined,
    path: string
  ): string | null | undefined => {
    if (id === undefined || id === null || !intoExistingClient) return id;
    if (rows.some((row) => row.id === id)) return id;
    block(path, 'unknown_reference');
    return null;
  };

  const workplaceKeys = new Set<string>();
  const workplaces = included('workplaces').map(({ item, index, values }) => {
    workplaceKeys.add(item.id);
    const change = changes.items[item.id];
    const row: Row = { key: item.id };
    for (const [field, column] of Object.entries(workplaceColumns)) {
      if (!empty(values[field])) row[column] = values[field];
    }
    const chosen = existingRow(existing.workplaces, change?.existingId, `workplaces.${index}`);
    if (intoExistingClient) {
      const match =
        chosen !== undefined
          ? chosen
          : (existing.workplaces.find(
              (workplace) =>
                sameName(workplace.name, String(values.name)) ||
                (workplace.address_line !== null &&
                  !empty(values.addressLine) &&
                  foldText(workplace.address_line) === foldText(String(values.addressLine)))
            )?.id ?? null);
      if (match) {
        row.id = match;
        const replace = (change?.replace ?? []).flatMap((field) =>
          workplaceColumns[field] ? [workplaceColumns[field]!] : []
        );
        if (replace.length) row.replace = replace;
      }
    }
    return row;
  });
  const workplaceReference = (
    value: string | null,
    path: string,
    required: boolean
  ): Row | null => {
    if (value === null) {
      if (required) block(path, 'unknown_reference');
      return {};
    }
    if (workplaceKeys.has(value)) return { workplace_key: value };
    if (
      uuidPattern.test(value) &&
      existing.workplaces.some((workplace) => workplace.id === value)
    ) {
      return { workplace_id: value };
    }
    block(path, 'unknown_reference');
    return null;
  };

  const positionKeys = new Set<string>();
  const jobPositions = included('jobPositions').map(({ item, index, values }) => {
    positionKeys.add(item.id);
    const change = changes.items[item.id];
    const row: Row = { key: item.id };
    for (const [field, column] of Object.entries(jobPositionColumns)) {
      if (!empty(values[field])) row[column] = values[field];
    }
    const chosen = existingRow(existing.jobPositions, change?.existingId, `jobPositions.${index}`);
    if (intoExistingClient && chosen && change) {
      row.id = chosen;
      const replace = (change.replace ?? []).flatMap((field) =>
        jobPositionColumns[field] ? [jobPositionColumns[field]!] : []
      );
      if (replace.length) row.replace = replace;
    }
    return row;
  });
  const positionReference = (value: string | null, path: string): Row | null => {
    if (value !== null && positionKeys.has(value)) return { job_position_key: value };
    if (
      value !== null &&
      uuidPattern.test(value) &&
      existing.jobPositions.some((position) => position.id === value)
    ) {
      return { job_position_id: value };
    }
    block(path, 'unknown_reference');
    return null;
  };

  // An entry goes with the post the documents gave it, unless the member moved it to another.
  const leftOutPositions = new Set(
    proposal.jobPositions.filter((item) => !positionKeys.has(item.id)).map((item) => item.id)
  );
  const withItsPosition = (item: Proposal['protectiveEquipment'][number]) =>
    proposedIncluded(item) &&
    (changes.items[item.id]?.values?.jobPosition !== undefined ||
      item.jobPosition.id === null ||
      !leftOutPositions.has(item.jobPosition.id));
  const equipment = included('protectiveEquipment', withItsPosition).flatMap(
    ({ item, index, values }) => {
      const position = positionReference(
        reference(values.jobPosition, item.jobPosition.id),
        `protectiveEquipment.${index}.jobPosition`
      );
      if (empty(values.risk)) block(`protectiveEquipment.${index}.risk`, 'missing');
      if (!position) return [];
      return [
        dropEmpty({
          ...position,
          risk: values.risk,
          item: values.item,
          quantity: values.quantity,
          duration_months: values.durationMonths,
          allocation: values.allocation,
        }),
      ];
    }
  );

  const employeeKeys = new Map<string, string>();
  const existingEmployeeOf = (values: Record<string, unknown>) =>
    existing.employees.find(
      (employee) =>
        (!empty(values.cnp) && employee.cnp === values.cnp) ||
        (!empty(values.lastName) &&
          !empty(values.firstName) &&
          sameName(
            `${employee.last_name} ${employee.first_name}`,
            `${String(values.lastName)} ${String(values.firstName)}`
          ))
    );
  const employees = included('employees').flatMap(({ item, index, values }) => {
    const known = intoExistingClient ? existingEmployeeOf(values) : undefined;
    const name = [values.lastName, values.firstName].filter((part) => !empty(part)).join(' ');
    employeeKeys.set(item.id, name);
    if (known) {
      quality.employees.kept++;
      return [];
    }
    for (const field of ['lastName', 'firstName', 'jobTitle', 'hiredAt'] as const) {
      if (empty(values[field])) block(`employees.${index}.${field}`, 'missing');
    }
    const position =
      values.jobPosition === undefined || values.jobPosition === null
        ? {}
        : (positionReference(String(values.jobPosition), `employees.${index}.jobPosition`) ?? {});
    return [
      dropEmpty({
        key: item.id,
        ...position,
        last_name: values.lastName,
        first_name: values.firstName,
        job_title: values.jobTitle,
        hired_at: values.hiredAt,
        cnp: values.cnp,
      }),
    ];
  });
  const writtenEmployees = new Set(employees.map((row) => String(row.key)));
  const employeeReference = (
    value: unknown,
    fullName: string,
    path: string,
    required: boolean
  ): Row => {
    if (typeof value === 'string') {
      if (writtenEmployees.has(value)) return { employee_key: value };
      if (uuidPattern.test(value) && existing.employees.some((employee) => employee.id === value)) {
        return { employee_id: value };
      }
      block(path, 'unknown_reference');
      return {};
    }
    const named = (first: string, last: string) =>
      sameName(`${last} ${first}`, fullName) || sameName(`${first} ${last}`, fullName);
    const proposed = [...employeeKeys].find(([, name]) => name !== '' && sameName(name, fullName));
    if (proposed && writtenEmployees.has(proposed[0])) return { employee_key: proposed[0] };
    const known = existing.employees.find((employee) =>
      named(employee.first_name, employee.last_name)
    );
    if (known) return { employee_id: known.id };
    if (required) block(path, 'missing');
    return {};
  };

  const responsiblePersons = included('responsiblePersons').flatMap(({ item, index, values }) => {
    const fullName = String(values.fullName ?? '');
    if (
      intoExistingClient &&
      existing.responsiblePersons.some((person) => sameName(person.full_name, fullName))
    ) {
      quality.responsiblePersons.kept++;
      return [];
    }
    if (empty(values.jobTitle)) block(`responsiblePersons.${index}.jobTitle`, 'missing');
    const roles = Array.isArray(values.roles) ? (values.roles as string[]) : [];
    const workplace =
      reference(values.workplace, item.workplace.id) === null && item.workplace.name === null
        ? {}
        : workplaceReference(
            reference(values.workplace, item.workplace.id),
            `responsiblePersons.${index}.workplace`,
            true
          );
    const employee = employeeReference(
      values.employee,
      fullName,
      `responsiblePersons.${index}.employee`,
      roles.includes('workers_representative')
    );
    return [
      dropEmpty({
        ...employee,
        ...(workplace ?? {}),
        full_name: values.fullName,
        job_title: values.jobTitle,
        roles,
      }),
    ];
  });

  const fireEquipment = included('fireEquipment').flatMap(({ item, index, values }) => {
    const workplace = workplaceReference(
      reference(values.workplace, item.workplace.id),
      `fireEquipment.${index}.workplace`,
      true
    );
    if (!workplace) return [];
    const count = typeof values.count === 'number' && values.count >= 1 ? values.count : 1;
    const unit = dropEmpty({
      ...workplace,
      kind: values.kind,
      agent: values.agent,
      capacity: values.capacity,
      wheeled: values.wheeled,
      location: values.room,
    });
    return Array.from({ length: Math.min(count, 999) }, () => ({ ...unit }));
  });

  const fireInstallations = included('fireInstallations').flatMap(({ item, index, values }) => {
    const workplace = workplaceReference(
      reference(values.workplace, item.workplace.id),
      `fireInstallations.${index}.workplace`,
      true
    );
    if (!workplace) return [];
    return [dropEmpty({ ...workplace, kind: values.kind, description: values.description })];
  });

  if (intoExistingClient) {
    for (const row of jobPositions) {
      const known = row.id
        ? existing.jobPositions.find((position) => position.id === row.id)
        : existing.jobPositions.find(
            (position) => foldText(position.name) === foldText(String(row.name))
          );
      if (
        known &&
        !row.id &&
        !empty(row.name) &&
        foldText(known.name) !== foldText(String(row.name))
      ) {
        quality.jobPositions.kept++;
      }
    }
  }

  const payload: ClientImportPayload = {
    client,
    workplaces,
    job_positions: jobPositions,
    equipment,
    employees,
    responsible_persons: responsiblePersons,
    fire_equipment: fireEquipment,
    fire_installations: fireInstallations,
    quality,
  };
  if (Object.keys(fireSafety).length > 0) payload.fire_safety = fireSafety;
  return { payload, blockers };
}

function dropEmpty(row: Row): Row {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => !empty(value) || value === false)
  );
}
