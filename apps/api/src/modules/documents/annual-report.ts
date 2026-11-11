import {
  type FireDecision,
  fireDecisionTypeKeys,
  fireExtinguishingAgentLabels,
  fireInstallationKindLabels,
  fireInstallationKinds,
  fireSafetyDocumentTitles,
  fireSafetyDocumentTypeKeys,
  type FireSafetyTypeKeyFromTenEmployees,
  isDatedDocumentType,
  type KnowledgeTest,
  knowledgeTestLabels,
  knowledgeTestsByDomain,
  trainingMonths,
  type TrainingPhase,
  trainingPhases,
} from '@ssm-usor/contracts';

import { printedAddress } from '../../lib/address';
import { countOf, definiteRole, listed, runOn } from '../../lib/romanian';
import { documentApplies, printedDate } from './context';
import { extinguisherGroups, otherEquipmentGroups } from './equipment';
import type {
  FireNamedPeople,
  FireSafetyClientFacts,
  FireSafetySetFacts,
  FireStaffCategory,
} from './fire-safety';
import { descriptionNamesKind, installationText } from './installations';
import { monthNames } from './themes';

type MeansRow = { what: string; quantity: string; next: string };

/**
 * The annual evaluation report 7.2 (ADR 020): what the app holds about the year, the rest left
 * to the technician as gaps the template prints itself.
 */
export type AnnualReportContext = {
  year: number;
  /** The year its measures are proposed for. */
  nextYear: number;
  /** The decisions of the set, in the binder's order: "nr. 4 SU din 19.01.2026". */
  decisions: { title: string; reference: string }[];
  /** Each revision of a decision issued in the year, in the binder's order. */
  yearDecisions: { text: string }[];
  hasYearDecisions: boolean;
  noYearDecisions: boolean;
  /** "Ion VLAD, Șef magazin". */
  coordinator: string;
  interventionLeader: string;
  /** "Ion POP și Ana RUS". */
  workplaceManagers: string;
  /** One per staff category with current posts. */
  staff: { label: string; posts: string; headcount: string }[];
  /** "12 angajați", the client's current count. */
  headcount: string;
  /** One per active workplace, in the order of the workplaces. */
  workplaces: { name: string; place: string; rows: MeansRow[] }[];
  /** "2 ore". */
  periodicLabel: string;
  training: { label: string; posts: string; interval: string; months: string }[];
  /** Empty without a training held in the year. */
  trainingRecords: { text: string }[];
  noTrainingRecords: boolean;
  /** Decision 9's plan; empty while the set does not hold it. */
  controls: { who: string; interval: string; scope: string }[];
  hasControls: boolean;
  noControls: boolean;
  /** Every document of the set but the covers and the dated ones, in the binder's order. */
  documents: { title: string; state: string }[];
  missingCount: number;
  allGenerated: boolean;
  /** The sentence under the table, true to the states it lists. */
  documentsSummary: string;
};

export type AnnualReportInput = {
  facts: FireSafetySetFacts;
  year: number;
  people: FireNamedPeople;
  representativeRole: string;
  staffCategories: readonly FireStaffCategory[];
  periodicLabel: string;
  hasGasExtinguishers: boolean;
  inSet: (typeKey: FireSafetyTypeKeyFromTenEmployees) => boolean;
};

type Unit = FireSafetyClientFacts['equipment'][number];
type Installation = FireSafetyClientFacts['installations'][number];
type StoredDocument = FireSafetyClientFacts['documents'][number];

const datesOf = (dates: readonly (string | null)[]) => {
  const unique = [...new Set(dates.filter((date): date is string => date !== null))].sort();
  return unique.length > 0 ? unique.map(printedDate).join(', ') : '—';
};

function extinguisherRows(units: readonly Unit[]): MeansRow[] {
  return extinguisherGroups(units).map((group) => ({
    what: `Stingător ${group.label} – ${runOn(fireExtinguishingAgentLabels[group.agent])}, ${group.capacityLabel}`,
    quantity: `${group.units.length}\u00a0buc.`,
    next: datesOf(group.units.map((unit) => unit.nextServiceOn)),
  }));
}

