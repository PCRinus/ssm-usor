import {
  extinguisherCode,
  type FireDecision,
  fireDecisionOrdinals,
  type FireEquipmentKind,
  fireEquipmentKindLabels,
  fireEquipmentKinds,
  type FireExtinguisherNorm,
  fireExtinguisherNormLabels,
  type FireExtinguishingAgent,
  fireExtinguishingAgentLabels,
  fireExtinguishingAgents,
  type FireInstallationKind,
  fireInstallationKindLabels,
  fireSafetyMissingDocumentData,
  type ResponsiblePersonRole,
  samePersonName,
} from '@ssm-usor/contracts';

import { printedAddress } from '../../lib/address';
import { countOf, listed } from '../../lib/romanian';
import { type DocumentFacts, months, printedDate } from './context';
import { monthNames, themeIntervalLabel } from './themes';

type FireSafetyMissingData = (typeof fireSafetyMissingDocumentData)[number];

export type FireWorkplaceFacts = {
  id: string;
  activity: string | null;
  floorAreaM2: number | null;
  extinguisherNorm: FireExtinguisherNorm | null;
  assemblyPoint: string | null;
  combustibleMaterials: string | null;
  ignitionSources: string | null;
  fireRiskEquipment: string | null;
  specificMeasures: string | null;
};

export type FireSafetyClientFacts = {
  /** Null until the client's "Instruire PSI" card is first saved. */
  card: {
    periodicTrainingHours: number | null;
    administrativeTrainingIntervalMonths: number | null;
    workerTrainingIntervalMonths: number | null;
    trainingFirstMonth: number | null;
    trainingDayFrom: number | null;
    trainingDayTo: number | null;
    wasteKinds: string[];
    wasteContractor: string | null;
  } | null;
  /** An archived workplace's units too, which no document prints. */
  equipment: {
    workplaceId: string;
    kind: FireEquipmentKind;
    agent: FireExtinguishingAgent | null;
    /** Kilograms or litres. */
    capacity: number | null;
    wheeled: boolean;
  }[];
  installations: { workplaceId: string; kind: FireInstallationKind; description: string | null }[];
};

type Person = { name: string; jobTitle: string };

type FireWorkplaceContext = {
  /** The posted sheet opens a page for every workplace but the first. */
  first: boolean;
  name: string;
  activity: string;
  /** The printed address, or a dash. */
  address: string;
  floorAreaM2: number;
  /** "Clădiri comerciale (1 buc./200 m²)". */
  normLabel: string;
  assemblyPoint: string;
  combustibleMaterials: string;
  ignitionSources: string;
  fireRiskEquipment: string;
  /** Empty when not set: the posted sheet leaves point I.5 to be written in. */
  specificMeasures: string;
  extinguishers: {
    code: string;
    agentLabel: string;
    capacityLabel: string;
    wheeled: boolean;
    count: number;
  }[];
  extinguisherCount: number;
  otherEquipment: { kindLabel: string; count: number }[];
  installations: { kindLabel: string; description: string }[];
  hasInstallations: boolean;
  hasExteriorHydrants: boolean;
  hasInteriorHydrants: boolean;
  /** The workplace manager tied to this workplace or to none, first by name. */
  manager: Person | null;
  /** The intervention leaders and coordinators tied to this workplace or to none. */
  firstIntervention: (Person & { roleLabel: string })[];
  /** "Ion POP și Ana RUS"; the set's leader when nobody answers for this workplace alone. */
  firstInterventionNames: string;
  interventionLeaderName: string;
};

export type FireContext = {
  /** "5 PSI": the first decision number plus each decision's ordinal in the binder, minus one. */
  decisionNumbers: Record<FireDecision, string>;
  schedule: {
    periodicHours: number;
    /** "2 ore". */
    periodicLabel: string;
    administrativeIntervalMonths: number;
    /** "3 LUNI", as the provider's decisions print it. */
    administrativeIntervalLabel: string;
    /** "lunile februarie, mai, august și noiembrie". */
    administrativeMonths: string;
    workerIntervalMonths: number;
    workerIntervalLabel: string;
    workerMonths: string;
    firstMonth: number;
    /** "februarie". */
    firstMonthLabel: string;
    dayFrom: number;
    dayTo: number;
  };
  /** The names of the current job positions by staff category, and nothing else of them. */
  staff: {
    administrative: string[];
    execution: string[];
    /** "Lucrător comercial, Barman preparator"; null when the category has no position. */
    administrativeText: string | null;
    executionText: string | null;
  };
  coordinator: Person;
  interventionLeader: Person;
  workplaceManagers: (Person & { workplaceName: string | null })[];
  /** Each person once, for the acknowledgement tables. */
  designated: Person[];
  workplaces: FireWorkplaceContext[];
  hasExteriorHydrants: boolean;
  waste: { kinds: string[]; contractor: string | null };
};

