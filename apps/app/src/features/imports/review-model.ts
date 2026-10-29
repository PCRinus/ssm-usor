import {
  caenClassName,
  type CountyCode,
  countyNames,
  type EquipmentAllocation,
  type FireEquipmentKind,
  fireEquipmentKindLabels,
  type FireExtinguishingAgent,
  fireExtinguishingAgentLabels,
  type FireInstallationKind,
  fireInstallationKindLabels,
  type FireSmokingPolicy,
  fireSmokingPolicyLabels,
  formatCui,
  maxEquipmentDurationMonths,
  type ResponsiblePersonRole,
  responsiblePersonRoleLabels,
} from '@ssm-usor/contracts';

import type { ImportDetail } from '@/api/generated/api';
import { allocationLabels } from '@/features/protective-equipment/equipment-schema';

export type Proposal = NonNullable<ImportDetail['proposal']>;
export type Source = { file: string; quote: string };
export type Option = { value: string | number; sources: Source[]; otherCompanyName: string | null };
export type ProposedField = { options: Option[] };

type ChangedValue = string | number | boolean | null | string[];
export type FieldChange = {
  option?: number;
  value?: string | number | null;
  included?: boolean;
  replace?: boolean;
};
export type ItemChange = {
  included?: boolean;
  values?: Record<string, ChangedValue>;
  existingId?: string | null;
  replace?: string[];
};
export type Changes = { fields: Record<string, FieldChange>; items: Record<string, ItemChange> };

export const noChanges: Changes = { fields: {}, items: {} };

export const sectionIds = [
  'identity',
  'workplaces',
  'job-positions',
  'responsible',
  'training',
  'fire-safety',
  'equipment',
] as const;

export type SectionId = (typeof sectionIds)[number];

export const sectionLabels: Record<SectionId, string> = {
  identity: 'Identitatea clientului',
  workplaces: 'Puncte de lucru',
  'job-positions': 'Posturi de lucru',
  responsible: 'Responsabili',
  training: 'Instruire',
  'fire-safety': 'Apărarea împotriva incendiilor',
  equipment: 'Echipament de protecție',
};

export type ItemList =
  | 'workplaces'
  | 'jobPositions'
  | 'responsiblePersons'
  | 'fireEquipment'
  | 'fireInstallations'
  | 'protectiveEquipment'
  | 'employees';

const sectionOfRoot: Record<string, SectionId> = {
  client: 'identity',
  trainingSchedule: 'training',
  fireSafety: 'fire-safety',
  fireEquipment: 'fire-safety',
  fireInstallations: 'fire-safety',
  workplaces: 'workplaces',
  jobPositions: 'job-positions',
  responsiblePersons: 'responsible',
  employees: 'responsible',
  protectiveEquipment: 'equipment',
};

export const sectionOf = (path: string): SectionId =>
  sectionOfRoot[path.split('.')[0] ?? ''] ?? 'identity';

type FieldInfo = { label: string; choose: string; write: string };

