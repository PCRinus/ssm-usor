import {
  extinguisherCode,
  type FireBuildingClassification,
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
  fireSafetyMissingDocumentData,
  type FireSafetyTypeKeyFromTenEmployees,
  type FireSmokingPolicy,
  type FireSubstanceDetail,
  fireSubstanceDetails,
  type FireSubstancesState,
  type ResponsiblePersonRole,
  samePersonName,
  type StaffCategory,
  trainingMonths,
  unfilledMark,
  workplaceHasAreaAndNorm,
  type WorkplaceKind,
} from '@ssm-usor/contracts';

import { printedAddress } from '../../lib/address';
import { countOf, listed, runOn, withoutFinalStop } from '../../lib/romanian';
import { type AnnualReportContext, buildAnnualReport } from './annual-report';
import {
  type AnnexContext,
  annexedModules,
  documentApplies,
  type DocumentFacts,
  months,
  printedDate,
} from './context';
import { installationParts, installationText } from './installations';
import { buildSiteSheet, type SiteSheetContext } from './site-sheet';
import {
  dealChapters,
  fireOwnInstructionsChapters,
  monthNames,
  themeIntervalLabel,
  type TrainingSession,
  workplaceManagersTrainer,
} from './themes';

type FireSafetyMissingData = (typeof fireSafetyMissingDocumentData)[number];

export type FireWorkplaceFacts = {
  id: string;
  activity: string | null;
  kind: WorkplaceKind;
  floorAreaM2: number | null;
  extinguisherNorm: FireExtinguisherNorm | null;
  assemblyPoint: string | null;
  combustibleMaterials: string | null;
  ignitionSources: string | null;
  fireRiskEquipment: string | null;
  specificMeasures: string | null;
};

type FireSubstanceFacts = {
  name: string;
  classification: string;
  quantity: string;
} & Record<FireSubstanceDetail, string | null>;

export type FireSafetyClientFacts = {
  /** Null while the client has no fire-safety row, which the card or the substances state creates. */
  card: {
    periodicTrainingHours: number | null;
    administrativeTrainingIntervalMonths: number | null;
    workerTrainingIntervalMonths: number | null;
    trainingFirstMonth: number | null;
    trainingDayFrom: number | null;
    trainingDayTo: number | null;
    smokingPolicy: FireSmokingPolicy | null;
    /** Only with the designated-places policy. */
    smokingPlace: string | null;
    wasteKinds: string[];
    wasteContractor: string | null;
    wasteCollectors: string | null;
    hasThirdParties: boolean;
  } | null;
  /** An archived workplace's units too, which no document prints. */
  equipment: {
    workplaceId: string;
    kind: FireEquipmentKind;
    agent: FireExtinguishingAgent | null;
    /** Kilograms or litres. */
    capacity: number | null;
    wheeled: boolean;
    nextServiceOn: string | null;
    maintainer: string | null;
  }[];
  installations: {
    workplaceId: string;
    kind: FireInstallationKind;
    description: string | null;
    maintainer: string | null;
    lastCheckOn: string | null;
    nextCheckOn: string | null;
  }[];
  /** The free rows of the schedules, in their order on the workplace; an archived workplace's too. */
  maintenanceItems: {
    workplaceId: string;
    subject: string;
    intervalLabel: string;
    checkedBy: string;
  }[];
  /** One per workplace at most; a mobile site's or an archived workplace's too, which no document prints. */
  buildings: {
    workplaceId: string;
    yearBuilt: number | null;
    builtAreaM2: number | null;
    levels: string | null;
    classification: FireBuildingClassification | null;
    structure: string | null;
    heatingFuel: string | null;
    gasUse: string | null;
    electricalMaintainer: string | null;
    electricalLastCheckOn: string | null;
    /** Cubic metres; 0 where the building has no reserve of its own. */
    waterReserveM3: number | null;
    notes: string | null;
  }[];
  /** Those of the documents required from ten employees the client has, whatever its count now. */
  generatedFromTenEmployees: FireSafetyTypeKeyFromTenEmployees[];
  /** The documents of the set that have a revision, each with its current draft and issued one. */
  documents: {
    typeKey: string;
    title: string;
    decisionNumber: number | null;
    period: number | null;
    /** `issueDate` null for an uploaded file. */
    draft: { revision: number; issueDate: string | null } | null;
    issued: { revision: number; issueDate: string | null } | null;
  }[];
  /** `undecided` too while the client has no fire-safety row. */
  substances: { state: FireSubstancesState; entries: FireSubstanceFacts[] };
};