/**
 * What every fire-safety template is merged with (ADR 016, ADR 018). Never the occupational
 * safety set's names: a snapshot keeps the whole value of a name a template printed, so a
 * `positions` here would mark fire-safety drafts as changed by a protective-equipment edit.
 */
export type FireSafetyContext = {
  branding: boolean;
  issueDate: string;
  client: { legalName: string; representativeName: string; representativeRole: string };
  provider: { legalName: string; representativeName: string; representativeRole: string };
  fireSafetyTechnician: { name: string };
  fire: FireContext;
};

export type FireSafetySetFacts = Pick<
  DocumentFacts,
  | 'issueDate'
  | 'firstDecisionNumber'
  | 'branding'
  | 'organization'
  | 'client'
  | 'workplaces'
  | 'responsiblePersons'
  | 'jobPositions'
  | 'fireSafety'
>;

const filled = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const requiredWorkplaceFacts = [
  'activity',
  'floorAreaM2',
  'extinguisherNorm',
  'assemblyPoint',
  'combustibleMaterials',
  'ignitionSources',
  'fireRiskEquipment',
] as const satisfies readonly (keyof FireWorkplaceFacts)[];

export function missingFireSafetyData(
  facts: Omit<FireSafetySetFacts, 'issueDate' | 'firstDecisionNumber' | 'branding'>
): FireSafetyMissingData[] {
  const { card } = facts.fireSafety;
  const held = new Set(facts.responsiblePersons.flatMap((person) => person.roles));
  const present: Record<FireSafetyMissingData, boolean> = {
    'provider.legalName': filled(facts.organization.legalName),
    'provider.fireSafetyTechnician': filled(facts.organization.fireSafetyTechnicianName),
    'client.representativeName': filled(facts.client.representativeName),
    'client.representativeRole': filled(facts.client.representativeRole),
    'fire.trainingSchedule':
      card !== null &&
      [
        card.periodicTrainingHours,
        card.administrativeTrainingIntervalMonths,
        card.workerTrainingIntervalMonths,
        card.trainingFirstMonth,
        card.trainingDayFrom,
        card.trainingDayTo,
      ].every((value) => value !== null),
    'fire.waste': (card?.wasteKinds ?? []).some(filled),
    'responsible.workplace_manager': held.has('workplace_manager'),
    'responsible.fire_safety_coordinator': held.has('fire_safety_coordinator'),
    'responsible.fire_intervention_leader': held.has('fire_intervention_leader'),
    'positions.any': facts.jobPositions.length > 0,
    // The means list and the posted sheet print one block per workplace: none prints nothing.
    'fire.workplaces':
      facts.workplaces.length > 0 &&
      facts.workplaces.every((workplace) =>
        requiredWorkplaceFacts.every((name) => {
          const value = workplace[name];
          return typeof value === 'string' ? filled(value) : value !== null;
        })
      ),
    'fire.equipment': facts.workplaces.every((workplace) =>
      facts.fireSafety.equipment.some(
        (unit) => unit.workplaceId === workplace.id && unit.kind === 'extinguisher'
      )
    ),
  };
  return fireSafetyMissingDocumentData.filter((code) => !present[code]);
}

const printedAs: Record<FireSafetyMissingData, keyof FireSafetyContext> = {
  'provider.legalName': 'provider',
  'provider.fireSafetyTechnician': 'fireSafetyTechnician',
  'client.representativeName': 'client',
  'client.representativeRole': 'client',
  'fire.trainingSchedule': 'fire',
  'fire.waste': 'fire',
  'responsible.workplace_manager': 'fire',
  'responsible.fire_safety_coordinator': 'fire',
  'responsible.fire_intervention_leader': 'fire',
  'positions.any': 'fire',
  'fire.workplaces': 'fire',
  'fire.equipment': 'fire',
};

/** Whether a gap is in a name the document printed, which its snapshot keeps. */
export function fireSafetyGapConcerns(code: string, printedNames: readonly string[]) {
  const name = printedAs[code as FireSafetyMissingData];
  return name === undefined || printedNames.includes(name);
}

const roleLabels: Partial<Record<ResponsiblePersonRole, string>> = {
  fire_intervention_leader: 'șef echipă de primă intervenție',
  fire_safety_coordinator: 'coordonator privind apărarea împotriva incendiilor',
};

// Litres for the agents sold by volume, kilograms for the rest, as the labels on the units read.
const capacityUnits: Record<FireExtinguishingAgent, string> = {
  powder: 'kg',
  co2: 'kg',
  foam: 'l',
  water: 'l',
  clean_agent: 'kg',
};

