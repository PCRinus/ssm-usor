import {
  fireScheduleStartFills,
  type ImportBlocker,
  type ImportChanges,
  importedTrainingInterval,
  maxEquipmentDurationMonths,
  offeredTrainingInterval,
  postsAfterImport,
  staffCategoriesWithPosts,
  type StaffCategory,
  type TrainingDomain,
} from '@ssm-usor/contracts';
import {
  type Field,
  fireEquipmentCountPath,
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
type ColumnValue = Value | boolean | string[];
type Row = Record<string, unknown>;
type FieldChange = ImportChanges['fields'][string];
type ItemChange = ImportChanges['items'][string];

export interface ExistingRecords {
  client: Row | null;
  fireSafety: Row | null;
  workplaces: {
    id: string;
    name: string;
    address_line: string | null;
    assembly_point?: string | null;
  }[];
  jobPositions: { id: string; name: string; staff_category?: string }[];
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
  'trainingSchedule.administrativeTrainingNotApplicable': 'administrative_training_not_applicable',
  'trainingSchedule.workerTrainingNotApplicable': 'worker_training_not_applicable',
};

const fireSafetyColumns: Record<string, string> = {
  'fireSafety.periodicTrainingHours': 'periodic_training_hours',
  'fireSafety.administrativeTrainingIntervalMonths': 'administrative_training_interval_months',
  'fireSafety.workerTrainingIntervalMonths': 'worker_training_interval_months',
  'fireSafety.trainingFirstMonth': 'training_first_month',
  'fireSafety.trainingDayFrom': 'training_day_from',
  'fireSafety.trainingDayTo': 'training_day_to',
  'fireSafety.smokingPolicy': 'smoking_policy',
  'fireSafety.smokingPlace': 'smoking_place',
  'fireSafety.wasteContractor': 'waste_contractor',
  'fireSafety.wasteKinds': 'waste_kinds',
  'fireSafety.wasteCollectors': 'waste_collectors',
  'fireSafety.hasThirdParties': 'has_third_parties',
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

const notApplicablePaths = new Set([
  'trainingSchedule.administrativeTrainingNotApplicable',
  'trainingSchedule.workerTrainingNotApplicable',
]);

const intervalColumns: Record<StaffCategory, string> = {
  execution: 'worker_training_interval_months',
  technical_administrative: 'administrative_training_interval_months',
};

const intervalPaths: Record<string, { domain: TrainingDomain; category: StaffCategory }> = {
  'trainingSchedule.workerTrainingIntervalMonths': { domain: 'ssm', category: 'execution' },
  'trainingSchedule.administrativeTrainingIntervalMonths': {
    domain: 'ssm',
    category: 'technical_administrative',
  },
  'fireSafety.workerTrainingIntervalMonths': { domain: 'su', category: 'execution' },
  'fireSafety.administrativeTrainingIntervalMonths': {
    domain: 'su',
    category: 'technical_administrative',
  },
};

const schedulePaths = new Set([
  ...Object.keys(clientColumns).filter(
    (path) => path.startsWith('trainingSchedule.') && !notApplicablePaths.has(path)
  ),
  'fireSafety.periodicTrainingHours',
  'fireSafety.administrativeTrainingIntervalMonths',
  'fireSafety.workerTrainingIntervalMonths',
  'fireSafety.trainingFirstMonth',
  'fireSafety.trainingDayFrom',
  'fireSafety.trainingDayTo',
]);

const intervalPathOf = (domain: TrainingDomain, category: StaffCategory) =>
  Object.entries(intervalPaths).find(
    ([, interval]) => interval.domain === domain && interval.category === category
  )![0];

const scheduleColumns = [
  'periodic_training_hours',
  'administrative_training_interval_months',
  'worker_training_interval_months',
  'training_first_month',
  'training_day_from',
  'training_day_to',
];

// The proposal's yes or no is "true" or "false".
const booleanColumns = new Set([
  'administrative_training_not_applicable',
  'worker_training_not_applicable',
  'has_third_parties',
]);

const workplaceColumns: Record<string, string> = {
  name: 'name',
  isRegisteredOffice: 'is_registered_office',
  countyCode: 'county_code',
  locality: 'locality',
  addressLine: 'address_line',
  activity: 'activity',
  kind: 'kind',
  floorAreaM2: 'floor_area_m2',
  extinguisherNorm: 'extinguisher_norm',
  assemblyPoint: 'assembly_point',
  combustibleMaterials: 'combustible_materials',
  ignitionSources: 'ignition_sources',
  fireRiskEquipment: 'fire_risk_equipment',
  specificMeasures: 'specific_measures',
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
    : Array.isArray(current) || Array.isArray(proposed)
      ? foldText([current].flat().join(' ')) !== foldText([proposed].flat().join(' '))
      : foldText(String(current)) !== foldText(String(proposed));

function columnValue(column: string, value: Value | null): ColumnValue | null {
  if (value === null) return null;
  if (booleanColumns.has(column)) {
    const text = String(value).trim();
    return text === 'true' ? true : text === 'false' ? false : null;
  }
  if (column === 'waste_kinds') {
    const kinds = String(value)
      .split(';')
      .map((kind) => kind.trim())
      .filter(Boolean);
    return kinds.length > 0 ? kinds : null;
  }
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

const bareCui = (value: unknown) =>
  String(value ?? '')
    .replace(/^RO/i, '')
    .trim();

/**
 * ANAF's name for a new client whose documents name the CUI's firm otherwise, as the review
 * preselects it: the member takes the documents' name by choosing its option.
 */
export function anafLegalName(
  proposal: Proposal,
  changes: ImportChanges,
  registered: RegisteredCompany | null | undefined
): string | null {
  if (!registered) return null;
  const differs = proposal.flags.some(
    (flag: Flag) =>
      flag.path === 'client.legalName' &&
      flag.code === 'legal_name_differs' &&
      flag.detail === registered.legalName
  );
  if (!differs) return null;
  const own = proposal.client.legalName.options.filter(
    (option) => option.otherCompanyName === null
  );
  if (own.length !== 1) return null;
  const cui = resolveField(proposal.client.cui, changes.fields['client.cui']).value;
  if (cui === null || bareCui(cui) !== registered.cui) return null;
  const change = changes.fields['client.legalName'];
  if (change?.option !== undefined || change?.included === false) return null;
  if (change?.value !== undefined && change.value !== registered.legalName) return null;
  return registered.legalName;
}

// `client_fire_safety` takes a smoking place only beside designated places, and a pack whose
// decisions disagree may carry a place from the policy the member did not choose.
function smokingPlaceDropped(
  proposal: Proposal,
  changes: ImportChanges,
  intoExistingClient: boolean,
  existing: ExistingRecords
) {
  const change = changes.fields['fireSafety.smokingPolicy'];
  const resolved = resolveField(proposal.fireSafety.smokingPolicy, change);
  if (resolved.choice) return false;
  const current = existing.fireSafety?.smoking_policy;
  const value = columnValue('smoking_policy', resolved.value);
  const written =
    value !== null && (!intoExistingClient || empty(current) || Boolean(change?.replace));
  return (written ? value : current) !== 'designated_places';
}

const smokingPlacePath = 'fireSafety.smokingPlace';

const assemblyPointPath = (workplaceId: string) => `assemblyPoints.${workplaceId}`;

// Both print on what is posted at the workplace and packs copy both from one client to the next,
// so neither is taken until the member keeps, changes or empties it (ADR 041).
type SiteFact = 'undecided' | 'kept' | 'changed';

function smokingPlaceFact(field: Field<Value>, change: FieldChange | undefined): SiteFact {
  const option = change?.option === undefined ? undefined : field.options[change.option];
  const kept = Boolean(option) || Boolean(change?.replace) || change?.included === true;
  if (change?.value === undefined) return kept ? 'kept' : 'undecided';
  const own = field.options.filter((each) => each.otherCompanyName === null);
  const spelled = option ?? (own.length === 1 ? own[0] : undefined);
  // The document's spelling selected before deciding is stored as the member's value too.
  if (spelled?.spelling !== undefined && change.value === spelled.spelling) {
    return kept ? 'kept' : 'undecided';
  }
  return 'changed';
}

function assemblyPointFact(item: Proposal['workplaces'][number], changes: ImportChanges): SiteFact {
  const written = changes.items[item.id]?.values ?? {};
  if ('assemblyPoint' in written && written.assemblyPoint !== item.spelling.assemblyPoint) {
    return 'changed';
  }
  return changes.fields[assemblyPointPath(item.id)]?.option === 0 ? 'kept' : 'undecided';
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

const allowedDuration = (months: number) => months >= 1 && months <= maxEquipmentDurationMonths;

// A check's flag on a duration may be about its allocation, which the member can change instead.
const settlingFields: Record<string, string[]> = {
  durationMonths: ['durationMonths', 'allocation'],
};

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
  const placeDropped = smokingPlaceDropped(proposal, changes, intoExistingClient, existing);
  const anafName = intoExistingClient
    ? null
    : anafLegalName(proposal, changes, input.registeredCompany);
  const applyField = ({ section, path, field }: ReturnType<typeof fieldsOf>[number]) => {
    const change = changes.fields[path];
    const interval = intervalPaths[path];
    const resolved: Resolution =
      path === 'client.legalName' && anafName !== null
        ? { value: anafName, option: null, choice: false, changed: false, unticked: false }
        : resolveField(field, change);
    const fact = path === smokingPlacePath ? smokingPlaceFact(field, change) : null;
    const keptAsRead = fact === 'kept' && change?.value === undefined;
    if (resolved.changed && !keptAsRead) quality[section].changed++;
    if (resolved.unticked) quality[section].unticked++;
    const inFireSafety = path in fireSafetyColumns;
    const column = inFireSafety ? fireSafetyColumns[path] : clientColumns[path];
    const current = column && (inFireSafety ? existing.fireSafety : existing.client)?.[column];
    // An existing client's schedule keeps its own value unless the member takes the documents'.
    const keepsOwn = intoExistingClient && schedulePaths.has(path) && !empty(current);
    if (resolved.choice && !keepsOwn) block(path, 'choice');
    if (!column) return;
    const value = columnValue(column, resolved.value);
    const replace = Boolean(change?.replace) && intoExistingClient;
    const written = !intoExistingClient || empty(current) || replace;
    if (value === null) return;
    if (column === 'cui' && intoExistingClient) return;
    if (fact === 'undecided' && written) {
      block(path, 'choice');
      return;
    }
    if (intoExistingClient && !empty(current) && !replace && differs(current, value)) {
      quality[section].kept++;
    }
    if (
      written &&
      resolved.option !== null &&
      flagged(`${path}.options.${resolved.option}`).length
    ) {
      block(path, 'invalid');
    } else if (
      interval &&
      written &&
      !offeredTrainingInterval(interval.domain, interval.category, Number(value))
    ) {
      block(path, 'choice');
    }
    (inFireSafety ? fireSafety : client)[column] = value;
    if (replace) (inFireSafety ? fireReplace : clientReplace).push(column);
  };
  for (const entry of fieldsOf(proposal)) {
    if (entry.path === 'fireSafety.smokingPlace' && placeDropped) continue;
    // A category applies when the client keeps posts in it, so a declared exclusion is not
    // written, nor waited for (ADR 039).
    if (notApplicablePaths.has(entry.path)) continue;
    if (entry.path in intervalPaths) continue;
    applyField(entry);
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
    const vatPayer = changes.fields['client.vatPayer']?.value;
    if (vatPayer === 'true' || vatPayer === 'false') {
      client.vat_payer = vatPayer === 'true';
    } else if (
      input.registeredCompany &&
      client.cui !== undefined &&
      input.registeredCompany.cui === client.cui
    ) {
      client.vat_payer = input.registeredCompany.vatPayer;
    }
  }
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
        const settledBy = field === undefined ? [] : (settlingFields[field] ?? [field]);
        if (!settledBy.some((name) => name in written)) block(flag.path, 'invalid');
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
  const includedWorkplaces = included('workplaces');
  // `client_workplaces` takes one registered office per client.
  for (const { index } of includedWorkplaces
    .filter(({ values }) => values.isRegisteredOffice === true)
    .slice(1)) {
    block(`workplaces.${index}.isRegisteredOffice`, 'invalid');
  }
  const workplaces = includedWorkplaces.map(({ item, index, values }) => {
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
    // A point the client already has is kept, so only one the import writes waits for a decision.
    const current = row.id
      ? existing.workplaces.find((workplace) => workplace.id === row.id)?.assembly_point
      : null;
    const writesPoint =
      empty(current) || ((row.replace as string[] | undefined) ?? []).includes('assembly_point');
    if (
      !empty(item.assemblyPoint) &&
      writesPoint &&
      assemblyPointFact(item, changes) === 'undecided'
    ) {
      block(assemblyPointPath(item.id), 'choice');
      delete row.assembly_point;
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
  const positionValues = included('jobPositions');
  const jobPositions = positionValues.map(({ item, index, values }) => {
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
      // `job_position_equipment` takes a duration for inventory only, and none for a consumable.
      const duration = `protectiveEquipment.${index}.durationMonths`;
      if (values.allocation === 'consumable') {
        if (!empty(values.durationMonths)) block(duration, 'invalid');
      } else if (empty(values.durationMonths)) {
        block(duration, 'missing');
      } else if (!allowedDuration(Number(values.durationMonths))) {
        block(duration, 'invalid');
      }
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

  const notCounted = new Set<string>();
  for (const count of proposal.fireEquipmentCounts) {
    const path = fireEquipmentCountPath(count.id);
    const option = changes.fields[path]?.option;
    const chosen = option === undefined ? undefined : count.options[option];
    if (!chosen) block(path, 'choice');
    for (const each of count.options) {
      if (each !== chosen) for (const id of each.equipmentIds) notCounted.add(id);
    }
  }
  const counted = (item: Proposal['fireEquipment'][number]) =>
    proposedIncluded(item) && !notCounted.has(item.id);
  const fireEquipment = included('fireEquipment', counted).flatMap(({ item, index, values }) => {
    // A tick kept from before the member chose another file's count would add its units again.
    if (notCounted.has(item.id)) return [];
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

  // A post's decision that it needs no equipment goes only where none of its entries is written,
  // since an entry decides that it needs some.
  const equippedPositions = new Set(
    equipment.map((row) => String(row.job_position_key ?? row.job_position_id))
  );
  for (const [index, row] of jobPositions.entries()) {
    const { values } = positionValues[index]!;
    if (
      values.needsProtectiveEquipment === false &&
      !equippedPositions.has(String(row.key)) &&
      !(row.id !== undefined && equippedPositions.has(String(row.id)))
    ) {
      row.needs_protective_equipment = false;
    }
  }

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

  const withPosts = staffCategoriesWithPosts(
    postsAfterImport(
      intoExistingClient
        ? existing.jobPositions.map((position) => ({
            id: position.id,
            name: position.name,
            staffCategory: (position.staff_category ?? 'execution') as StaffCategory,
          }))
        : [],
      jobPositions.map((row) => ({
        name: String(row.name ?? ''),
        staffCategory: (row.staff_category ?? null) as StaffCategory | null,
        existingId: row.id as string | undefined,
        replacesCategory: (row.replace as string[] | undefined)?.includes('staff_category'),
      }))
    )
  );
  // A category without kept posts has no training, so what the documents give for it is neither
  // written nor waited for.
  for (const entry of fieldsOf(proposal)) {
    const interval = intervalPaths[entry.path];
    if (interval && withPosts.includes(interval.category)) applyField(entry);
  }
  if (clientReplace.length) client.replace = clientReplace;
  if (fireReplace.length) fireSafety.replace = fireReplace;
  const inForce = (row: Row, current: Row | null, replaced: string[], column: string) =>
    row[column] !== undefined &&
    (!intoExistingClient || empty(current?.[column]) || replaced.includes(column))
      ? row[column]
      : intoExistingClient
        ? current?.[column]
        : undefined;
  // `clients` and `client_fire_safety` refuse a last day before the first.
  for (const [group, row, current, replaced] of [
    ['trainingSchedule', client, existing.client, clientReplace],
    ['fireSafety', fireSafety, existing.fireSafety, fireReplace],
  ] as const) {
    const from = inForce(row, current, replaced, 'training_day_from');
    const to = inForce(row, current, replaced, 'training_day_to');
    if (typeof from === 'number' && typeof to === 'number' && from > to) {
      block(`${group}.trainingDayTo`, 'invalid');
    }
  }
  const fireScheduleStarts = !(
    intoExistingClient && scheduleColumns.some((column) => !empty(existing.fireSafety?.[column]))
  );
  for (const [domain, row, current] of [
    ['ssm', client, existing.client],
    ['su', fireSafety, existing.fireSafety],
  ] as const) {
    for (const category of withPosts) {
      const column = intervalColumns[category];
      if (row[column] !== undefined || (intoExistingClient && !empty(current?.[column]))) continue;
      const { months } = importedTrainingInterval({
        domain,
        category,
        hasPosts: true,
        settled: null,
      });
      row[column] = months;
      // Nobody read it in the documents, so it is written only once the member confirms it.
      block(intervalPathOf(domain, category), 'choice');
    }
  }
  if (fireScheduleStarts && scheduleColumns.some((column) => fireSafety[column] !== undefined)) {
    const number = (value: unknown) => (typeof value === 'number' ? value : null);
    const occupational = (column: string) =>
      number(inForce(client, existing.client, clientReplace, column));
    const fills = fireScheduleStartFills(
      {
        periodicTrainingHours: number(fireSafety.periodic_training_hours),
        trainingFirstMonth: number(fireSafety.training_first_month),
        trainingDayFrom: number(fireSafety.training_day_from),
        trainingDayTo: number(fireSafety.training_day_to),
      },
      {
        trainingFirstMonth: occupational('training_first_month'),
        trainingDayFrom: occupational('training_day_from'),
        trainingDayTo: occupational('training_day_to'),
      }
    );
    for (const [field, column] of [
      ['periodicTrainingHours', 'periodic_training_hours'],
      ['trainingFirstMonth', 'training_first_month'],
      ['trainingDayFrom', 'training_day_from'],
      ['trainingDayTo', 'training_day_to'],
    ] as const) {
      if (fills[field] !== undefined) fireSafety[column] = fills[field];
    }
  }
  // An existing client's exclusion would otherwise keep the interval out (apply_client_import).
  if (intoExistingClient) {
    for (const category of withPosts) {
      const column = intervalColumns[category];
      const excluded = existing.client?.[column.replace('interval_months', 'not_applicable')];
      if (client[column] === undefined || excluded !== true) continue;
      const replace = (client.replace as string[] | undefined) ?? [];
      if (!replace.includes(column)) client.replace = [...replace, column];
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