type Person = {
  name: string;
  jobTitle: string;
  /** "mecanic auto": the job title inside a sentence, where a table cell prints `jobTitle`. */
  jobTitleRunOn: string;
};

type FireWorkplaceContext = {
  /** The posted sheet opens a page for every workplace but the first. */
  first: boolean;
  name: string;
  activity: string;
  activityRunOn: string;
  /** The printed address, or a dash. */
  address: string;
  /** "450 m²", or a dash for a mobile site. */
  areaLabel: string;
  /** "Clădiri comerciale (1 buc./200 m²)", "fără normă din anexa 6", or a dash for a mobile site. */
  normLabel: string;
  assemblyPoint: string;
  /** The three texts of section I end without a stop: the posted instructions list them as items. */
  combustibleMaterials: string;
  ignitionSources: string;
  fireRiskEquipment: string;
  /** Empty when not set: the posted sheet leaves point I.5 to be written in. */
  specificMeasures: string;
  specificMeasuresRunOn: string;
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
  /**
   * Who cuts the power, works the installations and leads the evacuation here: the leader tied
   * to this workplace, else its manager, else the set's leader.
   */
  interventionLeaderName: string;
};

/**
 * Who gives one kind of training. The template names the technician from `provider` and
 * `fireSafetyTechnician`: printed inside `fire`, they would leave it out with their own gaps,
 * and mark every draft that prints it when the technician changes.
 */
type FireTrainers = {
  /** "Ion POP și Ana RUS – conducătorii locurilor de muncă"; null where the technician alone trains. */
  workplaceManagers: string | null;
  technician: boolean;
};

type FireThemesCategoryContext = {
  staffCategory: StaffCategory;
  /** "Personal administrativ", as decision 2 names the category. */
  label: string;
  posts: string[];
  /** "Contabil, Sudor". */
  postsText: string;
  workplaceTrainers: FireTrainers;
  periodicTrainers: FireTrainers;
  intervalLabel: string;
  sessions: TrainingSession[];
};

/**
 * The fire-safety training themes 3.1, apart from `fire` so that a new IPSU revision dates only
 * them, as the occupational safety themes keep to `themes` (ADR 014).
 */
type FireThemesContext = {
  /** Never printed: what makes the themes out of date when the IPSU changes. */
  ownInstructionsRevision: { id: string; number: number; versionIds: string[] };
  /** "Sediul social, Atelierul mecanic": the active workplaces, the registered office first. */
  workplaceNames: string;
  /** One per staff category with current posts, technical-administrative first. */
  categories: FireThemesCategoryContext[];
};

type FireScheduleRow = { what: string; interval: string; who: string; basis: string };

type FireScheduleContext = {
  name: string;
  activity: string;
  /** The extinguishers' rows, then one per installation, then the free rows. */
  rows: FireScheduleRow[];
  hasRows: boolean;
  empty: boolean;
};

/** Every text of the data sheet as typed, or the mark the editor finds when it is empty. */
type FireSubstanceContext = {
  name: string;
  classification: string;
  quantity: string;
} & Record<FireSubstanceDetail, string>;