const collator = new Intl.Collator('ro');

function extinguisherGroups(units: FireSafetyClientFacts['equipment']) {
  const extinguishers = units.flatMap((unit) =>
    unit.kind === 'extinguisher' && unit.agent !== null && unit.capacity !== null
      ? [{ agent: unit.agent, capacity: unit.capacity, wheeled: unit.wheeled }]
      : []
  );
  const groups = new Map<string, FireWorkplaceContext['extinguishers'][number]>();
  for (const unit of extinguishers.sort(
    (a, b) =>
      fireExtinguishingAgents.indexOf(a.agent) - fireExtinguishingAgents.indexOf(b.agent) ||
      Number(a.wheeled) - Number(b.wheeled) ||
      a.capacity - b.capacity
  )) {
    const key = `${unit.agent}|${unit.capacity}|${unit.wheeled}`;
    const group = groups.get(key);
    if (group) {
      group.count += 1;
      continue;
    }
    groups.set(key, {
      code: extinguisherCode(unit.agent, unit.capacity),
      agentLabel: fireExtinguishingAgentLabels[unit.agent],
      capacityLabel: `${unit.capacity}\u00a0${capacityUnits[unit.agent]}`,
      wheeled: unit.wheeled,
      count: 1,
    });
  }
  return [...groups.values()];
}

function otherEquipmentGroups(units: FireSafetyClientFacts['equipment']) {
  return fireEquipmentKinds
    .filter((kind) => kind !== 'extinguisher')
    .map((kind) => ({
      kindLabel: fireEquipmentKindLabels[kind],
      count: units.filter((unit) => unit.kind === kind).length,
    }))
    .filter((group) => group.count > 0);
}

/**
 * Call `missingFireSafetyData` first: this throws when something is missing. The provider's
 * representative is not asked for, since no fire-safety document prints it; the provider keeps
 * the shape the occupational safety set gives it, with an empty name where none is stored.
 */
export function buildFireSafetyContext(facts: FireSafetySetFacts): FireSafetyContext {
  const missing = missingFireSafetyData(facts);
  if (missing.length > 0) throw new Error(`Missing document data: ${missing.join(', ')}`);
  const { organization, client } = facts;
  return {
    branding: facts.branding,
    issueDate: printedDate(facts.issueDate),
    client: {
      legalName: client.legalName.trim(),
      representativeName: client.representativeName!.trim(),
      representativeRole: client.representativeRole!.trim(),
    },
    provider: {
      legalName: organization.legalName!.trim(),
      representativeName: organization.representativeName?.trim() ?? '',
      representativeRole: organization.representativeRole?.trim() ?? '',
    },
    fireSafetyTechnician: { name: organization.fireSafetyTechnicianName!.trim() },
    fire: fireContext(facts),
  };
}

