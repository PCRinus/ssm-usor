import {
  decisionTypeKeys,
  type MissingDocumentData,
  type ResponsiblePersonRole,
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
    periodicTrainingHours: number | null;
    administrativeTrainingIntervalMonths: number | null;
    workerTrainingIntervalMonths: number | null;
    trainingFirstMonth: number | null;
    trainingDayFrom: number | null;
    trainingDayTo: number | null;
  };
  /** In the order they should be printed. */
  responsiblePersons: { fullName: string; jobTitle: string; roles: ResponsiblePersonRole[] }[];
};

type Person = { name: string; jobTitle: string };

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
  training: {
    periodicDuration: string;
    administrativeFrequency: string;
    administrativeMonths: string;
    workerFrequency: string;
    workerMonths: string;
    dayFrom: number;
    dayTo: number;
  };
  unitRisks: { risk: string; measure: string }[];
};

const filled = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** What is in the way of generating, in the order the form lists it. Empty when ready. */
export function missingDocumentData(facts: DocumentFacts): MissingDocumentData[] {
  const { organization, specialist, client } = facts;
  const schedule = [
    client.periodicTrainingHours,
    client.administrativeTrainingIntervalMonths,
    client.workerTrainingIntervalMonths,
    client.trainingFirstMonth,
    client.trainingDayFrom,
    client.trainingDayTo,
  ];
  const held = new Set(facts.responsiblePersons.flatMap((person) => person.roles));
  const checks: [MissingDocumentData, boolean][] = [
    ['provider.legalName', filled(organization.legalName)],
    ['provider.representativeName', filled(organization.representativeName)],
    ['provider.representativeRole', filled(organization.representativeRole)],
    ['specialist.name', filled(specialist?.fullName)],
    ['specialist.professionalTitle', filled(specialist?.professionalTitle)],
    ['client.representativeName', filled(client.representativeName)],
    ['client.representativeRole', filled(client.representativeRole)],
    ['client.trainingSchedule', schedule.every((value) => value !== null)],
    ['responsible.workplace_manager', held.has('workplace_manager')],
    ['responsible.first_aid', held.has('first_aid')],
    ['responsible.risk_evaluation_team', held.has('risk_evaluation_team')],
    ['responsible.imminent_danger', held.has('imminent_danger')],
  ];
  return checks.filter(([, present]) => !present).map(([code]) => code);
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
  const workplaceManagers = withRole('workplace_manager');
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
    training: {
      periodicDuration:
        client.periodicTrainingHours === 1 ? '1 oră' : `${client.periodicTrainingHours} ore`,
      administrativeFrequency: frequency(client.administrativeTrainingIntervalMonths!),
      administrativeMonths: months(
        client.trainingFirstMonth!,
        client.administrativeTrainingIntervalMonths!
      ),
      workerFrequency: frequency(client.workerTrainingIntervalMonths!),
      workerMonths: months(client.trainingFirstMonth!, client.workerTrainingIntervalMonths!),
      dayFrom: client.trainingDayFrom!,
      dayTo: client.trainingDayTo!,
    },
    // The unit's own risks come from the risk assessment, which is not in the app yet: the
    // chapter is generated as a row to fill in by hand (ADR 005).
    unitRisks: [{ risk: unfilledMark, measure: unfilledMark }],
  };
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