function otherEquipmentRows(units: readonly Unit[]): MeansRow[] {
  return otherEquipmentGroups(units).map((group) => ({
    what: group.label,
    quantity: `${group.units.length}\u00a0buc.`,
    next: datesOf(group.units.map((unit) => unit.nextServiceOn)),
  }));
}

function installationRows(installations: readonly Installation[]): MeansRow[] {
  return fireInstallationKinds.flatMap((kind) => {
    const found = installations.filter((installation) => installation.kind === kind);
    if (found.length === 0) return [];
    const descriptions = found.flatMap((installation) =>
      installation.description?.trim() ? [installation.description.trim()] : []
    );
    const what =
      descriptions.length === 1
        ? installationText(kind, descriptions[0]!)
        : [
            ...(kind === 'other' || descriptions.some((each) => descriptionNamesKind(kind, each))
              ? []
              : [fireInstallationKindLabels[kind]]),
            ...descriptions,
          ].join(' – ');
    return [
      {
        what,
        quantity: countOf(found.length, 'instalație', 'instalații'),
        next: datesOf(found.map((installation) => installation.nextCheckOn)),
      },
    ];
  });
}

function revisionState(
  label: string,
  revision: { revision: number; issueDate: string | null } | null
) {
  if (!revision) return null;
  const date = revision.issueDate ? ` din ${printedDate(revision.issueDate)}` : '';
  return `${label}, rev.\u00a0${revision.revision}${date}`;
}

const documentState = (document: StoredDocument | undefined) =>
  document
    ? [revisionState('emis', document.issued), revisionState('ciornă', document.draft)]
        .filter(Boolean)
        .join('; ')
    : 'negenerat';

const decisionOrder = Object.entries(fireDecisionTypeKeys) as [FireDecision, string][];

function yearDecisions(stored: ReadonlyMap<string, StoredDocument>, year: number) {
  return decisionOrder.flatMap(([, typeKey]) => {
    const document = stored.get(typeKey);
    if (!document) return [];
    return document.issuedRevisions
      .filter((revision) => (revision.issueDate ?? revision.issuedOn).startsWith(`${year}-`))
      .sort((a, b) => a.revision - b.revision)
      .map((revision) => ({
        text: [
          document.title,
          [
            document.decisionNumber !== null && `nr.\u00a0${document.decisionNumber}\u00a0SU`,
            revision.issueDate && `din ${printedDate(revision.issueDate)}`,
          ]
            .filter(Boolean)
            .join(' '),
          revision.revision > 1 && `revizia ${revision.revision}`,
        ]
          .filter(Boolean)
          .join(', '),
      }));
  });
}

const phaseNouns: Record<TrainingPhase, readonly [one: string, many: string]> = {
  introductory_general: ['instructaj introductiv general', 'instructaje introductive generale'],
  workplace: ['instructaj specific locului de muncă', 'instructaje specifice locului de muncă'],
  periodic: ['instructaj periodic', 'instructaje periodice'],
  supplementary: ['instructaj suplimentar', 'instructaje suplimentare'],
};

const employeesCounted = (count: number) => countOf(count, 'angajat', 'angajați');

function passedPhrase(took: number, passed: number) {
  if (took === 1) return passed === 1 ? 'care l-a promovat' : 'care nu l-a promovat';
  if (passed === took) return 'care l-au promovat toți';
  if (passed === 0) return 'dintre care niciunul nu l-a promovat';
  if (passed === 1) return 'dintre care unul l-a promovat';
  return `dintre care ${passed} l-au promovat`;
}

