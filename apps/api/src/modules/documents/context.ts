import {
  decisionTypeKeys,
  type EquipmentAllocation,
  formatTrainingDuration,
  type InstructionModuleGroup,
  type MissingDocumentData,
  requiredWorkersRepresentatives,
  type ResponsiblePersonRole,
  samePersonName,
  type StaffCategory,
  trainingMonths,
  unfilledMark,
} from '@ssm-usor/contracts';

// Pure: reading the database and merging happen elsewhere. The result is also what a revision
// keeps as its data snapshot.

export type DocumentFacts = {
  /** ISO date, "2026-01-19". */
  issueDate: string;
  firstDecisionNumber: number;
  /** Whether the documents carry the "generated with" footer line. */
  branding: boolean;
  organization: {
    legalName: string | null;
    representativeName: string | null;
    representativeRole: string | null;
  };
  /** The member who prepares the documents, or null when there is none to name. */
  specialist: { fullName: string | null; professionalTitle: string | null } | null;
  client: {
    legalName: string;
    representativeName: string | null;
    representativeRole: string | null;
    periodicTrainingMinutes: number | null;
    administrativeTrainingIntervalMonths: number | null;
    administrativeTrainingNotApplicable: boolean;
    workerTrainingIntervalMonths: number | null;
    workerTrainingNotApplicable: boolean;
    trainingFirstMonth: number | null;
    trainingDayFrom: number | null;
    trainingDayTo: number | null;
  };
  /** In the order they should be printed. */
  responsiblePersons: {
    fullName: string;
    jobTitle: string;
    roles: ResponsiblePersonRole[];
    /** Linked to an employee who has not left. */
    currentEmployee: boolean;
  }[];
  /** The current positions in the order of the positions table, each with its equipment. */
  jobPositions: {
    id: string;
    name: string;
    staffCategory: StaffCategory;
    workZone: string | null;
    activities: string | null;
    /** The post's own interval, or null for the client's interval of its category. */
    trainingIntervalMonths: number | null;
    /** Null until decided; false when the post needs none; true while it has entries (ADR 011). */
    needsProtectiveEquipment: boolean | null;
    /** Null until decided; false when the post needs none; true while it applies modules (ADR 012). */
    needsInstructions: boolean | null;
    /** The instruction modules the post applies, each with its current version. */
    instructions: {
      moduleId: string;
      title: string;
      group: InstructionModuleGroup;
      version: { id: string; number: number; createdAt: string };
    }[];
    equipment: {
      risk: string;
      item: string;
      quantity: number;
      durationMonths: number | null;
      allocation: EquipmentAllocation;
    }[];
  }[];
  /** Categories held by at least one current employee, based on their job position. */
  staffCategoriesInUse: StaffCategory[];
  currentEmployeeCount: number;
  /** Whether decision 1.5 was generated for this client, whatever the headcount is now. */
  workersRepresentativeDecisionGenerated: boolean;
};

type Person = { name: string; jobTitle: string };

type PositionContext = {
  name: string;
  activities: string;
  staffCategory: string;
  workZone: string;
  /** One item when the position has a work zone, which the section head then prints. */
  workZoneLine: Record<string, never>[];
  /** The zone, or a dash in a table cell. */
  workZoneOrDash: string;
  /** "la 3 luni", the post's own interval or its category's. */
  intervalLabel: string;
  /** "2 ore", the client's periodic training duration. */
  trainingDuration: string;
  equipment: { risk: string; item: string; quantityLabel: string; allocationLabel: string }[];
};

/** One annexed instruction module of the own instructions (ADR 012). */
type AnnexContext = {
  number: number;
  title: string;
  /** The module version the document annexes; what issuing merges into the PDF. */
  versionId: string;
  versionDate: string;
};

export type DocumentContext = {
  branding: Record<string, never>[];
  issueDate: string;
  issueYear: string;
  followingYear: string;
  decisionNumbers: Record<(typeof decisionTypeKeys)[number], number>;
  client: { legalName: string; representativeName: string; representativeRole: string };
  provider: { legalName: string; representativeName: string; representativeRole: string };
  specialist: { name: string; professionalTitle: string };
  workplaceManagers: Person[];
  workplaceManager: Person;
  firstAiders: Person[];
  firstAiderNames: string;
  evaluationTeam: Person[];
  imminentDanger: Person[];
  imminentDangerText: string;
  /** One item when decision 1.5 is part of the set, which the cover lists. */
  workersRepresentativeDecision: Record<string, never>[];
  workersRepresentatives: Person[];
  /** "următorul angajat" or "următorii angajați". */
  workersRepresentativesLead: string;
  training: {
    periodicDuration: string;
    intervalPhrase: string;
    administrative: Record<string, never>[];
    worker: Record<string, never>[];
    administrativeFrequency?: string;
    administrativeMonths?: string;
    workerFrequency?: string;
    workerMonths?: string;
    dayFrom: number;
    dayTo: number;
  };
  unitRisks: { risk: string; measure: string }[];
  /** Every current position, for the table of posts; then only the ones with equipment. */
  positions: PositionContext[];
  equippedPositions: PositionContext[];
  /** The modules the positions apply, each once, in the order of the groups and titles. */
  annexes: AnnexContext[];
  /** One item when no position applies a module, which the chapter then says. */
  noAnnexes: Record<string, never>[];
};

