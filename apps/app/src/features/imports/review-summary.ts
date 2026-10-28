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
  type Blocker,
  blockerLink,
  type Changes,
  fieldGroups,
  type FieldState,
  fieldState,
  formatFieldValue,
  type ItemList,
  itemStates,
  type Proposal,
  type RegisteredCompany,
  roleLabel,
  type SectionId,
  sectionIds,
  sectionOf,
  sectionStatus,
} from './review-model';

export type ExistingValueAt = (path: string) => string | number | null | undefined;

export function fieldStates(
  proposal: Proposal,
  changes: Changes,
  valueAt: ExistingValueAt
): Record<string, FieldState> {
  return Object.fromEntries(
    fieldGroups
      .flatMap((group) => group.paths)
      .map((path) => [path, fieldState(proposal, changes, path, valueAt(path))])
  );
}

export const keptPaths = (states: Record<string, FieldState>) =>
  Object.values(states)
    .filter((state) => state.comparison === 'kept')
    .map((state) => state.path);

const included = (proposal: Proposal, changes: Changes, list: ItemList) =>
  itemStates(proposal, changes, list).filter((state) => state.included);

const count = (value: number, one: string, many: string) =>
  value === 1 ? `un ${one}` : `${value} ${many}`;

export function sectionDescription(
  section: SectionId,
  detail: ImportDetail,
  proposal: Proposal,
  changes: Changes,
  states: Record<string, FieldState>
): string {
  const others = (lists: ItemList[], noun: string) => {
    const left = lists.flatMap((list) =>
      itemStates(proposal, changes, list).filter((state) => !state.proposed && !state.included)
    ).length;
    return left === 0
      ? ''
      : ` Alte ${left} ${noun} apar doar în pasaje copiate de la altă firmă și sunt lăsate deoparte.`;
  };
  const choices = Object.values(states).filter(
    (state) => sectionOf(state.path) === section && state.status === 'choice'
  );
  const choiceText = choices
    .map(
      (state) =>
        ` Documentele dau ${state.own.length} variante pentru ${state.label.toLowerCase()}.`
    )
    .join('');
  switch (section) {
    case 'identity': {
      const registered = detail.registeredCompany;
      const anaf = !registered
        ? 'Denumire, CUI, adresă, reprezentant legal și persoană de contact.'
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
      return `${count(kept.length, 'punct de lucru', 'puncte de lucru')}${rooms > 0 ? `, cu ${rooms === 1 ? 'o încăpere' : `${rooms} încăperi`} pentru mijloacele PSI` : ''}.${others(['workplaces'], 'puncte de lucru')}`;
    }
    case 'job-positions': {
      const kept = included(proposal, changes, 'jobPositions');
      return `${count(kept.length, 'post', 'posturi')}.${others(['jobPositions'], 'posturi')}`;
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
          ? ` ${roleLabel('workers_representative')} devine angajat${missingDate ? ' și are nevoie de data angajării' : ''}.`
          : ''
      }${others(['responsiblePersons'], 'persoane')}`;
    }
    case 'training': {
      const worker = states['trainingSchedule.workerTrainingIntervalMonths'];
      const admin = states['trainingSchedule.administrativeTrainingIntervalMonths'];
      const parts = [
        worker?.value != null
          ? `${formatFieldValue(worker.path, worker.value)} pentru execuție`
          : null,
        admin?.value != null
          ? `${formatFieldValue(admin.path, admin.value)} pentru tehnico-administrativ`
          : null,
      ].filter(Boolean);
      return parts.length > 0
        ? `Periodic ${parts.join(' și ')}.${choiceText}`
        : `Programul instruirii periodice.${choiceText}`;
    }
    case 'fire-safety': {
      const equipment = included(proposal, changes, 'fireEquipment').reduce(
        (total, state) => total + Math.max(1, Number(state.values.count ?? 1)),
        0
      );
      const smoking = states['fireSafety.smokingPlace']?.value;
      return `${smoking ? `Fumat doar în ${String(smoking)}, ` : ''}${equipment === 1 ? 'un mijloc de stingere' : `${equipment} mijloace de stingere`}.${choiceText}${others(['fireEquipment', 'fireInstallations'], 'mijloace')}`;
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
      return `${items.length === 1 ? 'Un articol' : `${items.length} articole`} pentru ${positions === 1 ? 'un post' : `${positions} posturi`}.${others(['protectiveEquipment'], 'articole')}`;
    }
  }
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

export function confirmLines(proposal: Proposal, changes: Changes) {
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
          ? `Cu ${rooms === 1 ? 'o încăpere' : `${rooms} încăperi`}, locurile mijloacelor PSI`
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
      label: employees.length === 1 ? 'angajat' : 'angajați',
      detail: `${names}. Ceilalți angajați îi imporți după, din fișe.`,
    });
  }
  if (fireMeans + installations > 0) {
    lines.push({
      icon: 'flame',
      count: fireMeans + installations,
      label: fireMeans + installations === 1 ? 'mijloc PSI' : 'mijloace PSI',
      detail: 'Stingătoarele, instalațiile și regulile de fumat și de salubritate',
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
    ] as ItemList[]
  ).flatMap((list) =>
    itemStates(proposal, changes, list).filter((state) => !state.proposed && !state.included)
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
  const { value } = fieldState(proposal, changes, 'client.legalName');
  if (typeof value === 'string' && value) return value;
  const own = proposal.client.legalName.options.find((option) => option.otherCompanyName === null);
  return String(own?.value ?? detail.companyName ?? 'Client nou');
}
