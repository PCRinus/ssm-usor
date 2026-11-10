import {
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  Flame,
  HardHat,
  type LucideIcon,
  MapPin,
  UserRound,
} from 'lucide-react';

import type { ImportDetail } from '@/api/generated/api';

import { filesLabel } from './import-format';
import {
  anafMismatch,
  anchorOf,
  appliesAt,
  type Blocker,
  blockerLink,
  type Changes,
  chosenCountOption,
  countName,
  fieldGroups,
  type FieldState,
  fieldState,
  fireEquipmentCountsOf,
  formatFieldValue,
  type ItemList,
  itemName,
  itemStates,
  type Proposal,
  type RegisteredCompany,
  roleLabel,
  type SectionId,
  sectionIds,
  sectionOf,
  sectionStatus,
  smokingPlaceAsked,
  smokingPlaceDecision,
  smokingPlacePath,
  substancesAdded,
  substancesStatePath,
  type UntickedReason,
  valueInForce,
} from './review-model';

export type ExistingValueAt = (path: string) => string | number | null | undefined;

// `registered` is ANAF's company, whose name a new client takes by default.
export function fieldStates(
  proposal: Proposal,
  changes: Changes,
  valueAt: ExistingValueAt,
  registered: RegisteredCompany | null = null
): Record<string, FieldState> {
  const states = Object.fromEntries(
    [...fieldGroups.flatMap((group) => group.paths), substancesStatePath].map((path) => [
      path,
      fieldState(proposal, changes, path, valueAt(path), registered),
    ])
  );
  return states;
}

export const keptPaths = (states: Record<string, FieldState>) =>
  Object.values(states)
    .filter((state) => state.comparison === 'kept')
    .map((state) => state.path);

const included = (proposal: Proposal, changes: Changes, list: ItemList) =>
  itemStates(proposal, changes, list).filter((state) => state.included);

export function smokingRule(states: Record<string, FieldState>, changes: Changes) {
  const policy = valueInForce(states['fireSafety.smokingPolicy']);
  if (policy === 'forbidden_everywhere') return 'Fumatul interzis peste tot';
  if (policy !== 'designated_places') return null;
  const waits =
    smokingPlaceAsked(states) &&
    smokingPlaceDecision(states[smokingPlacePath]!, changes.fields[smokingPlacePath]) === null;
  if (waits) return 'Fumat doar în locurile amenajate';
  const place = String(valueInForce(states[smokingPlacePath]) ?? '')
    .trim()
    .replace(/^[ÎI]n\s+/u, 'în ');
  return place ? `Fumat doar în locurile amenajate: ${place}` : 'Fumat doar în locurile amenajate';
}

const count = (value: number, one: string, many: string) =>
  value === 1 ? `un ${one}` : `${value} ${many}`;

const substancesCount = (value: number) =>
  value === 1 ? 'o substanță periculoasă' : `${value} substanțe periculoase`;