const staffCategoryLabels: Record<StaffCategory, string> = {
  technical_administrative: 'Tehnic-administrativ',
  execution: 'Execuție',
};

const allocationLabels: Record<EquipmentAllocation, string> = {
  personal_inventory: 'Inventar personal',
  section_inventory: 'Inventar de secție',
  consumable: 'Consum',
};

/** "2 buc. / 12 luni"; a consumable has no duration, and its mode says so in its column. */
function quantityLabel(entry: { quantity: number; durationMonths: number | null }) {
  const pieces = `${entry.quantity} buc.`;
  if (entry.durationMonths === null) return pieces;
  return `${pieces} / ${entry.durationMonths === 1 ? '1 lună' : `${entry.durationMonths} luni`}`;
}

/**
 * The positions still undecided about their equipment (ADR 011) or their instructions
 * (ADR 012), either of which blocks generating; each once.
 */
export function undecidedJobPositions(
  facts: Pick<DocumentFacts, 'jobPositions'>,
  about: 'equipment' | 'instructions' | 'either' = 'either'
) {
  return facts.jobPositions
    .filter(
      (position) =>
        (about !== 'instructions' && position.needsProtectiveEquipment === null) ||
        (about !== 'equipment' && position.needsInstructions === null)
    )
    .map((position) => ({ id: position.id, name: position.name.trim() }));
}

const filled = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * What is in the way of generating, in the order the form lists it. Empty when ready. With a
 * `typeKey`, what generating that one document again needs.
 */
export function missingDocumentData(facts: DocumentFacts, typeKey?: string): MissingDocumentData[] {
  const { organization, specialist, client } = facts;
  const sharedSchedule = [
    client.periodicTrainingMinutes,
    client.trainingFirstMonth,
    client.trainingDayFrom,
    client.trainingDayTo,
  ];
  const administrative = client.administrativeTrainingIntervalMonths;
  const worker = client.workerTrainingIntervalMonths;
  const scheduleReady =
    sharedSchedule.every((value) => value !== null) &&
    (administrative !== null || client.administrativeTrainingNotApplicable) &&
    (worker !== null || client.workerTrainingNotApplicable) &&
    (administrative !== null || worker !== null) &&
    !(client.administrativeTrainingNotApplicable && administrative !== null) &&
    !(client.workerTrainingNotApplicable && worker !== null) &&
    (!facts.staffCategoriesInUse.includes('technical_administrative') || administrative !== null) &&
    (!facts.staffCategoriesInUse.includes('execution') || worker !== null);
  const held = new Set(facts.responsiblePersons.flatMap((person) => person.roles));
  // A 1.5 kept below 10 employees still names someone when it is generated again (ADR 010).
  const representativesNeeded = Math.max(
    requiredWorkersRepresentatives(facts.currentEmployeeCount),
    typeKey === 'decision_workers_representative' ? 1 : 0
  );
  const representatives = currentWorkersRepresentatives(facts);
  const checks: [MissingDocumentData, boolean][] = [
    ['provider.legalName', filled(organization.legalName)],
    ['provider.representativeName', filled(organization.representativeName)],
    ['provider.representativeRole', filled(organization.representativeRole)],
    ['specialist.name', filled(specialist?.fullName)],
    ['specialist.professionalTitle', filled(specialist?.professionalTitle)],
    ['client.representativeName', filled(client.representativeName)],
    ['client.representativeRole', filled(client.representativeRole)],
    ['client.trainingSchedule', scheduleReady],
    ['responsible.workplace_manager', held.has('workplace_manager')],
    ['responsible.first_aid', held.has('first_aid')],
    ['responsible.risk_evaluation_team', held.has('risk_evaluation_team')],
    ['responsible.imminent_danger', held.has('imminent_danger')],
    [
      'responsible.workers_representative',
      representativesNeeded === 0 || representatives.length > 0,
    ],
    [
      'responsible.workers_representatives_two',
      representatives.length === 0 || representatives.length >= representativesNeeded,
    ],
    [
      'responsible.workers_representative_is_legal_representative',
      representativesNeeded === 0 || workersRepresentativeClash(facts) === null,
    ],
    ['positions.any', facts.jobPositions.length > 0],
    ['positions.equipment', undecidedJobPositions(facts, 'equipment').length === 0],
    ['positions.instructions', undecidedJobPositions(facts, 'instructions').length === 0],
  ];
  return checks.filter(([, present]) => !present).map(([code]) => code);
}