export const fieldInfo: Record<string, FieldInfo> = {
  'client.legalName': { label: 'Denumire', choose: 'Alege denumirea', write: 'Scrie denumirea' },
  'client.cui': { label: 'CUI', choose: 'Alege CUI-ul', write: 'Scrie CUI-ul' },
  'client.tradeRegisterNumber': {
    label: 'Nr. Registrul Comerțului',
    choose: 'Alege numărul de la Registrul Comerțului',
    write: 'Scrie numărul de la Registrul Comerțului',
  },
  'client.caenCode': { label: 'Cod CAEN', choose: 'Alege codul CAEN', write: 'Scrie codul CAEN' },
  'client.countyCode': { label: 'Județ', choose: 'Alege județul', write: 'Alege județul' },
  'client.locality': {
    label: 'Localitate',
    choose: 'Alege localitatea',
    write: 'Scrie localitatea',
  },
  'client.addressLine': { label: 'Adresă', choose: 'Alege adresa', write: 'Scrie adresa' },
  'client.legalRepresentativeName': {
    label: 'Reprezentant legal',
    choose: 'Alege reprezentantul legal',
    write: 'Scrie reprezentantul legal',
  },
  'client.legalRepresentativeRole': {
    label: 'Calitatea',
    choose: 'Alege calitatea reprezentantului legal',
    write: 'Scrie calitatea reprezentantului legal',
  },
  'client.contactName': {
    label: 'Nume',
    choose: 'Alege persoana de contact',
    write: 'Scrie persoana de contact',
  },
  'client.contactPhone': {
    label: 'Telefon',
    choose: 'Alege telefonul de contact',
    write: 'Scrie telefonul de contact',
  },
  'client.contactEmail': {
    label: 'Email',
    choose: 'Alege emailul de contact',
    write: 'Scrie emailul de contact',
  },
  'trainingSchedule.periodicTrainingMinutes': {
    label: 'Durata instruirii periodice',
    choose: 'Alege durata instruirii periodice',
    write: 'Scrie durata instruirii periodice',
  },
  'trainingSchedule.administrativeTrainingIntervalMonths': {
    label: 'Periodicitate, tehnico-administrativ',
    choose: 'Alege periodicitatea pentru tehnico-administrativ',
    write: 'Scrie periodicitatea pentru tehnico-administrativ',
  },
  'trainingSchedule.workerTrainingIntervalMonths': {
    label: 'Periodicitate, execuție',
    choose: 'Alege periodicitatea pentru execuție',
    write: 'Scrie periodicitatea pentru execuție',
  },
  'trainingSchedule.workerTrainingNotApplicable': {
    label: 'Instruirea periodică, execuție',
    choose: 'Alege dacă instruirea periodică se aplică pentru execuție',
    write: 'Alege dacă instruirea periodică se aplică pentru execuție',
  },
  'trainingSchedule.administrativeTrainingNotApplicable': {
    label: 'Instruirea periodică, tehnico-administrativ',
    choose: 'Alege dacă instruirea periodică se aplică pentru tehnico-administrativ',
    write: 'Alege dacă instruirea periodică se aplică pentru tehnico-administrativ',
  },
  'trainingSchedule.trainingFirstMonth': {
    label: 'Prima lună a instruirii',
    choose: 'Alege prima lună a instruirii',
    write: 'Scrie prima lună a instruirii',
  },
  'trainingSchedule.trainingDayFrom': {
    label: 'Din ziua',
    choose: 'Alege ziua de început a instruirii',
    write: 'Scrie ziua de început a instruirii',
  },
  'trainingSchedule.trainingDayTo': {
    label: 'Până în ziua',
    choose: 'Alege ziua de sfârșit a instruirii',
    write: 'Scrie ziua de sfârșit a instruirii',
  },
  'fireSafety.periodicTrainingHours': {
    label: 'Durata instruirii periodice PSI',
    choose: 'Alege durata instruirii periodice PSI',
    write: 'Scrie durata instruirii periodice PSI',
  },
  'fireSafety.administrativeTrainingIntervalMonths': {
    label: 'Periodicitate PSI, tehnico-administrativ',
    choose: 'Alege periodicitatea PSI pentru tehnico-administrativ',
    write: 'Scrie periodicitatea PSI pentru tehnico-administrativ',
  },
  'fireSafety.workerTrainingIntervalMonths': {
    label: 'Periodicitate PSI, execuție',
    choose: 'Alege periodicitatea PSI pentru execuție',
    write: 'Scrie periodicitatea PSI pentru execuție',
  },
  'fireSafety.smokingPolicy': {
    label: 'Fumatul',
    choose: 'Alege regula de fumat',
    write: 'Alege regula de fumat',
  },
  'fireSafety.smokingPlace': {
    label: 'Locul pentru fumat',
    choose: 'Alege locul pentru fumat',
    write: 'Scrie locul pentru fumat',
  },
  'fireSafety.wasteContractor': {
    label: 'Firma de salubritate',
    choose: 'Alege firma de salubritate',
    write: 'Scrie firma de salubritate',
  },
  'fireSafety.wasteKinds': {
    label: 'Deșeuri colectate',
    choose: 'Alege deșeurile colectate',
    write: 'Scrie deșeurile colectate',
  },
  'fireSafety.wasteCollectors': {
    label: 'Cine colectează deșeurile',
    choose: 'Alege cine colectează deșeurile',
    write: 'Scrie cine colectează deșeurile',
  },
  'fireSafety.hasThirdParties': {
    label: 'Alte firme în spațiile clientului',
    choose: 'Alege dacă alte firme lucrează în spațiile clientului',
    write: 'Alege dacă alte firme lucrează în spațiile clientului',
  },
};