export function sectionDescription(
  section: SectionId,
  detail: ImportDetail,
  proposal: Proposal,
  changes: Changes,
  states: Record<string, FieldState>
): string {
  const leftOut = (list: ItemList, reason: UntickedReason) =>
    itemStates(proposal, changes, list).filter(
      (state) => state.untickedReason === reason && !state.included
    );
  const others = (lists: ItemList[], noun: string) => {
    const left = lists.flatMap((list) => leftOut(list, 'other_company')).length;
    return left === 0
      ? ''
      : ` Alte ${left} ${noun} apar doar în pasaje copiate de la altă firmă și sunt lăsate deoparte.`;
  };
  const choices = Object.values(states).filter(
    (state) =>
      sectionOf(state.path) === section &&
      state.status === 'choice' &&
      appliesAt(states, state.path)
  );
  const choiceText = choices
    .map((state) => ` ${state.label}: ${state.own.length} variante în documente.`)
    .join('');
  switch (section) {
    case 'identity': {
      const registered = detail.registeredCompany;
      const anaf = !registered
        ? 'Denumire, CUI, adresă, reprezentant legal și persoană de contact.'
        : states['client.legalName']?.anaf?.picked === null
          ? 'Documentele dau altă denumire decât ANAF. Am ales-o pe cea de la ANAF.'
          : anafMismatch(proposal, changes, registered)
            ? 'La ANAF, CUI-ul aparține altei firme.'
            : registered.inactive
              ? 'Firmă inactivă la ANAF.'
              : 'Denumire și CUI verificate la ANAF.';
      return `${anaf}${choiceText}`;
    }
    case 'workplaces': {
      const kept = included(proposal, changes, 'workplaces');
      const rooms = kept.reduce(
        (total, state) => total + ((state.values.rooms as string[] | undefined)?.length ?? 0),
        0
      );
      return `${count(kept.length, 'punct de lucru', 'puncte de lucru')}${rooms > 0 ? `, cu ${rooms === 1 ? 'o încăpere' : `${rooms} încăperi`} pentru mijloacele de apărare împotriva incendiilor` : ''}.${others(['workplaces'], 'puncte de lucru')}`;
    }
    case 'job-positions': {
      const kept = included(proposal, changes, 'jobPositions');
      const management = leftOut('jobPositions', 'management_only');
      const managementText =
        management.length === 0
          ? ''
          : management.length === 1
            ? ` Postul «${String(management[0]!.values.name)}» se preia doar dacă e ocupat cu contract de muncă.`
            : ` ${management.length} posturi de conducere se preiau doar dacă sunt ocupate cu contract de muncă.`;
      return `${count(kept.length, 'post', 'posturi')}.${managementText}${others(['jobPositions'], 'posturi')}`;
    }
    case 'responsible': {
      const people = included(proposal, changes, 'responsiblePersons');
      const roles = people.reduce(
        (total, state) => total + ((state.values.roles as string[] | undefined)?.length ?? 0),
        0
      );
      const employees = included(proposal, changes, 'employees');
      const representative = employees.find(
        (state) => state.values.role === 'workers_representative'
      );
      const missingDate = representative && !representative.values.hiredAt;
      return `${people.length === 1 ? 'O persoană' : `${people.length} persoane`} cu ${roles === 1 ? 'un rol' : `${roles} roluri`}.${
        representative
          ? ` ${roleLabel('workers_representative')} devine lucrător${missingDate ? ' și are nevoie de data angajării' : ''}.`
          : ''
      }${others(['responsiblePersons'], 'persoane')}`;
    }
    case 'training': {
      const schedule = (label: string, root: 'trainingSchedule' | 'fireSafety') => {
        const parts = (
          [
            [`${root}.workerTrainingIntervalMonths`, 'execuție'],
            [`${root}.administrativeTrainingIntervalMonths`, 'tehnico-administrativ'],
          ] as const
        ).flatMap(([path, name]) => {
          const value = valueInForce(states[path]);
          return value === null || value === undefined
            ? []
            : [`${formatFieldValue(path, value)} pentru ${name}`];
        });
        return parts.length > 0 ? [`${label} ${parts.join(' și ')}.`] : [];
      };
      const schedules = [...schedule('SSM', 'trainingSchedule'), ...schedule('SU', 'fireSafety')];
      return schedules.length > 0
        ? `${schedules.join(' ')}${choiceText}`
        : `Programul instruirii periodice.${choiceText}`;
    }
    case 'fire-safety': {
      const equipment = included(proposal, changes, 'fireEquipment').reduce(
        (total, state) => total + Math.max(1, Number(state.values.count ?? 1)),
        0
      );
      const smoking = smokingRule(states, changes);
      const countsText = fireEquipmentCountsOf(proposal)
        .filter((each) => chosenCountOption(each, changes) === null)
        .map((each) => ` ${countName(each)}: ${each.options.length} numere în documente.`)
        .join('');
      const answer = valueInForce(states[substancesStatePath]);
      const substances =
        answer === 'listed'
          ? `, ${substancesCount(substancesAdded(proposal, changes, states).length)}`
          : answer === 'none'
            ? ', fără substanțe periculoase'
            : '';
      return `${smoking ? `${smoking}, ` : ''}${equipment === 1 ? 'un mijloc de stingere' : `${equipment} mijloace de stingere`}${substances}.${choiceText}${countsText}${others(['fireEquipment', 'fireInstallations', 'substances'], 'mijloace')}`;
    }
    case 'equipment': {
      const items = included(proposal, changes, 'protectiveEquipment');
      const positions = new Set(
        items
          .map((state) => {
            const reference = state.values.jobPosition;
            return typeof reference === 'string'
              ? reference
              : ((reference as { id: string | null; name: string | null } | undefined)?.id ??
                  (reference as { name: string | null } | undefined)?.name);
          })
          .filter((position) => position)
      ).size;
      const withPosition = leftOut('protectiveEquipment', 'position_left_out').length;
      const withPositionText =
        withPosition === 0
          ? ''
          : withPosition === 1
            ? ' Un articol rămâne deoparte cu postul lui.'
            : ` Alte ${withPosition} articole rămân deoparte cu posturile lor.`;
      return `${items.length === 1 ? 'Un articol' : `${items.length} articole`} pentru ${positions === 1 ? 'un post' : `${positions} posturi`}.${withPositionText}${others(['protectiveEquipment'], 'articole')}`;
    }
  }
}