// A representative whose employee has left no longer speaks for the workers.
const currentWorkersRepresentatives = (facts: Pick<DocumentFacts, 'responsiblePersons'>) =>
  facts.responsiblePersons.filter(
    (person) => person.roles.includes('workers_representative') && person.currentEmployee
  );

export function workersRepresentativeClash(
  facts: Pick<DocumentFacts, 'client' | 'responsiblePersons'>
): { representativeName: string; legalRepresentativeName: string } | null {
  const legalRepresentativeName = facts.client.representativeName?.trim();
  if (!legalRepresentativeName) return null;
  const representative = currentWorkersRepresentatives(facts).find((person) =>
    samePersonName(person.fullName, legalRepresentativeName)
  );
  return representative
    ? { representativeName: representative.fullName.trim(), legalRepresentativeName }
    : null;
}

const monthNames = [
  'ianuarie',
  'februarie',
  'martie',
  'aprilie',
  'mai',
  'iunie',
  'iulie',
  'august',
  'septembrie',
  'octombrie',
  'noiembrie',
  'decembrie',
];

// "va fi instruit TRIMESTRIAL, respectiv în lunile …": the provider's decisions print it in
// capitals.
function frequency(intervalMonths: number) {
  const named: Record<number, string> = {
    1: 'LUNAR',
    3: 'TRIMESTRIAL',
    6: 'SEMESTRIAL',
    12: 'ANUAL',
  };
  return named[intervalMonths] ?? `LA ${intervalMonths} LUNI`;
}

const months = (firstMonth: number, intervalMonths: number) =>
  trainingMonths(firstMonth, intervalMonths)
    .map((month) => monthNames[month - 1])
    .join(', ');

export function printedDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

/**
 * The data every template is merged with. Call `missingDocumentData` first: this throws when
 * something is missing, because a data field is never left blank in a document.
 */
export function buildDocumentContext(facts: DocumentFacts): DocumentContext {
  const missing = missingDocumentData(facts);
  if (missing.length > 0) throw new Error(`Missing document data: ${missing.join(', ')}`);
  const { organization, client } = facts;
  const year = Number(facts.issueDate.slice(0, 4));
  const withRole = (role: ResponsiblePersonRole): Person[] =>
    facts.responsiblePersons
      .filter((person) => person.roles.includes(role))
      .map((person) => ({ name: person.fullName.trim(), jobTitle: person.jobTitle.trim() }));
  const workersRepresentatives = currentWorkersRepresentatives(facts).map((person) => ({
    name: person.fullName.trim(),
    jobTitle: person.jobTitle.trim(),
  }));
  const intervalOf = (position: DocumentFacts['jobPositions'][number]) =>
    position.trainingIntervalMonths ??
    (position.staffCategory === 'execution'
      ? client.workerTrainingIntervalMonths
      : client.administrativeTrainingIntervalMonths);
  const positions: PositionContext[] = facts.jobPositions.map((position) => ({
    name: position.name.trim(),
    activities: position.activities?.trim() || '—',
    staffCategory: staffCategoryLabels[position.staffCategory],
    workZone: position.workZone?.trim() ?? '',
    workZoneLine: position.workZone?.trim() ? [{}] : [],
    workZoneOrDash: position.workZone?.trim() || '—',
    intervalLabel: intervalLabel(intervalOf(position)),
    trainingDuration: formatTrainingDuration(client.periodicTrainingMinutes!),
    equipment: position.equipment.map((entry) => ({
      risk: entry.risk.trim(),
      item: entry.item.trim(),
      quantityLabel: quantityLabel(entry),
      allocationLabel: allocationLabels[entry.allocation],
    })),
  }));
  const workplaceManagers = withRole('workplace_manager');
  const annexes = annexedModules(facts);
  const firstAiders = withRole('first_aid');
  const imminentDanger = withRole('imminent_danger');
  return {
    branding: facts.branding ? [{}] : [],
    issueDate: printedDate(facts.issueDate),
    issueYear: String(year),
    followingYear: String(year + 1),
    decisionNumbers: Object.fromEntries(
      decisionTypeKeys.map((key, index) => [key, facts.firstDecisionNumber + index])
    ) as DocumentContext['decisionNumbers'],
    client: {
      legalName: client.legalName.trim(),
      representativeName: client.representativeName!.trim(),
      representativeRole: client.representativeRole!.trim(),
    },
    provider: {
      legalName: organization.legalName!.trim(),
      representativeName: organization.representativeName!.trim(),
      representativeRole: organization.representativeRole!.trim(),
    },
    specialist: {
      name: facts.specialist!.fullName!.trim(),
      professionalTitle: facts.specialist!.professionalTitle!.trim(),
    },
    workplaceManagers,
    workplaceManager: workplaceManagers[0]!,
    firstAiders,
    firstAiderNames: firstAiders.map((person) => person.name).join(', '),
    evaluationTeam: withRole('risk_evaluation_team'),
    imminentDanger,
    imminentDangerText: imminentDanger
      .map((person) => `${person.name} având funcția de ${person.jobTitle}`)
      .join(', '),
    // A 1.5 that exists stays in the set below 10 employees, so the cover keeps listing it.
    workersRepresentativeDecision:
      documentApplies(facts, 'decision_workers_representative') ||
      facts.workersRepresentativeDecisionGenerated
        ? [{}]
        : [],
    workersRepresentatives,
    workersRepresentativesLead:
      workersRepresentatives.length === 1 ? 'următorul angajat' : 'următorii angajați',
    training: {
      periodicDuration: formatTrainingDuration(client.periodicTrainingMinutes!),
      intervalPhrase:
        client.administrativeTrainingIntervalMonths !== null &&
        client.workerTrainingIntervalMonths !== null
          ? 'următoarele intervale de timp'
          : 'următorul interval de timp',
      administrative: client.administrativeTrainingIntervalMonths === null ? [] : [{}],
      worker: client.workerTrainingIntervalMonths === null ? [] : [{}],
      ...(client.administrativeTrainingIntervalMonths === null
        ? {}
        : {
            administrativeFrequency: frequency(client.administrativeTrainingIntervalMonths),
            administrativeMonths: months(
              client.trainingFirstMonth!,
              client.administrativeTrainingIntervalMonths
            ),
          }),
      ...(client.workerTrainingIntervalMonths === null
        ? {}
        : {
            workerFrequency: frequency(client.workerTrainingIntervalMonths),
            workerMonths: months(client.trainingFirstMonth!, client.workerTrainingIntervalMonths),
          }),
      dayFrom: client.trainingDayFrom!,
      dayTo: client.trainingDayTo!,
    },
    // The unit's own risks come from the risk assessment, which is not in the app yet: the
    // chapter is generated as a row to fill in by hand (ADR 005).
    unitRisks: [{ risk: unfilledMark, measure: unfilledMark }],
    positions,
    equippedPositions: positions.filter((position) => position.equipment.length > 0),
    annexes,
    noAnnexes: annexes.length === 0 ? [{}] : [],
  };
}