// Empty without a training held in the year: a provider who keeps the trainings on paper must
// not get a report that understates them, so the row stays a gap.
function trainingRecords(
  trainings: FireSafetyClientFacts['trainings'],
  tests: FireSafetyClientFacts['tests'],
  year: number
): { text: string }[] {
  const inYear = (day: string) => day.startsWith(`${year}-`);
  const held = trainings.filter((training) => inYear(training.heldOn));
  if (held.length === 0) return [];

  const phases = trainingPhases.flatMap((phase: TrainingPhase) => {
    const ofPhase = held.filter((training) => training.phase === phase);
    if (ofPhase.length === 0) return [];
    const [one, many] = phaseNouns[phase];
    const participants = new Set(ofPhase.flatMap((training) => training.employeeIds)).size;
    const months = [...new Set(ofPhase.map((training) => Number(training.heldOn.slice(5, 7))))]
      .sort((a, b) => a - b)
      .map((month) => monthNames[month - 1]!);
    return [
      [
        countOf(ofPhase.length, one, many),
        phase === 'periodic' && `în ${months.length === 1 ? 'luna' : 'lunile'} ${listed(months)}`,
        `la care ${participants === 1 ? 'a participat' : 'au participat'} ${employeesCounted(participants)}`,
      ]
        .filter(Boolean)
        .join(', '),
    ];
  });
  const done = held.length === 1 ? 's-a efectuat' : 's-au efectuat';
  const trainingsText = `Potrivit evidenței instruirilor, în anul ${year} ${done}: ${phases.join('; ')}.`;

  const taken = tests.filter((test) => inYear(test.takenOn));
  const testParts = knowledgeTestsByDomain.su.flatMap((test: KnowledgeTest) => {
    const ofTest = taken.filter((each) => each.test === test);
    if (ofTest.length === 0) return [];
    const took = new Set(ofTest.map((each) => each.employeeId)).size;
    const passed = new Set(ofTest.filter((each) => each.passed).map((each) => each.employeeId))
      .size;
    return [
      `${runOn(knowledgeTestLabels[test])} a fost susținut de ${employeesCounted(took)}, ${passedPhrase(took, passed)}`,
    ];
  });
  return [
    { text: trainingsText },
    ...(testParts.length > 0 ? [{ text: `În același an, ${testParts.join(', iar ')}.` }] : []),
  ];
}