export type SectionReviewHint = { anchor: string; summary: string; text: string };

export function sectionReviewHints(
  section: SectionId,
  proposal: Proposal,
  changes: Changes
): SectionReviewHint[] {
  const lists = [
    'workplaces',
    'jobPositions',
    'responsiblePersons',
    'fireEquipment',
    'fireInstallations',
    'protectiveEquipment',
    'employees',
    'substances',
  ] as const;
  const items = lists
    .filter((list) => sectionOf(list) === section)
    .flatMap((list) => itemStates(proposal, changes, list));
  const hints: SectionReviewHint[] = items
    .filter((state) => !state.proposed)
    .map((state) => {
      const name = itemName(state.list, state.values);
      const anchor = anchorOf(`${state.list}.${state.item.id}`);
      switch (state.untickedReason) {
        case 'legal_representative':
          return {
            anchor,
            summary: 'Reprezentant legal nepreluat automat',
            text: `${name}: nu este preluat automat ca lucrător. Verifică dacă face parte din personalul firmei.`,
          };
        case 'management_only':
          return {
            anchor,
            summary: 'Post de conducere nepreluat automat',
            text: `${name}: se preia doar dacă este ocupat cu contract de muncă.`,
          };
        case 'position_left_out':
          return {
            anchor,
            summary: 'Articol cu postul lăsat deoparte',
            text: `${name}: verifică alocarea; postul asociat este lăsat deoparte.`,
          };
        default:
          return {
            anchor,
            summary: 'Date din pasaje despre altă firmă',
            text: `${name}: apare în pasaje despre altă firmă. Verifică dacă îl preiei.`,
          };
      }
    });
  return hints.filter(
    (hint, index) => hints.findIndex((other) => other.anchor === hint.anchor) === index
  );
}

export function sectionStatuses(
  proposal: Proposal,
  changes: Changes,
  blockers: Blocker[],
  states: Record<string, FieldState>,
  registered: RegisteredCompany | null
) {
  const kept = keptPaths(states);
  return Object.fromEntries(
    sectionIds.map((section) => [
      section,
      sectionStatus(section, proposal, changes, blockers, kept, registered),
    ])
  ) as Record<SectionId, ReturnType<typeof sectionStatus>>;
}

export function blockerHeading(blockers: Blocker[]) {
  const choices = blockers.filter((blocker) => blocker.code === 'choice').length;
  const missing = blockers.filter(
    (blocker) => blocker.code === 'missing' || blocker.code === 'unknown_reference'
  ).length;
  const invalid = blockers.filter((blocker) => blocker.code === 'invalid').length;
  const parts = [
    choices === 1 ? 'o alegere' : choices > 1 ? `${choices} alegeri` : null,
    missing === 1 ? 'o dată obligatorie' : missing > 1 ? `${missing} date obligatorii` : null,
    invalid === 1 ? 'o valoare de corectat' : invalid > 1 ? `${invalid} valori de corectat` : null,
  ].filter(Boolean) as string[];
  const join = (list: string[]) =>
    list.length > 1 ? `${list.slice(0, -1).join(', ')} și ${list.at(-1)}` : (list[0] ?? '');
  const resolve = [
    choices === 1 ? 'alegerea' : choices > 1 ? `cele ${choices} alegeri` : null,
    missing === 1 ? 'data lipsă' : missing > 1 ? `cele ${missing} date lipsă` : null,
    invalid === 1 ? 'valoarea greșită' : invalid > 1 ? `cele ${invalid} valori greșite` : null,
  ].filter(Boolean) as string[];
  return { heading: `Mai ai ${join(parts)}`, resolve: `Rezolvă ${join(resolve)}` };
}

export function blockerLinks(proposal: Proposal, changes: Changes, blockers: Blocker[]) {
  return blockers.map((blocker) => blockerLink(proposal, changes, blocker));
}

export type ConfirmLine = { label: string; count?: number; detail: string; icon: string };