export type FireContext = {
  /** "5 PSI": the first decision number plus each decision's ordinal in the binder, minus one. */
  decisionNumbers: Record<FireDecision, string>;
  schedule: {
    periodicHours: number;
    /** "2 ore". */
    periodicLabel: string;
    administrativeIntervalMonths: number;
    /** "3 luni". */
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
  /** "administrator": the client's representative's role inside a sentence. */
  representativeRoleRunOn: string;
  coordinator: Person;
  interventionLeader: Person;
  workplaceManagers: (Person & { workplaceName: string | null })[];
  /** More than one workplace manager, which decision 1 names in the plural. */
  manyWorkplaceManagers: boolean;
  /** Each person once, for the acknowledgement tables. */
  designated: Pick<Person, 'name' | 'jobTitle'>[];
  workplaces: FireWorkplaceContext[];
  hasExteriorHydrants: boolean;
  /** Some active workplace has a CO₂ or clean-agent extinguisher, which is weighed. */
  hasGasExtinguishers: boolean;
  /** Other firms work on the client's premises, which decision 9 controls quarterly. */
  hasThirdParties: boolean;
  smoking: {
    policy: FireSmokingPolicy;
    forbiddenEverywhere: boolean;
    designatedPlaces: boolean;
    /** Null where the client names no place, and always where smoking is forbidden. */
    place: string | null;
  };
  /** `collectors` null where decision 7 names the workers on duty. */
  waste: { kinds: string[]; contractor: string | null; collectors: string | null };
  /** The schedules 5.4, a block per active workplace in the order of `workplaces`. */
  schedules: FireScheduleContext[];
  /** The site sheet 7.1 (ADR 020): every row of OMAI 89/2013 annex 4, filled or a gap. */
  siteSheet: SiteSheetContext;
  /**
   * The annual report 7.2 for its period (ADR 020), only in a dated document's data: it reads
   * the set's documents, which would otherwise mark every draft changed when one is issued.
   */
  annualReport?: AnnualReportContext;
  /** The list 5.3: the declaration with `none`, a block per entry with `listed`. */
  substances: {
    state: 'none' | 'listed';
    none: boolean;
    listed: boolean;
    entries: FireSubstanceContext[];
  };
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
  fireSafetyTechnician: {
    name: string;
    certificate: string;
    /** The inspectorate's authorization of the provider; null when not set. */
    authorization: string | null;
  };
  fire: FireContext;
  /**
   * Whether the set holds each document required from ten employees (ADR 020): the covers list
   * it, and decision 6 cites decision 9. One that exists stays in the set below ten.
   */
  seasonsDecision: boolean;
  controlDecision: boolean;
  installationRegister: boolean;
  /**
   * The fire-safety modules the positions apply, each once, in group and title order: what the
   * own instructions 2.1 annex (ADR 012, amendment of 2026-10-11). Top level, as in the other
   * set, so only the document that prints them holds them in its snapshot.
   */
  annexes: AnnexContext[];
  noAnnexes: boolean;
  /**
   * Absent without a generated IPSU, whose annexes the themes cite (ADR 012, amendment of
   * 2026-10-11).
   */
  fireThemes?: FireThemesContext;
};

export type FireSafetySetFacts = Pick<
  DocumentFacts,
  | 'issueDate'
  | 'period'
  | 'currentEmployeeCount'
  | 'firstDecisionNumber'
  | 'branding'
  | 'organization'
  | 'client'
  | 'workplaces'
  | 'responsiblePersons'
  | 'jobPositions'
  | 'fireSafety'
  | 'fireOwnInstructions'
>;

const filled = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const requiredWorkplaceFacts = [
  'activity',
  'assemblyPoint',
  'combustibleMaterials',
  'ignitionSources',
  'fireRiskEquipment',
] as const satisfies readonly (keyof FireWorkplaceFacts)[];

const workplaceComplete = (workplace: FireWorkplaceFacts) =>
  requiredWorkplaceFacts.every((name) => filled(workplace[name])) &&
  (!workplaceHasAreaAndNorm(workplace.kind) ||
    (workplace.floorAreaM2 !== null && workplace.extinguisherNorm !== null));

/** With a type, what generating that one document again also needs. */
export function missingFireSafetyData(
  facts: Omit<FireSafetySetFacts, 'issueDate' | 'period' | 'firstDecisionNumber' | 'branding'>,
  typeKey?: string
): FireSafetyMissingData[] {
  const { card } = facts.fireSafety;
  const held = new Set(facts.responsiblePersons.flatMap((person) => person.roles));
  const present: Record<FireSafetyMissingData, boolean> = {
    'provider.legalName': filled(facts.organization.legalName),
    'provider.fireSafetyTechnician': filled(facts.organization.fireSafetyTechnicianName),
    'provider.fireSafetyTechnicianCertificate': filled(
      facts.organization.fireSafetyTechnicianCertificate
    ),
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
    'fire.smokingPolicy': card?.smokingPolicy != null,
    'fire.waste': (card?.wasteKinds ?? []).some(filled),
    'responsible.workplace_manager': held.has('workplace_manager'),
    'responsible.fire_safety_coordinator': held.has('fire_safety_coordinator'),
    'responsible.fire_intervention_leader': held.has('fire_intervention_leader'),
    'positions.any': facts.jobPositions.length > 0,
    'fire.instructions': facts.jobPositions.every(
      (position) => position.needsFireInstructions !== null
    ),
    // The means list and the posted sheet print one block per workplace: none prints nothing.
    'fire.workplaces': facts.workplaces.length > 0 && facts.workplaces.every(workplaceComplete),
    'fire.equipment': facts.workplaces.every((workplace) =>
      facts.fireSafety.equipment.some(
        (unit) => unit.workplaceId === workplace.id && unit.kind === 'extinguisher'
      )
    ),
    'fire.substances':
      facts.fireSafety.substances.state === 'none' ||
      (facts.fireSafety.substances.state === 'listed' &&
        facts.fireSafety.substances.entries.length > 0),
    'documents.fire_own_instructions':
      typeKey !== 'fire_training_themes' || facts.fireOwnInstructions !== null,
  };
  return fireSafetyMissingDocumentData.filter((code) => !present[code]);
}

const printedAs: Record<FireSafetyMissingData, readonly (keyof FireSafetyContext)[]> = {
  'provider.legalName': ['provider'],
  'provider.fireSafetyTechnician': ['fireSafetyTechnician'],
  'provider.fireSafetyTechnicianCertificate': ['fireSafetyTechnician'],
  'client.representativeName': ['client'],
  'client.representativeRole': ['client'],
  'fire.trainingSchedule': ['fire', 'fireThemes'],
  'fire.smokingPolicy': ['fire'],
  'fire.waste': ['fire'],
  'responsible.workplace_manager': ['fire', 'fireThemes'],
  'responsible.fire_safety_coordinator': ['fire'],
  'responsible.fire_intervention_leader': ['fire'],
  'positions.any': ['fire', 'fireThemes'],
  'fire.instructions': ['annexes', 'noAnnexes', 'fireThemes'],
  'fire.workplaces': ['fire'],
  'fire.equipment': ['fire'],
  'fire.substances': ['fire'],
  'documents.fire_own_instructions': ['fireThemes'],
};

/** Whether a gap is in a name the document printed, which its snapshot keeps. */
export function fireSafetyGapConcerns(code: string, printedNames: readonly string[]) {
  const names = printedAs[code as FireSafetyMissingData];
  return names === undefined || names.some((name) => printedNames.includes(name));
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
  return fireSafetyContextWithout(facts, []) as FireSafetyContext;
}

/**
 * The data one fire-safety document is merged with when it is generated again: what the gaps of
 * `missingFireSafetyData` cover is left out rather than left blank, so a template that prints
 * any of it has no value for it.
 */
export function buildPartialFireSafetyContext(
  facts: FireSafetySetFacts,
  typeKey?: string
): Partial<FireSafetyContext> {
  return fireSafetyContextWithout(facts, missingFireSafetyData(facts, typeKey));
}

function fireSafetyContextWithout(
  facts: FireSafetySetFacts,
  gaps: readonly FireSafetyMissingData[]
): Partial<FireSafetyContext> {
  const leftOut = new Set(gaps.flatMap((code) => printedAs[code]));
  return Object.fromEntries(
    Object.entries(fireSafetyContextParts(facts)).flatMap(([name, part]) => {
      if (leftOut.has(name as keyof FireSafetyContext)) return [];
      const value = part();
      return value === undefined ? [] : [[name, value]];
    })
  );
}

// A part is only called when no gap leaves it out, which is what makes its `!` safe.
function fireSafetyContextParts(facts: FireSafetySetFacts): {
  [Name in keyof FireSafetyContext]-?: () => FireSafetyContext[Name];
} {
  const { organization, client } = facts;
  const inSet = (typeKey: FireSafetyTypeKeyFromTenEmployees) =>
    documentApplies(facts, typeKey) || facts.fireSafety.generatedFromTenEmployees.includes(typeKey);
  return {
    branding: () => facts.branding,
    issueDate: () => printedDate(facts.issueDate),
    client: () => ({
      legalName: client.legalName.trim(),
      representativeName: client.representativeName!.trim(),
      representativeRole: client.representativeRole!.trim(),
    }),
    provider: () => ({
      legalName: organization.legalName!.trim(),
      representativeName: organization.representativeName?.trim() ?? '',
      representativeRole: organization.representativeRole?.trim() ?? '',
    }),
    fireSafetyTechnician: () => ({
      name: organization.fireSafetyTechnicianName!.trim(),
      certificate: organization.fireSafetyTechnicianCertificate!.trim(),
      authorization: organization.fireSafetyAuthorization?.trim() || null,
    }),
    fire: () => fireContext(facts, inSet),
    seasonsDecision: () => inSet('fire_decision_seasons'),
    controlDecision: () => inSet('fire_decision_control'),
    installationRegister: () => inSet('fire_installation_register'),
    annexes: () => annexedModules(facts, 'psi'),
    noAnnexes: () => annexedModules(facts, 'psi').length === 0,
    fireThemes: () => fireThemes(facts),
  };
}

function fireContext(
  facts: FireSafetySetFacts,
  inSet: (typeKey: FireSafetyTypeKeyFromTenEmployees) => boolean
): FireContext {
  const card = facts.fireSafety.card!;
  const asPerson = (person: DocumentFacts['responsiblePersons'][number]): Person => ({
    name: person.fullName.trim(),
    jobTitle: person.jobTitle.trim(),
    jobTitleRunOn: runOn(person.jobTitle.trim()),
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
  const designated: FireContext['designated'] = [];
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

  const activeWorkplaceIds = new Set(facts.workplaces.map((workplace) => workplace.id));
  const managerNames: string[] = [];
  for (const { name } of workplaceManagers) {
    if (!managerNames.some((each) => samePersonName(each, name))) managerNames.push(name);
  }

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
    const leaders = holding('fire_intervention_leader');
    const leaderHere =
      leaders.find((person) => person.workplaceId === workplace.id) ??
      (manager ? null : leaders.find((person) => person.workplaceId === null));
    const interventionLeaderName = leaderHere
      ? asPerson(leaderHere).name
      : (manager?.name ?? interventionLeader.name);
    const hasAreaAndNorm = workplaceHasAreaAndNorm(workplace.kind);
    const norm = hasAreaAndNorm ? fireExtinguisherNormLabels[workplace.extinguisherNorm!] : null;
    const extinguishers = extinguisherGroups(units);
    return {
      first: index === 0,
      name: workplace.name.trim(),
      activity: workplace.activity!.trim(),
      activityRunOn: runOn(workplace.activity!.trim()),
      address: printedAddress(workplace) || '—',
      areaLabel: hasAreaAndNorm ? `${workplace.floorAreaM2!}\u00a0m²` : '—',
      normLabel: norm?.rate
        ? `${norm.label} (${norm.rate})`
        : workplace.extinguisherNorm === 'none' && hasAreaAndNorm
          ? 'fără normă din anexa 6'
          : '—',
      assemblyPoint: workplace.assemblyPoint!.trim(),
      combustibleMaterials: withoutFinalStop(workplace.combustibleMaterials!.trim()),
      ignitionSources: withoutFinalStop(workplace.ignitionSources!.trim()),
      fireRiskEquipment: withoutFinalStop(workplace.fireRiskEquipment!.trim()),
      specificMeasures: workplace.specificMeasures?.trim() ?? '',
      specificMeasuresRunOn: runOn(workplace.specificMeasures?.trim() ?? ''),
      extinguishers,
      extinguisherCount: extinguishers.reduce((total, group) => total + group.count, 0),
      otherEquipment: otherEquipmentGroups(units),
      installations: installations.map((installation) =>
        installationParts(installation.kind, installation.description)
      ),
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
    representativeRoleRunOn: runOn(facts.client.representativeRole?.trim() ?? ''),
    schedule: {
      periodicHours: card.periodicTrainingHours!,
      periodicLabel: countOf(card.periodicTrainingHours!, 'oră', 'ore').replace(' ', '\u00a0'),
      administrativeIntervalMonths: card.administrativeTrainingIntervalMonths!,
      administrativeIntervalLabel: countOf(
        card.administrativeTrainingIntervalMonths!,
        'lună',
        'luni'
      ),
      administrativeMonths: months(
        card.trainingFirstMonth!,
        card.administrativeTrainingIntervalMonths!
      ),
      workerIntervalMonths: card.workerTrainingIntervalMonths!,
      workerIntervalLabel: countOf(card.workerTrainingIntervalMonths!, 'lună', 'luni'),
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
    manyWorkplaceManagers: workplaceManagers.length > 1,
    designated,
    workplaces,
    hasExteriorHydrants: workplaces.some((workplace) => workplace.hasExteriorHydrants),
    hasGasExtinguishers: facts.fireSafety.equipment.some(
      (unit) =>
        activeWorkplaceIds.has(unit.workplaceId) &&
        unit.kind === 'extinguisher' &&
        (unit.agent === 'co2' || unit.agent === 'clean_agent')
    ),
    hasThirdParties: card.hasThirdParties,
    smoking: {
      policy: card.smokingPolicy!,
      forbiddenEverywhere: card.smokingPolicy === 'forbidden_everywhere',
      designatedPlaces: card.smokingPolicy === 'designated_places',
      place: card.smokingPolicy === 'designated_places' ? card.smokingPlace?.trim() || null : null,
    },
    waste: {
      kinds: card.wasteKinds.map((kind) => kind.trim()).filter(Boolean),
      contractor: card.wasteContractor?.trim() || null,
      collectors: card.wasteCollectors?.trim() || null,
    },
    substances: fireSubstances(facts.fireSafety.substances),
    ...(facts.period === null
      ? {}
      : {
          annualReport: buildAnnualReport({
            facts,
            year: facts.period,
            coordinator,
            interventionLeader,
            workplaceManagerNames: managerNames,
            representativeRole: facts.client.representativeRole?.trim() ?? '',
            inSet,
          }),
        }),
    siteSheet: buildSiteSheet({
      facts,
      decisionNumbers,
      coordinatorName: coordinator.name,
      interventionLeaderName: interventionLeader.name,
      workplaceManagerNames: managerNames,
      inSet,
    }),
    schedules: facts.workplaces.map((workplace) =>
      fireSchedule({
        name: workplace.name.trim(),
        activity: workplace.activity!.trim(),
        equipment: facts.fireSafety.equipment.filter((unit) => unit.workplaceId === workplace.id),
        installations: facts.fireSafety.installations.filter(
          (installation) => installation.workplaceId === workplace.id
        ),
        items: facts.fireSafety.maintenanceItems.filter(
          (item) => item.workplaceId === workplace.id
        ),
        coordinatorName: coordinator.name,
      })
    ),
  };
}

const printedOrGap = (text: string | null) => text?.trim() || unfilledMark;

function fireSubstances({
  state,
  entries,
}: FireSafetyClientFacts['substances']): FireContext['substances'] {
  const listed = state === 'listed';
  return {
    state: listed ? 'listed' : 'none',
    none: !listed,
    listed,
    entries: listed
      ? entries.map((entry) => ({
          name: entry.name.trim(),
          classification: entry.classification.trim(),
          quantity: entry.quantity.trim(),
          ...(Object.fromEntries(
            fireSubstanceDetails.map((detail) => [detail, printedOrGap(entry[detail])])
          ) as Record<FireSubstanceDetail, string>),
        }))
      : [],
  };
}

const producerTerms = 'conform instrucțiunilor producătorului';
const attestedFirm = 'firmă atestată';

/** "anual", "la 6 luni", "la 2 ani": the interval between two checks, or null under a month. */
function checkInterval(lastOn: string, nextOn: string) {
  const days = (Date.parse(nextOn) - Date.parse(lastOn)) / 86_400_000;
  const months = Math.round(days / (365.25 / 12));
  if (months < 1) return null;
  if (months === 1) return 'lunar';
  if (months === 12) return 'anual';
  return months % 12 === 0
    ? `la ${countOf(months / 12, 'an', 'ani')}`
    : `la ${countOf(months, 'lună', 'luni')}`;
}

const firmsOf = (names: readonly (string | null)[]) => {
  const firms: string[] = [];
  for (const name of names) {
    const firm = name?.trim();
    if (
      firm &&
      !firms.some((each) => each.toLocaleLowerCase('ro') === firm.toLocaleLowerCase('ro'))
    ) {
      firms.push(firm);
    }
  }
  return firms.length > 0 ? listed(firms) : attestedFirm;
};

// Grouped as the list of means groups them, keeping each unit's service facts.
function scheduledExtinguishers(units: FireSafetyClientFacts['equipment']) {
  const groups = new Map<
    string,
    { label: string; gas: boolean; units: FireSafetyClientFacts['equipment'] }
  >();
  const extinguishers = units
    .filter((unit) => unit.kind === 'extinguisher' && unit.agent !== null && unit.capacity !== null)
    .sort(
      (a, b) =>
        fireExtinguishingAgents.indexOf(a.agent!) - fireExtinguishingAgents.indexOf(b.agent!) ||
        Number(a.wheeled) - Number(b.wheeled) ||
        a.capacity! - b.capacity!
    );
  for (const unit of extinguishers) {
    const key = `${unit.agent}|${unit.capacity}|${unit.wheeled}`;
    const group = groups.get(key) ?? {
      label: `${extinguisherCode(unit.agent!, unit.capacity!)}${unit.wheeled ? ' carosabil' : ''}`,
      gas: unit.agent === 'co2' || unit.agent === 'clean_agent',
      units: [],
    };
    group.units.push(unit);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function fireSchedule({
  name,
  activity,
  equipment,
  installations,
  items,
  coordinatorName,
}: {
  name: string;
  activity: string;
  equipment: FireSafetyClientFacts['equipment'];
  installations: FireSafetyClientFacts['installations'];
  items: FireSafetyClientFacts['maintenanceItems'];
  coordinatorName: string;
}): FireScheduleContext {
  const groups = scheduledExtinguishers(equipment);
  const counted = (list: typeof groups) =>
    list.map((group) => `${group.label} – ${group.units.length}\u00a0buc.`).join(', ');
  // Decision 9 has the coordinator check every extinguisher and weigh the gas ones (OMAI 135/2023 art. 8).
  const checker = `${coordinatorName}, coordonatorul privind apărarea împotriva incendiilor, cu cadrul tehnic, după caz`;
  const gasGroups = groups.filter((group) => group.gas);
  const extinguisherRows: FireScheduleRow[] =
    groups.length === 0
      ? []
      : [
          {
            what: `Controlul fiecărui stingător de incendiu (${counted(groups)})`,
            interval: 'lunar',
            who: checker,
            basis:
              'OMAI 135/2023 – art. 8; rezultatele se înscriu în registrul de evidență a controlului stingătoarelor',
          },
          ...(gasGroups.length > 0
            ? [
                {
                  what: `Verificarea prin cântărire a stingătoarelor cu CO₂ sau agent curat (${counted(gasGroups)})`,
                  interval: 'la cel mult 6 luni, în iunie și decembrie',
                  who: checker,
                  basis: 'OMAI 135/2023 – art. 8 alin. (3)',
                },
              ]
            : []),
          ...groups.map((group) => {
            const dates = [
              ...new Set(
                group.units.flatMap((unit) => (unit.nextServiceOn ? [unit.nextServiceOn] : []))
              ),
            ]
              .sort()
              .map(printedDate);
            return {
              what: `Verificarea stingătoarelor de către o firmă atestată (${counted([group])})`,
              interval: 'anual',
              who: firmsOf(group.units.map((unit) => unit.maintainer)),
              basis: `OMAI 135/2023 – art. 9; ${dates.length > 0 ? `următorul service: ${listed(dates)}` : producerTerms}`,
            };
          }),
          {
            what: `Reîncărcarea stingătoarelor (${counted(groups)})`,
            interval: 'la termenul producătorului',
            who: firmsOf(groups.flatMap((group) => group.units.map((unit) => unit.maintainer))),
            basis: 'OMAI 135/2023 – art. 12',
          },
        ];
  const installationRows = installations.map((installation): FireScheduleRow => {
    const interval =
      installation.lastCheckOn && installation.nextCheckOn
        ? checkInterval(installation.lastCheckOn, installation.nextCheckOn)
        : null;
    return {
      what: installationText(installation.kind, installation.description),
      interval: interval ?? producerTerms,
      who: firmsOf([installation.maintainer]),
      basis: installation.nextCheckOn
        ? `următoarea verificare: ${printedDate(installation.nextCheckOn)}`
        : '—',
    };
  });
  const rows = [
    ...extinguisherRows,
    ...installationRows,
    ...items.map((item) => ({
      what: item.subject.trim(),
      interval: item.intervalLabel.trim(),
      who: item.checkedBy.trim(),
      basis: '—',
    })),
  ];
  return { name, activity, rows, hasRows: rows.length > 0, empty: rows.length === 0 };
}

const staffCategoryLabels: Record<StaffCategory, string> = {
  technical_administrative: 'Personal administrativ',
  execution: 'Personal de execuție',
};

// A file without a numbered list counts no articles, and "art. 1–0" would cite nothing.
const fireModuleCitation = ({ title, articleCount }: { title: string; articleCount: number }) =>
  articleCount > 0 ? `I.P.S.U. ${title}, art.\u00a01–${articleCount}` : `I.P.S.U. ${title}`;

/**
 * A staff category's sessions cite the fire-safety modules its posts apply, each whole, as the
 * newest IPSU revision annexes them, naming the posts that apply a module when others in the
 * category do not; a module the revision does not annex waits for the IPSU to be generated again
 * (ADR 014, ADR 012 amendment of 2026-10-11).
 */
function fireThemes(facts: FireSafetySetFacts): FireThemesContext | undefined {
  const ipsu = facts.fireOwnInstructions;
  if (!ipsu) return undefined;
  const card = facts.fireSafety.card!;
  const intervalMonths: Record<StaffCategory, number> = {
    technical_administrative: card.administrativeTrainingIntervalMonths!,
    execution: card.workerTrainingIntervalMonths!,
  };
  const firstMonth = card.trainingFirstMonth!;
  const periodicMinutes = card.periodicTrainingHours! * 60;
  const instructionsDecision = `${facts.firstDecisionNumber + fireDecisionOrdinals.instructions - 1} PSI`;
  const managerNames: string[] = [];
  for (const person of facts.responsiblePersons) {
    const name = person.fullName.trim();
    if (
      person.roles.includes('workplace_manager') &&
      !managerNames.some((each) => samePersonName(each, name))
    ) {
      managerNames.push(name);
    }
  }
  // The line runs on after the title ("… sau, după caz, …"), where glued words only break it early.
  const managers = workplaceManagersTrainer(managerNames, ' ');
  return {
    ownInstructionsRevision: {
      id: ipsu.revisionId,
      number: ipsu.revisionNumber,
      // A draft generated again keeps its id; new module versions still date the themes.
      versionIds: ipsu.annexes.map((annex) => annex.versionId),
    },
    workplaceNames: [...facts.workplaces]
      .sort(
        (a, b) =>
          Number(b.registeredOffice) - Number(a.registeredOffice) ||
          collator.compare(a.name, b.name)
      )
      .map((workplace) => workplace.name.trim())
      .join(', '),
    categories: (['technical_administrative', 'execution'] as const).flatMap((category) => {
      const positions = facts.jobPositions.filter(
        (position) => position.staffCategory === category
      );
      if (positions.length === 0) return [];
      const posts = positions.map((position) => position.name.trim());
      const applying = (moduleId: string) =>
        positions.filter((position) =>
          position.instructions.some(
            (module) => module.domain === 'psi' && module.moduleId === moduleId
          )
        );
      const modules = ipsu.annexes.flatMap((annex) => {
        const appliedBy = applying(annex.moduleId);
        if (appliedBy.length === 0) return [];
        const citation = fireModuleCitation({ ...annex, title: annex.title.trim() });
        return [
          appliedBy.length === positions.length
            ? citation
            : `${citation} (${appliedBy.map((position) => position.name.trim()).join(', ')})`,
        ];
      });
      const execution = category === 'execution';
      const sessionMonths = trainingMonths(firstMonth, intervalMonths[category]);
      const ranges = dealChapters(fireOwnInstructionsChapters, sessionMonths.length);
      return [
        {
          staffCategory: category,
          label: staffCategoryLabels[category],
          posts,
          postsText: posts.join(', '),
          workplaceTrainers: {
            workplaceManagers: execution ? managers : null,
            technician: !execution,
          },
          // Decision 2 has the heads of the workplaces give the periodic training "și, după caz",
          // the technician, who alone trains the heads themselves.
          periodicTrainers: { workplaceManagers: execution ? managers : null, technician: true },
          intervalLabel: themeIntervalLabel(intervalMonths[category]),
          sessions: sessionMonths.map((month, index) => {
            const range = ranges[index]!;
            return {
              month: monthNames[month - 1]!.toLocaleUpperCase('ro'),
              content: [
                `IPSU art.\u00a0${range.from}–${range.to}`,
                ...modules,
                `instrucțiunile afișate la locul de muncă (Decizia nr.\u00a0${instructionsDecision})`,
                'organizarea apărării împotriva incendiilor la locul de muncă',
                ...(index === sessionMonths.length - 1 ? ['testare.'] : []),
              ].join('; '),
              duration: `${periodicMinutes} min`,
            };
          }),
        },
      ];
    }),
  };
}