export function buildAnnualReport({
  facts,
  year,
  people,
  representativeRole,
  staffCategories,
  periodicLabel,
  hasGasExtinguishers,
  inSet,
}: AnnualReportInput): AnnualReportContext {
  const card = facts.fireSafety.card!;
  const stored = new Map(
    facts.fireSafety.documents
      .filter((document) => !isDatedDocumentType(document.typeKey))
      .map((document) => [document.typeKey, document])
  );
  const issueDateOf = (document: StoredDocument) =>
    (document.issued ?? document.draft)?.issueDate ?? null;

  const decisions = decisionOrder.flatMap(([, typeKey]) => {
    const document = stored.get(typeKey);
    if (!document) return [];
    const date = issueDateOf(document);
    return [
      {
        title: document.title,
        reference: [
          document.decisionNumber !== null && `nr.\u00a0${document.decisionNumber}\u00a0SU`,
          date && `din ${printedDate(date)}`,
        ]
          .filter(Boolean)
          .join(' '),
      },
    ];
  });

  const issuedInYear = yearDecisions(stored, year);
  const records = trainingRecords(facts.fireSafety.trainings, facts.fireSafety.tests, year);

  const workplaces = facts.workplaces.map((workplace) => {
    const units = facts.fireSafety.equipment.filter((unit) => unit.workplaceId === workplace.id);
    const installations = facts.fireSafety.installations.filter(
      (installation) => installation.workplaceId === workplace.id
    );
    const address = printedAddress(workplace);
    return {
      name: workplace.name.trim(),
      place: address ? `${workplace.name.trim()}, ${address}` : workplace.name.trim(),
      rows: [
        ...extinguisherRows(units),
        ...otherEquipmentRows(units),
        ...installationRows(installations),
      ],
    };
  });

  const controls = inSet('fire_decision_control')
    ? [
        {
          who: 'Coordonatorul privind apărarea împotriva incendiilor și cadrul tehnic',
          interval: 'trimestrial: martie, iunie, septembrie, decembrie',
          scope: 'pe tot perimetrul',
        },
        ...(card.hasThirdParties
          ? [
              {
                who: 'Coordonatorul privind apărarea împotriva incendiilor și cadrul tehnic',
                interval: 'trimestrial: martie, iunie, septembrie, decembrie',
                scope: 'la persoanele juridice care desfășoară activități în spațiile operatorului',
              },
            ]
          : []),
        {
          who: 'Coordonatorul privind apărarea împotriva incendiilor, cu cadrul tehnic, după caz',
          interval: 'lunar',
          scope: 'fiecare stingător de incendiu',
        },
        ...(hasGasExtinguishers
          ? [
              {
                who: 'Coordonatorul privind apărarea împotriva incendiilor, cu cadrul tehnic, după caz',
                interval: 'la cel mult 6 luni: iunie, decembrie',
                scope: 'stingătoarele cu CO₂ sau agent curat, prin cântărire',
              },
            ]
          : []),
        {
          who: 'Șefii locurilor de muncă',
          interval: 'zilnic sau pe schimb',
          scope: 'locul de muncă condus',
        },
        {
          who: 'Personalul de execuție',
          interval: 'zilnic',
          scope: 'zona de lucru, la terminarea programului',
        },
        {
          who: `${definiteRole(representativeRole) ?? 'Conducerea'}, cu coordonatorul privind apărarea împotriva incendiilor și cadrul tehnic`,
          interval: 'anual: ianuarie',
          scope: 'pe tot perimetrul',
        },
      ]
    : [];

  const listedTypes = fireSafetyDocumentTypeKeys.filter(
    (typeKey) =>
      !typeKey.startsWith('fire_cover_') &&
      !isDatedDocumentType(typeKey) &&
      (stored.has(typeKey) || documentApplies(facts, typeKey))
  );
  const documents = listedTypes.map((typeKey) => {
    const document = stored.get(typeKey);
    return {
      title: document?.title ?? fireSafetyDocumentTitles[typeKey],
      state: documentState(document),
    };
  });
  const missingCount = listedTypes.filter((typeKey) => !stored.has(typeKey)).length;
  const allIssued =
    missingCount === 0 &&
    listedTypes.every((typeKey) => {
      const document = stored.get(typeKey)!;
      return document.issued !== null && document.draft === null;
    });
  const documentsSummary =
    missingCount > 0
      ? `Documente neîntocmite încă: ${missingCount}.`
      : allIssued
        ? 'Toate documentele cerute operatorului sunt emise.'
        : 'Documentele cerute operatorului sunt întocmite; starea fiecăruia este cea din tabel.';

  return {
    year,
    nextYear: year + 1,
    decisions,
    yearDecisions: issuedInYear,
    hasYearDecisions: issuedInYear.length > 0,
    noYearDecisions: issuedInYear.length === 0,
    coordinator: `${people.coordinator.name}, ${people.coordinator.jobTitle}`,
    interventionLeader: `${people.interventionLeader.name}, ${people.interventionLeader.jobTitle}`,
    workplaceManagers: listed(people.managerNames),
    staff: staffCategories.map(({ label, posts, positions }) => ({
      label,
      posts: posts.join(', '),
      headcount: countOf(
        positions.reduce((total, position) => total + position.currentEmployeeCount, 0),
        'angajat',
        'angajați'
      ),
    })),
    headcount: countOf(facts.currentEmployeeCount, 'angajat', 'angajați'),
    workplaces,
    periodicLabel,
    training: staffCategories.map(({ label, posts, intervalMonths }) => ({
      label,
      posts: posts.join(', '),
      interval: `la ${countOf(intervalMonths, 'lună', 'luni')}`,
      months: trainingMonths(card.trainingFirstMonth!, intervalMonths)
        .map((month) => monthNames[month - 1]!)
        .join(', '),
    })),
    trainingRecords: records,
    noTrainingRecords: records.length === 0,
    controls,
    hasControls: controls.length > 0,
    noControls: controls.length === 0,
    documents,
    missingCount,
    allGenerated: missingCount === 0,
    documentsSummary,
  };
}