// The proposal's yes or no, which the app's own forms word for each field.
export const yesNoLabels: Record<string, Record<'true' | 'false', string>> = {
  'trainingSchedule.workerTrainingNotApplicable': { true: 'Nu se aplică', false: 'Se aplică' },
  'trainingSchedule.administrativeTrainingNotApplicable': {
    true: 'Nu se aplică',
    false: 'Se aplică',
  },
  'fireSafety.hasThirdParties': { true: 'Da', false: 'Nu' },
};

// A staff category has an interval or "Nu se aplică", never both (ADR 008).
export const intervalOfNotApplicable: Record<string, string> = {
  'trainingSchedule.workerTrainingNotApplicable': 'trainingSchedule.workerTrainingIntervalMonths',
  'trainingSchedule.administrativeTrainingNotApplicable':
    'trainingSchedule.administrativeTrainingIntervalMonths',
};

export const fieldGroups: { section: SectionId; title: string; paths: string[] }[] = [
  {
    section: 'identity',
    title: 'Date firmă',
    paths: [
      'client.legalName',
      'client.cui',
      'client.tradeRegisterNumber',
      'client.caenCode',
      'client.countyCode',
      'client.locality',
      'client.addressLine',
    ],
  },
  {
    section: 'identity',
    title: 'Reprezentant legal',
    paths: ['client.legalRepresentativeName', 'client.legalRepresentativeRole'],
  },
  {
    section: 'identity',
    title: 'Persoană de contact',
    paths: ['client.contactName', 'client.contactPhone', 'client.contactEmail'],
  },
  {
    section: 'training',
    title: 'Programul de instruire SSM',
    paths: [
      'trainingSchedule.periodicTrainingMinutes',
      'trainingSchedule.workerTrainingIntervalMonths',
      'trainingSchedule.workerTrainingNotApplicable',
      'trainingSchedule.administrativeTrainingIntervalMonths',
      'trainingSchedule.administrativeTrainingNotApplicable',
      'trainingSchedule.trainingFirstMonth',
      'trainingSchedule.trainingDayFrom',
      'trainingSchedule.trainingDayTo',
    ],
  },
  {
    section: 'fire-safety',
    title: 'Reguli PSI',
    paths: [
      'fireSafety.smokingPolicy',
      'fireSafety.smokingPlace',
      'fireSafety.wasteContractor',
      'fireSafety.wasteKinds',
      'fireSafety.wasteCollectors',
      'fireSafety.hasThirdParties',
      'fireSafety.periodicTrainingHours',
      'fireSafety.workerTrainingIntervalMonths',
      'fireSafety.administrativeTrainingIntervalMonths',
    ],
  },
];

export const integerPaths = new Set(
  Object.keys(fieldInfo).filter(
    (path) =>
      (path.startsWith('trainingSchedule.') && !(path in yesNoLabels)) ||
      [
        'fireSafety.periodicTrainingHours',
        'fireSafety.administrativeTrainingIntervalMonths',
        'fireSafety.workerTrainingIntervalMonths',
      ].includes(path)
  )
);

export function proposedField(proposal: Proposal, path: string): ProposedField {
  const [group, name] = path.split('.') as [string, string];
  const fields = (proposal as unknown as Record<string, Record<string, ProposedField>>)[group];
  return fields?.[name] ?? { options: [] };
}