const groupOrder: Record<InstructionModuleGroup, number> = {
  work_activity: 0,
  work_equipment: 1,
  protective_equipment: 2,
};
const collator = new Intl.Collator('ro');

/** The modules the current positions apply, each once, numbered in group and title order. */
export function annexedModules(facts: Pick<DocumentFacts, 'jobPositions'>): AnnexContext[] {
  const modules = new Map<string, DocumentFacts['jobPositions'][number]['instructions'][number]>();
  for (const position of facts.jobPositions) {
    for (const module of position.instructions) modules.set(module.moduleId, module);
  }
  return [...modules.values()]
    .sort((a, b) => groupOrder[a.group] - groupOrder[b.group] || collator.compare(a.title, b.title))
    .map((module, index) => ({
      number: index + 1,
      title: module.title.trim(),
      versionId: module.version.id,
      versionDate: printedDate(module.version.createdAt.slice(0, 10)),
    }));
}

/** "la 3 luni", "lunar"; a post whose category has no interval prints a dash. */
function intervalLabel(months: number | null) {
  if (months === null) return '—';
  return months === 1 ? 'lunar' : `la ${months} luni`;
}

/**
 * Whether a document belongs in this client's set. Decision 1.5 only does from 10 current
 * employees (ADR 010); a document that already exists is kept regardless.
 */
export function documentApplies(
  facts: Pick<DocumentFacts, 'currentEmployeeCount'>,
  typeKey: string
): boolean {
  return (
    typeKey !== 'decision_workers_representative' ||
    requiredWorkersRepresentatives(facts.currentEmployeeCount) > 0
  );
}

/**
 * What one template is merged with: a decision also gets its number, the one the document
 * already has when it is generated again.
 */
export function documentData(
  context: DocumentContext,
  typeKey: string,
  decisionNumber: number | null = decisionNumberOf(context, typeKey)
) {
  const shared: Record<string, unknown> = { ...context };
  delete shared.decisionNumbers;
  return decisionNumber === null ? shared : { ...shared, decisionNumber };
}

/** The number a decision gets in this generation; null for any other document. */
export function decisionNumberOf(context: DocumentContext, typeKey: string) {
  return typeKey in context.decisionNumbers
    ? context.decisionNumbers[typeKey as keyof DocumentContext['decisionNumbers']]
    : null;
}

/** JSON with sorted keys: the database stores a snapshot as jsonb, which reorders them. */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