// `existingSubstances` are the names an existing client lists already, null for a new client.
export function confirmLines(
  proposal: Proposal,
  changes: Changes,
  states: Record<string, FieldState> = {},
  existingSubstances: string[] | null = null
) {
  const workplaces = included(proposal, changes, 'workplaces');
  const rooms = workplaces.reduce(
    (total, state) => total + ((state.values.rooms as string[] | undefined)?.length ?? 0),
    0
  );
  const positions = included(proposal, changes, 'jobPositions');
  const equipment = included(proposal, changes, 'protectiveEquipment');
  const people = included(proposal, changes, 'responsiblePersons');
  const roles = people.reduce(
    (total, state) => total + ((state.values.roles as string[] | undefined)?.length ?? 0),
    0
  );
  const employees = included(proposal, changes, 'employees');
  const fireMeans = included(proposal, changes, 'fireEquipment').reduce(
    (total, state) => total + Math.max(1, Number(state.values.count ?? 1)),
    0
  );
  const installations = included(proposal, changes, 'fireInstallations').length;
  const lines: ConfirmLine[] = [];
  if (workplaces.length > 0) {
    lines.push({
      icon: 'pin',
      count: workplaces.length,
      label: workplaces.length === 1 ? 'punct de lucru' : 'puncte de lucru',
      detail:
        rooms > 0
          ? `Cu ${rooms === 1 ? 'o încăpere' : `${rooms} încăperi`}, locurile mijloacelor de apărare împotriva incendiilor`
          : 'Cu adresele din documente',
    });
  }
  if (positions.length > 0) {
    lines.push({
      icon: 'briefcase',
      count: positions.length,
      label: positions.length === 1 ? 'post de lucru' : 'posturi de lucru',
      detail:
        equipment.length > 0
          ? 'Cu activitățile și echipamentul de protecție'
          : 'Cu activitățile din documente',
    });
  }
  if (people.length > 0) {
    lines.push({
      icon: 'person',
      count: people.length,
      label: people.length === 1 ? 'responsabil' : 'responsabili',
      detail: `Cu ${roles === 1 ? 'un rol' : `${roles} roluri`}, și programul de instruire`,
    });
  }
  if (employees.length > 0) {
    const names = employees
      .map((state) => [state.values.lastName, state.values.firstName].filter(Boolean).join(' '))
      .join(', ');
    lines.push({
      icon: 'users',
      count: employees.length,
      label: employees.length === 1 ? 'lucrător' : 'lucrători',
      detail: `${names}. Ceilalți lucrători îi imporți după, din fișe.`,
    });
  }
  if (fireMeans + installations > 0) {
    lines.push({
      icon: 'flame',
      count: fireMeans + installations,
      label: fireMeans + installations === 1 ? 'mijloc de apărare' : 'mijloace de apărare',
      detail: 'Stingătoarele, instalațiile și regulile de fumat și de salubritate',
    });
  }
  const substances = substancesAdded(proposal, changes, states, existingSubstances ?? []);
  if (substances.length > 0) {
    lines.push({
      icon: 'flask',
      count: substances.length,
      label: substances.length === 1 ? 'substanță periculoasă' : 'substanțe periculoase',
      detail: 'Doar cu denumirea. Clasificarea și cantitatea le completezi pe pagina clientului.',
    });
  } else if (existingSubstances === null && valueInForce(states[substancesStatePath]) === 'none') {
    lines.push({
      icon: 'flask',
      label: 'Nu se utilizează substanțe periculoase',
      detail: 'Declarația din documente, pe care o semnează reprezentantul legal',
    });
  }
  const left = (
    [
      'workplaces',
      'jobPositions',
      'responsiblePersons',
      'fireEquipment',
      'fireInstallations',
      'protectiveEquipment',
      'substances',
    ] as ItemList[]
  ).flatMap((list) =>
    itemStates(proposal, changes, list).filter(
      (state) => state.untickedReason === 'other_company' && !state.included
    )
  ).length;
  return { lines, left };
}

export const importFolderCount = (detail: ImportDetail) =>
  detail.files.filter(
    (file) =>
      file.state !== 'other_company' &&
      !((file.mimeType === 'image/heic' || file.mimeType === 'image/heif') && !file.hasDerived)
  ).length;

export const folderSentence = (detail: ImportDetail) => {
  const files = importFolderCount(detail);
  return files === 1
    ? 'Fișierul rămâne la client, în Alte documente, ca dosarul importat.'
    : `Cele ${filesLabel(files)} rămân la client, în Alte documente, grupate ca dosarul importat.`;
};

export const sectionIcons: Record<SectionId, LucideIcon> = {
  identity: Building2,
  workplaces: MapPin,
  'job-positions': BriefcaseBusiness,
  responsible: UserRound,
  training: ClipboardList,
  'fire-safety': Flame,
  equipment: HardHat,
};

export function reviewName(detail: ImportDetail, proposal: Proposal, changes: Changes) {
  if (detail.client) return detail.client.legalName;
  const registered = detail.intoExistingClient ? null : detail.registeredCompany;
  const { value } = fieldState(proposal, changes, 'client.legalName', undefined, registered);
  if (typeof value === 'string' && value) return value;
  const own = proposal.client.legalName.options.find((option) => option.otherCompanyName === null);
  return String(own?.value ?? detail.companyName ?? 'Client nou');
}