const months = [
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

export function formatFieldValue(
  path: string,
  value: string | number | null | undefined,
  vatPayer = false
): string {
  if (value === null || value === undefined || value === '') return '';
  const text = String(value);
  const yesNo = yesNoLabels[path];
  if (yesNo) return yesNo[text as 'true' | 'false'] ?? text;
  switch (path) {
    case 'client.cui':
      return formatCui(text.replace(/^RO/i, ''), vatPayer);
    case 'client.countyCode':
      return countyNames[text as CountyCode] ?? text;
    case 'client.caenCode': {
      const name = caenClassName(text);
      return name ? `${text}, ${name}` : text;
    }
    case 'trainingSchedule.periodicTrainingMinutes':
      return `${text} de minute`;
    case 'fireSafety.periodicTrainingHours':
      return Number(text) === 1 ? 'o oră' : `${text} ore`;
    case 'trainingSchedule.administrativeTrainingIntervalMonths':
    case 'trainingSchedule.workerTrainingIntervalMonths':
    case 'fireSafety.administrativeTrainingIntervalMonths':
    case 'fireSafety.workerTrainingIntervalMonths':
      return Number(text) === 1 ? 'lunar' : `la ${text} luni`;
    case 'trainingSchedule.trainingFirstMonth':
      return months[Number(text) - 1] ?? text;
    case 'fireSafety.smokingPolicy':
      return fireSmokingPolicyLabels[text as FireSmokingPolicy] ?? text;
    default:
      return text;
  }
}

export const foldText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

export const sameValue = (a: unknown, b: unknown) =>
  typeof a === 'number' || typeof b === 'number'
    ? Number(a) === Number(b)
    : foldText(String(a ?? '')) === foldText(String(b ?? ''));

const isEmpty = (value: unknown) =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

export type FieldState = {
  path: string;
  label: string;
  options: Option[];
  // Indexes of the options the client's own documents give.
  own: number[];
  status: 'value' | 'choice' | 'missing' | 'unticked';
  value: string | number | null;
  option: number | null;
  edited: boolean;
  proposedValue: string | number | null;
  sources: Source[];
  otherCompanyName: string | null;
  // Into an existing client: what the app has, and whether the documents' value replaces it.
  existing: string | number | null;
  comparison: 'none' | 'added' | 'same' | 'kept' | 'replaced';
};

export function fieldState(
  proposal: Proposal,
  changes: Changes,
  path: string,
  existing?: string | number | null
): FieldState {
  const { options } = proposedField(proposal, path);
  const change = changes.fields[path];
  const own = options.flatMap((option, index) => (option.otherCompanyName === null ? [index] : []));
  const proposedIndex = own.length === 1 ? own[0]! : null;
  const proposedValue = proposedIndex === null ? null : options[proposedIndex]!.value;
  let status: FieldState['status'] = 'missing';
  let value: string | number | null = null;
  let option: number | null = null;
  let edited = false;
  if (change?.value !== undefined) {
    status = change.value === null ? 'missing' : 'value';
    value = change.value;
    edited = true;
  } else if (change?.option !== undefined && options[change.option]) {
    status = 'value';
    option = change.option;
    value = options[change.option]!.value;
  } else if (own.length > 1) {
    status = 'choice';
  } else if (own.length === 1) {
    if (change?.included === false) status = 'unticked';
    else {
      status = 'value';
      option = own[0]!;
      value = options[own[0]!]!.value;
    }
  } else if (options.length > 0) {
    if (change?.included === true) {
      status = 'value';
      option = 0;
      value = options[0]!.value;
    } else status = 'unticked';
  }
  const shown = option ?? (status === 'unticked' ? (own[0] ?? 0) : null);
  const sources =
    shown !== null && options[shown]
      ? options[shown]!.sources
      : status === 'choice' || status === 'missing'
        ? options.flatMap((each) => each.sources)
        : [];
  let comparison: FieldState['comparison'] = 'none';
  if (existing !== undefined) {
    if (isEmpty(existing)) comparison = value !== null ? 'added' : 'none';
    else if (value === null || sameValue(existing, value)) comparison = 'same';
    else comparison = change?.replace ? 'replaced' : 'kept';
  }
  return {
    path,
    label: fieldInfo[path]?.label ?? path,
    options,
    own,
    status,
    value,
    option,
    edited,
    proposedValue,
    sources,
    otherCompanyName: shown !== null ? (options[shown]?.otherCompanyName ?? null) : null,
    existing: existing ?? null,
    comparison,
  };
}

type AnyItem = {
  id: string;
  sources: Source[];
  otherCompanyName: string | null;
} & Record<string, unknown>;

export const itemsOf = (proposal: Proposal, list: ItemList) =>
  proposal[list] as unknown as AnyItem[];

export type UntickedReason =
  'other_company' | 'legal_representative' | 'management_only' | 'position_left_out';

export type ItemState = {
  list: ItemList;
  index: number;
  item: AnyItem;
  values: Record<string, unknown>;
  included: boolean;
  // Ticked unless the member unticks it; as the API's `proposedIncluded` and payload decide.
  proposed: boolean;
  untickedReason: UntickedReason | null;
  edited: boolean;
};

function untickedReason(
  item: AnyItem,
  written: Record<string, unknown>,
  leftOutPositions: Set<string>
): UntickedReason | null {
  if (item.otherCompanyName !== null) return 'other_company';
  if (item.role === 'legal_representative') return 'legal_representative';
  if (item.managementOnly === true) return 'management_only';
  const position = (item.jobPosition as { id: string | null } | undefined)?.id;
  if (written.jobPosition === undefined && position && leftOutPositions.has(position)) {
    return 'position_left_out';
  }
  return null;
}

export function itemStates(proposal: Proposal, changes: Changes, list: ItemList): ItemState[] {
  const leftOutPositions = new Set(
    list === 'protectiveEquipment'
      ? itemStates(proposal, changes, 'jobPositions')
          .filter((state) => !state.included)
          .map((state) => state.item.id)
      : []
  );
  return itemsOf(proposal, list).map((item, index) => {
    const change = changes.items[item.id];
    const written = change?.values ?? {};
    const reason = untickedReason(item, written, leftOutPositions);
    return {
      list,
      index,
      item,
      values: { ...item, ...written },
      included: change?.included ?? reason === null,
      proposed: reason === null,
      untickedReason: reason,
      edited: Object.keys(written).length > 0,
    };
  });
}

const personName = (values: Record<string, unknown>) =>
  [values.lastName, values.firstName].filter((part) => !isEmpty(part)).join(' ');

export function itemName(list: ItemList, values: Record<string, unknown>): string {
  switch (list) {
    case 'workplaces':
    case 'jobPositions':
      return String(values.name ?? '');
    case 'responsiblePersons':
      return String(values.fullName ?? '');
    case 'employees':
      return personName(values) || 'Angajat fără nume';
    case 'fireEquipment':
      return [
        fireEquipmentKindLabels[values.kind as FireEquipmentKind] ?? String(values.kind),
        values.agent ? fireExtinguishingAgentLabels[values.agent as FireExtinguishingAgent] : null,
      ]
        .filter(Boolean)
        .join(', ');
    case 'fireInstallations':
      return fireInstallationKindLabels[values.kind as FireInstallationKind] ?? String(values.kind);
    case 'protectiveEquipment':
      return String(values.item ?? '');
  }
}

export const roleLabel = (role: string) =>
  responsiblePersonRoleLabels[role as ResponsiblePersonRole] ?? role;

export const allocationLabel = (allocation: string) =>
  allocationLabels[allocation as EquipmentAllocation] ?? allocation;

const employeeRoleLabels: Record<string, string> = {
  workers_representative: 'reprezentantul lucrătorilor',
  legal_representative: 'reprezentantul legal',
};

export const employeeRoleLabel = (role: unknown) => employeeRoleLabels[String(role)] ?? '';

const itemFieldLabels: Record<string, string> = {
  hiredAt: 'data angajării',
  lastName: 'numele',
  firstName: 'prenumele',
  jobTitle: 'funcția',
  risk: 'riscul',
  quantity: 'cantitatea',
  durationMonths: 'durata de utilizare',
  allocation: 'alocarea',
  jobPosition: 'postul',
  workplace: 'punctul de lucru',
  employee: 'angajatul',
  name: 'denumirea',
  fullName: 'numele',
  cnp: 'CNP-ul',
  countyCode: 'județul',
  kind: 'felul locului de muncă',
  floorAreaM2: 'suprafața utilă',
  extinguisherNorm: 'norma de dotare cu stingătoare',
  assemblyPoint: 'punctul de adunare',
  combustibleMaterials: 'materialele combustibile',
  ignitionSources: 'sursele de aprindere',
  fireRiskEquipment: 'echipamentele și mijloacele de lucru',
  specificMeasures: 'măsurile specifice',
};

export const itemFieldLabel = (field: string) => itemFieldLabels[field] ?? field;

export type Blocker = {
  path: string;
  code: 'choice' | 'missing' | 'unknown_reference' | 'invalid';
};

export type BlockerLink = {
  text: string;
  section: SectionId;
  anchor: string;
  code: Blocker['code'];
};

const durationRange = `între 1 și ${maxEquipmentDurationMonths} de luni`;

export function durationBlockerNote(code: Blocker['code'], values: Record<string, unknown>) {
  if (code === 'missing') {
    return 'Lipsește durata de utilizare. Scrie-o, sau alege alocarea Consum dacă articolul se consumă.';
  }
  return values.allocation === 'consumable'
    ? 'Un articol de consum nu are durată de utilizare. Șterge durata sau alege altă alocare.'
    : `Durata de utilizare e ${durationRange}.`;
}

function durationBlockerLink(code: Blocker['code'], values: Record<string, unknown>, name: string) {
  if (code === 'missing') {
    return `Scrie durata de utilizare pentru ${name} sau alege alocarea Consum`;
  }
  return values.allocation === 'consumable'
    ? `Șterge durata de utilizare pentru ${name} sau alege altă alocare`
    : `Scrie o durată de utilizare ${durationRange} pentru ${name}`;
}

export const anchorOf = (path: string) => `review-${path.replace(/[^A-Za-z0-9]+/g, '-')}`;

export function blockerLink(proposal: Proposal, changes: Changes, blocker: Blocker): BlockerLink {
  const section = sectionOf(blocker.path);
  const parts = blocker.path.split('.');
  const [root, second, field] = parts as [string, string | undefined, string | undefined];
  const info = fieldInfo[`${root}.${second}`];
  if (info) {
    return {
      section,
      anchor: anchorOf(`${root}.${second}`),
      code: blocker.code,
      text:
        blocker.code === 'choice'
          ? info.choose
          : blocker.code === 'invalid'
            ? `Corectează ${info.label.toLowerCase()}`
            : info.write,
    };
  }
  const list = root as ItemList;
  const index = Number(second);
  const items = (proposal[list] as unknown as AnyItem[] | undefined) ?? [];
  const item = items[index];
  const values: Record<string, unknown> = item
    ? { ...item, ...(changes.items[item.id]?.values ?? {}) }
    : {};
  const name = item ? itemName(list, values) : '';
  const anchor = anchorOf(item ? `${list}.${item.id}` : blocker.path);
  const fieldText = field ? itemFieldLabel(field) : 'datele';
  let text: string;
  if (list === 'protectiveEquipment' && field === 'durationMonths') {
    text = durationBlockerLink(blocker.code, values, name);
  } else if (blocker.code === 'unknown_reference') text = `Alege ${fieldText} pentru ${name}`;
  else if (blocker.code === 'invalid') text = `Corectează ${fieldText} pentru ${name}`;
  else if (list === 'employees') {
    const role = employeeRoleLabel(values.role);
    text = `Scrie ${fieldText} lui ${name}${role ? `, ${role}` : ''}`;
  } else text = `Scrie ${fieldText} pentru ${name}`;
  return { section, anchor, code: blocker.code, text };
}

export type SectionStatus =
  | { kind: 'choice' }
  | { kind: 'missing'; count: number }
  | { kind: 'invalid'; count: number }
  | { kind: 'check' }
  | { kind: 'done' };

// `legal_name_differs` is left to `anafMismatch`, which follows the name the member settles on.
const advisoryFlags = new Set([
  'quote_not_found',
  'file_not_found',
  'cui_not_registered',
  'duplicate',
]);

export type RegisteredCompany = { cui: string; legalName: string; inactive: boolean };

const legalForms = /\b(s ?c|s ?r ?l|s ?a|s ?n ?c|s ?c ?s|pfa|i ?i|i ?f)\b/g;

const companyWords = (name: string) =>
  new Set(foldText(name).replace(legalForms, ' ').split(' ').filter(Boolean));

// As the API's check compares them: the legal form aside, most words shared.
export function sameCompanyName(a: string, b: string) {
  const x = companyWords(a);
  const y = companyWords(b);
  if (x.size === 0 || y.size === 0) return false;
  const shared = [...x].filter((word) => y.has(word)).length;
  return shared / Math.max(x.size, y.size) >= 0.8;
}

const bareCui = (value: unknown) =>
  String(value ?? '')
    .replace(/^RO/i, '')
    .trim();

/** ANAF's company when the CUI is another firm's than the name the review now holds. */
export function anafMismatch(
  proposal: Proposal,
  changes: Changes,
  registered: RegisteredCompany | null | undefined
): RegisteredCompany | null {
  if (!registered) return null;
  const cui = fieldState(proposal, changes, 'client.cui').value;
  if (cui !== null && bareCui(cui) !== registered.cui) return null;
  const name = fieldState(proposal, changes, 'client.legalName').value;
  if (name === null || sameCompanyName(String(name), registered.legalName)) return null;
  return registered;
}

export const anafMismatchNote = (registered: RegisteredCompany) =>
  `La ANAF, CUI-ul ${registered.cui} aparține firmei ${registered.legalName}, nu firmei din documente.`;

export function sectionStatus(
  section: SectionId,
  proposal: Proposal,
  changes: Changes,
  blockers: Blocker[],
  keptPaths: string[],
  registered?: RegisteredCompany | null
): SectionStatus {
  const own = blockers.filter((blocker) => sectionOf(blocker.path) === section);
  if (own.some((blocker) => blocker.code === 'choice')) return { kind: 'choice' };
  const missing = own.filter((blocker) => blocker.code !== 'invalid').length;
  if (missing > 0) return { kind: 'missing', count: missing };
  const invalid = own.filter((blocker) => blocker.code === 'invalid').length;
  if (invalid > 0) return { kind: 'invalid', count: invalid };
  const lists: ItemList[] = (
    [
      'workplaces',
      'jobPositions',
      'responsiblePersons',
      'fireEquipment',
      'fireInstallations',
      'protectiveEquipment',
      'employees',
    ] as const
  ).filter((list) => sectionOf(list) === section);
  const otherCompanyItems = lists.some((list) =>
    itemStates(proposal, changes, list).some((state) => !state.proposed)
  );
  const otherCompanyFields = fieldGroups
    .filter((group) => group.section === section)
    .flatMap((group) => group.paths)
    .some((path) => fieldState(proposal, changes, path).status === 'unticked');
  const flagged = proposal.flags.some(
    (flag) => advisoryFlags.has(flag.code) && sectionOf(flag.path) === section
  );
  const kept = keptPaths.some((path) => sectionOf(path) === section);
  const anaf = section === 'identity' && anafMismatch(proposal, changes, registered) !== null;
  if (otherCompanyItems || otherCompanyFields || flagged || kept || anaf) return { kind: 'check' };
  return { kind: 'done' };
}

export type Flag = Proposal['flags'][number];

const sameAs: Partial<Record<ItemList, string>> = {
  workplaces: 'același punct de lucru ca',
  jobPositions: 'același post ca',
  responsiblePersons: 'aceeași persoană ca',
  employees: 'același angajat ca',
};

const notAllowed: Record<string, string> = {
  countyCode: 'Județul nu a fost recunoscut. Alege-l din listă.',
  caenCode: 'Codul CAEN are patru cifre.',
  contactEmail: 'Adresa de email nu pare corectă.',
  trainingIntervalMonths: 'Periodicitatea depășește limita pentru categoria de personal.',
  capacity: 'Capacitatea nu se potrivește cu acest mijloc de stingere.',
  agent: 'Doar un stingător are agent de stingere.',
  wheeled: 'Doar un stingător poate fi pe roți.',
  count: 'Numărul de bucăți nu pare corect.',
  quantity: 'Cantitatea nu pare corectă.',
  durationMonths: `Durata de utilizare e ${durationRange}.`,
  kind: 'Felul locului de muncă nu a fost recunoscut. Alege-l din listă.',
  floorAreaM2: 'Suprafața utilă e un număr întreg de metri pătrați, de la 1 la 1.000.000.',
  extinguisherNorm: 'Norma de dotare nu a fost recunoscută. Alege-o din listă.',
  assemblyPoint: 'Punctul de adunare are între 2 și 240 de caractere.',
  combustibleMaterials: 'Textul are între 2 și 600 de caractere.',
  ignitionSources: 'Textul are între 2 și 600 de caractere.',
  fireRiskEquipment: 'Textul are între 2 și 600 de caractere.',
  specificMeasures: 'Textul are între 2 și 600 de caractere.',
  wasteKinds: 'Cel mult 12 tipuri de deșeuri, fiecare între 2 și 240 de caractere.',
  wasteCollectors: 'Textul are între 2 și 160 de caractere.',
};

const referenceNouns: Record<string, string> = {
  workplace: 'punctul de lucru',
  jobPosition: 'postul',
};

const isoDay = (iso: string) => iso.split('-').reverse().join('.');

/** What a check found, said for the specialist: by the names they see, never a path or an id. */
export function flagNote(flag: Flag, proposal: Proposal, changes: Changes): string {
  const parts = flag.path.split('.');
  const root = parts[0]!;
  const single = root === 'client' || root === 'trainingSchedule' || root === 'fireSafety';
  const field = single ? parts[1] : parts[2];
  switch (flag.code) {
    case 'file_not_found':
      return 'Fișierul citat nu este printre cele încărcate. Verifică valoarea în documente.';
    case 'quote_not_found':
      return 'Pasajul citat nu a fost găsit în fișier.';
    case 'value_not_in_quote':
      return 'Pasajul citat nu cuprinde această valoare. Verifică valoarea în documente.';
    case 'invalid_cui':
      return 'Numărul nu trece verificarea CUI.';
    case 'invalid_cnp':
      return 'CNP-ul nu trece verificarea cifrei de control.';
    case 'cnp_birth_date_mismatch':
      return flag.detail
        ? `CNP-ul arată altă dată a nașterii: ${isoDay(flag.detail)}.`
        : 'CNP-ul nu se potrivește cu data nașterii.';
    case 'value_not_allowed':
      if (field === 'durationMonths' && flag.detail === 'consumable') {
        return 'Un articol de consum nu are durată de utilizare.';
      }
      return (
        (field && notAllowed[field]) ??
        (single ? 'Valoarea iese din limitele permise.' : 'Valoarea nu e una dintre cele permise.')
      );
    case 'duplicate': {
      const [list, index] = (flag.detail ?? '').split('.') as [ItemList, string | undefined];
      const other = itemsOf(proposal, list)?.[Number(index)];
      const phrase = sameAs[list];
      if (!other || !phrase) return 'Pare să apară de două ori în propunere.';
      const values = { ...other, ...(changes.items[other.id]?.values ?? {}) };
      return `Pare să fie ${phrase} «${itemName(list, values)}».`;
    }
    case 'missing':
      return 'Lipsește din documente.';
    case 'unknown_reference': {
      const noun = referenceNouns[parts.at(-1) ?? ''] ?? 'elementul';
      return flag.detail
        ? `${noun[0]!.toUpperCase()}${noun.slice(1)} «${flag.detail}» nu se potrivește cu niciunul din propunere.`
        : `Alege ${noun}.`;
    }
    case 'cui_not_registered':
      return 'ANAF nu cunoaște acest CUI.';
    case 'legal_name_differs': {
      const cui = proposal.client.cui.options[0]?.value;
      return flag.detail && cui !== undefined
        ? anafMismatchNote({ cui: bareCui(cui), legalName: flag.detail, inactive: false })
        : 'Denumirea diferă de cea de la ANAF.';
    }
  }
}

const refusedRules: Record<string, string> = {
  job_position_equipment_duration_by_allocation:
    'un articol de inventar are durată de utilizare, unul de consum nu are',
  job_position_equipment_duration_range: `durata de utilizare e ${durationRange}`,
  job_position_equipment_quantity_range: 'cantitatea e între 1 și 999',
};

export function refusedValueMessage(issue: { path: string; message: string } | undefined) {
  const section = issue && sectionOfRoot[issue.path.split('.')[0] ?? ''];
  if (!issue || !section) {
    return 'Nu am putut salva o valoare din import. Verifică datele și încearcă din nou.';
  }
  const rule = refusedRules[issue.message];
  return `Nu am putut salva o valoare din secțiunea «${sectionLabels[section]}»${rule ? `: ${rule}` : ''}. Verifică secțiunea și încearcă din nou.`;
}

export function flagsAt(proposal: Proposal, prefix: string) {
  return proposal.flags.filter(
    (flag) => flag.path === prefix || flag.path.startsWith(`${prefix}.`)
  );
}

export function sourceFilesCount(sources: Source[]) {
  return new Set(sources.map((source) => source.file)).size;
}

export const changesOf = (changes: ImportDetail['changes']): Changes => ({
  fields: (changes?.fields ?? {}) as Changes['fields'],
  items: (changes?.items ?? {}) as Changes['items'],
});
