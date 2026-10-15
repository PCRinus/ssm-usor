import {
  extinguisherCode,
  type FireDecision,
  fireDecisionTypeKeys,
  fireEquipmentKindLabels,
  fireEquipmentKinds,
  type FireExtinguishingAgent,
  fireExtinguishingAgentLabels,
  fireExtinguishingAgents,
  fireInstallationKindLabels,
  fireInstallationKinds,
  fireSafetyDocumentTitles,
  fireSafetyDocumentTypeKeys,
  type FireSafetyTypeKeyFromTenEmployees,
  isDatedDocumentType,
  type StaffCategory,
  trainingMonths,
} from '@ssm-usor/contracts';

import { printedAddress } from '../../lib/address';
import { countOf, definiteRole, listed, runOn } from '../../lib/romanian';
import { documentApplies, printedDate } from './context';
import type { FireSafetyClientFacts, FireSafetySetFacts } from './fire-safety';
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
  /**
   * The decisions of the set, in the binder's order: "nr. 4 PSI din 19.01.2026", and the mark
   * that ends the item, ";" and "." after the last.
   */
  decisions: { title: string; reference: string; end: ';' | '.' }[];
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
  /** Decision 9's plan; empty while the set does not hold it. */
  controls: { who: string; interval: string; scope: string }[];
  hasControls: boolean;
  noControls: boolean;
  /** Every document of the set but the covers and the dated ones, in the binder's order. */
  documents: { title: string; state: string }[];
  missingCount: number;
  allGenerated: boolean;
  /** Every document generated and none with a draft beside or in place of its issued revision. */
  allIssued: boolean;
  /** The sentence under the table, true to the states it lists. */
  documentsSummary: string;
};

export type AnnualReportInput = {
  facts: FireSafetySetFacts;
  year: number;
  coordinator: { name: string; jobTitle: string };
  interventionLeader: { name: string; jobTitle: string };
  workplaceManagerNames: readonly string[];
  representativeRole: string;
  inSet: (typeKey: FireSafetyTypeKeyFromTenEmployees) => boolean;
};

type Unit = FireSafetyClientFacts['equipment'][number];
type Installation = FireSafetyClientFacts['installations'][number];
type StoredDocument = FireSafetyClientFacts['documents'][number];

const capacityUnits: Record<FireExtinguishingAgent, string> = {
  powder: 'kg',
  co2: 'kg',
  foam: 'l',
  water: 'l',
  clean_agent: 'kg',
};

const staffLabels: Record<StaffCategory, string> = {
  technical_administrative: 'Personal administrativ',
  execution: 'Personal de execuție',
};

const datesOf = (dates: readonly (string | null)[]) => {
  const unique = [...new Set(dates.filter((date): date is string => date !== null))].sort();
  return unique.length > 0 ? unique.map(printedDate).join(', ') : '—';
};

function extinguisherRows(units: readonly Unit[]): MeansRow[] {
  const groups = new Map<string, { what: string; units: Unit[] }>();
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
      what: `Stingător ${extinguisherCode(unit.agent!, unit.capacity!)}${unit.wheeled ? ' carosabil' : ''} – ${runOn(fireExtinguishingAgentLabels[unit.agent!])}, ${unit.capacity}\u00a0${capacityUnits[unit.agent!]}`,
      units: [],
    };
    group.units.push(unit);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    what: group.what,
    quantity: `${group.units.length}\u00a0buc.`,
    next: datesOf(group.units.map((unit) => unit.nextServiceOn)),
  }));
}

function otherEquipmentRows(units: readonly Unit[]): MeansRow[] {
  return fireEquipmentKinds
    .filter((kind) => kind !== 'extinguisher')
    .flatMap((kind) => {
      const found = units.filter((unit) => unit.kind === kind);
      return found.length > 0
        ? [
            {
              what: fireEquipmentKindLabels[kind],
              quantity: `${found.length}\u00a0buc.`,
              next: datesOf(found.map((unit) => unit.nextServiceOn)),
            },
          ]
        : [];
    });
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

export function buildAnnualReport({
  facts,
  year,
  coordinator,
  interventionLeader,
  workplaceManagerNames,
  representativeRole,
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

  const references = decisionOrder.flatMap(([, typeKey]) => {
    const document = stored.get(typeKey);
    if (!document) return [];
    const date = issueDateOf(document);
    return [
      {
        title: document.title,
        reference: [
          document.decisionNumber !== null && `nr.\u00a0${document.decisionNumber}\u00a0PSI`,
          date && `din ${printedDate(date)}`,
        ]
          .filter(Boolean)
          .join(' '),
      },
    ];
  });
  const decisions = references.map((decision, index) => ({
    ...decision,
    end: index === references.length - 1 ? ('.' as const) : (';' as const),
  }));

  const categories = (['technical_administrative', 'execution'] as const).flatMap((category) => {
    const positions = facts.jobPositions.filter((position) => position.staffCategory === category);
    return positions.length > 0 ? [{ category, positions }] : [];
  });
  const intervalOf: Record<StaffCategory, number> = {
    technical_administrative: card.administrativeTrainingIntervalMonths!,
    execution: card.workerTrainingIntervalMonths!,
  };

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
        ...(facts.fireSafety.equipment.some(
          (unit) =>
            facts.workplaces.some((workplace) => workplace.id === unit.workplaceId) &&
            unit.kind === 'extinguisher' &&
            (unit.agent === 'co2' || unit.agent === 'clean_agent')
        )
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
    coordinator: `${coordinator.name}, ${coordinator.jobTitle}`,
    interventionLeader: `${interventionLeader.name}, ${interventionLeader.jobTitle}`,
    workplaceManagers: listed(workplaceManagerNames),
    staff: categories.map(({ category, positions }) => ({
      label: staffLabels[category],
      posts: positions.map((position) => position.name.trim()).join(', '),
      headcount: countOf(
        positions.reduce((total, position) => total + position.currentEmployeeCount, 0),
        'angajat',
        'angajați'
      ),
    })),
    headcount: countOf(facts.currentEmployeeCount, 'angajat', 'angajați'),
    workplaces,
    periodicLabel: countOf(card.periodicTrainingHours!, 'oră', 'ore').replace(' ', '\u00a0'),
    training: categories.map(({ category, positions }) => ({
      label: staffLabels[category],
      posts: positions.map((position) => position.name.trim()).join(', '),
      interval: `la ${countOf(intervalOf[category], 'lună', 'luni')}`,
      months: trainingMonths(card.trainingFirstMonth!, intervalOf[category])
        .map((month) => monthNames[month - 1]!)
        .join(', '),
    })),
    controls,
    hasControls: controls.length > 0,
    noControls: controls.length === 0,
    documents,
    missingCount,
    allGenerated: missingCount === 0,
    allIssued,
    documentsSummary,
  };
}