function fireContext(facts: FireSafetySetFacts): FireContext {
  const card = facts.fireSafety.card!;
  const asPerson = (person: DocumentFacts['responsiblePersons'][number]): Person => ({
    name: person.fullName.trim(),
    jobTitle: person.jobTitle.trim(),
  });
  const holding = (role: ResponsiblePersonRole) =>
    facts.responsiblePersons.filter((person) => person.roles.includes(role));
  const servesAt = (workplaceId: string) => (person: { workplaceId: string | null }) =>
    person.workplaceId === null || person.workplaceId === workplaceId;
  const coordinator = asPerson(holding('fire_safety_coordinator')[0]!);
  const interventionLeader = asPerson(holding('fire_intervention_leader')[0]!);
  const managers = holding('workplace_manager');
  const workplaceManagers = managers.map((person) => ({
    ...asPerson(person),
    workplaceName:
      facts.workplaces.find((workplace) => workplace.id === person.workplaceId)?.name.trim() ??
      null,
  }));
  const designated: Person[] = [];
  for (const person of [coordinator, interventionLeader, ...workplaceManagers]) {
    if (!designated.some((each) => samePersonName(each.name, person.name))) {
      designated.push({ name: person.name, jobTitle: person.jobTitle });
    }
  }
  const staffOf = (category: 'technical_administrative' | 'execution') =>
    facts.jobPositions
      .filter((position) => position.staffCategory === category)
      .map((position) => position.name.trim());
  const administrative = staffOf('technical_administrative');
  const execution = staffOf('execution');
  const decisionNumbers = Object.fromEntries(
    (Object.keys(fireDecisionOrdinals) as FireDecision[]).map((decision) => [
      decision,
      `${facts.firstDecisionNumber + fireDecisionOrdinals[decision] - 1} PSI`,
    ])
  ) as Record<FireDecision, string>;

  const workplaces = facts.workplaces.map((workplace, index): FireWorkplaceContext => {
    const units = facts.fireSafety.equipment.filter((unit) => unit.workplaceId === workplace.id);
    const installations = facts.fireSafety.installations.filter(
      (installation) => installation.workplaceId === workplace.id
    );
    const manager = managers
      .filter(servesAt(workplace.id))
      .map(asPerson)
      .sort((a, b) => collator.compare(a.name, b.name))[0];
    const firstIntervention = facts.responsiblePersons
      .filter(
        (person) =>
          servesAt(workplace.id)(person) &&
          (person.roles.includes('fire_intervention_leader') ||
            person.roles.includes('fire_safety_coordinator'))
      )
      .sort(
        (a, b) =>
          Number(!a.roles.includes('fire_intervention_leader')) -
          Number(!b.roles.includes('fire_intervention_leader'))
      )
      .map((person) => ({
        ...asPerson(person),
        roleLabel: listed(
          (['fire_intervention_leader', 'fire_safety_coordinator'] as const)
            .filter((role) => person.roles.includes(role))
            .map((role) => roleLabels[role]!)
        ),
      }));
    const leaderHere = facts.responsiblePersons.find(
      (person) =>
        servesAt(workplace.id)(person) && person.roles.includes('fire_intervention_leader')
    );
    const interventionLeaderName = leaderHere ? asPerson(leaderHere).name : interventionLeader.name;
    const norm = fireExtinguisherNormLabels[workplace.extinguisherNorm!];
    const extinguishers = extinguisherGroups(units);
    return {
      first: index === 0,
      name: workplace.name.trim(),
      activity: workplace.activity!.trim(),
      address: printedAddress(workplace) || '—',
      floorAreaM2: workplace.floorAreaM2!,
      normLabel: `${norm.label} (${norm.rate})`,
      assemblyPoint: workplace.assemblyPoint!.trim(),
      combustibleMaterials: workplace.combustibleMaterials!.trim(),
      ignitionSources: workplace.ignitionSources!.trim(),
      fireRiskEquipment: workplace.fireRiskEquipment!.trim(),
      specificMeasures: workplace.specificMeasures?.trim() ?? '',
      extinguishers,
      extinguisherCount: extinguishers.reduce((total, group) => total + group.count, 0),
      otherEquipment: otherEquipmentGroups(units),
      installations: installations.map((installation) => ({
        kindLabel: fireInstallationKindLabels[installation.kind],
        description: installation.description?.trim() ?? '',
      })),
      hasInstallations: installations.length > 0,
      hasExteriorHydrants: installations.some((each) => each.kind === 'exterior_hydrants'),
      hasInteriorHydrants: installations.some((each) => each.kind === 'interior_hydrants'),
      manager: manager ?? null,
      firstIntervention,
      firstInterventionNames:
        firstIntervention.length > 0
          ? listed(firstIntervention.map((person) => person.name))
          : interventionLeaderName,
      interventionLeaderName,
    };
  });

  return {
    decisionNumbers,
    schedule: {
      periodicHours: card.periodicTrainingHours!,
      periodicLabel: countOf(card.periodicTrainingHours!, 'oră', 'ore').replace(' ', '\u00a0'),
      administrativeIntervalMonths: card.administrativeTrainingIntervalMonths!,
      administrativeIntervalLabel: themeIntervalLabel(card.administrativeTrainingIntervalMonths),
      administrativeMonths: months(
        card.trainingFirstMonth!,
        card.administrativeTrainingIntervalMonths!
      ),
      workerIntervalMonths: card.workerTrainingIntervalMonths!,
      workerIntervalLabel: themeIntervalLabel(card.workerTrainingIntervalMonths),
      workerMonths: months(card.trainingFirstMonth!, card.workerTrainingIntervalMonths!),
      firstMonth: card.trainingFirstMonth!,
      firstMonthLabel: monthNames[card.trainingFirstMonth! - 1]!,
      dayFrom: card.trainingDayFrom!,
      dayTo: card.trainingDayTo!,
    },
    staff: {
      administrative,
      execution,
      administrativeText: administrative.length > 0 ? administrative.join(', ') : null,
      executionText: execution.length > 0 ? execution.join(', ') : null,
    },
    coordinator,
    interventionLeader,
    workplaceManagers,
    designated,
    workplaces,
    hasExteriorHydrants: workplaces.some((workplace) => workplace.hasExteriorHydrants),
    waste: {
      kinds: card.wasteKinds.map((kind) => kind.trim()).filter(Boolean),
      contractor: card.wasteContractor?.trim() || null,
    },
  };
}
