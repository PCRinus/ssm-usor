import {
  extinguisherCode,
  type FireBuildingClassification,
  fireBuildingClassifications,
  type FireEquipmentKind,
  fireEquipmentKindLabels,
  fireEquipmentKinds,
  type FireExtinguisherNorm,
  type FireExtinguishingAgent,
  fireExtinguishingAgentLabels,
  fireExtinguishingAgents,
  type FireInstallationKind,
  fireInstallationKinds,
  minimumExtinguishers,
  workplaceHasAreaAndNorm,
  type WorkplaceKind,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import type {
  FireBuildingListResponse,
  FireBuildingRequest,
  FireEquipmentListResponse,
  FireEquipmentRequest,
  FireInstallationListResponse,
  FireInstallationRequest,
  FireMaintenanceItemListResponse,
  FireMaintenanceItemRequest,
} from '@/api/generated/api';

export type FireEquipment = FireEquipmentListResponse['items'][number];
export type FireInstallation = FireInstallationListResponse['items'][number];
export type FireMaintenanceItem = FireMaintenanceItemListResponse['items'][number];
export type FireBuilding = FireBuildingListResponse['items'][number];

export const equipmentAddId = (workplaceId: string) => `fire-equipment-add-${workplaceId}`;

// Powder, CO₂ and clean agents are filled by weight, foam and water by volume.
export const capacityUnits: Record<FireExtinguishingAgent, string> = {
  powder: 'kg',
  co2: 'kg',
  foam: 'l',
  water: 'l',
  clean_agent: 'kg',
};

/** "Pulbere, 6 kg": what the code stands for. */
export function extinguisherContents(agent: FireExtinguishingAgent, capacity: number) {
  return `${fireExtinguishingAgentLabels[agent]}, ${capacity} ${capacityUnits[agent]}`;
}

export function unitTitle(unit: Pick<FireEquipment, 'kind' | 'agent' | 'capacity'>) {
  return unit.kind === 'extinguisher' && unit.agent && unit.capacity !== null
    ? `Stingător ${extinguisherCode(unit.agent, unit.capacity)}`
    : fireEquipmentKindLabels[unit.kind];
}

/** "Niciun stingător", "1 stingător", "3 stingătoare", "20 de stingătoare". */
export function extinguisherCountLabel(count: number) {
  if (count === 0) return 'Niciun stingător';
  if (count === 1) return '1 stingător';
  const tens = count % 100;
  return tens === 0 || tens >= 20 ? `${count} de stingătoare` : `${count} stingătoare`;
}

const annexSix = 'anexa 6 la Normele generale PSI (OMAI 163/2007)';

// Annex 6 is orientative, so this is a hint beside the count and never a warning.
export function extinguisherHint(
  count: number,
  workplace: {
    kind: WorkplaceKind;
    floorAreaM2: number | null;
    extinguisherNorm: FireExtinguisherNorm | null;
  }
) {
  const { kind, floorAreaM2, extinguisherNorm } = workplace;
  if (!workplaceHasAreaAndNorm(kind) || extinguisherNorm === 'none') {
    return `${extinguisherCountLabel(count)} · fără normă după ${annexSix}`;
  }
  if (floorAreaM2 === null || extinguisherNorm === null) return null;
  const minimum = minimumExtinguishers(floorAreaM2, extinguisherNorm);
  return minimum === null
    ? `${extinguisherCountLabel(count)} · cel puțin unul pe nivel după ${annexSix}`
    : `${extinguisherCountLabel(count)} · minim orientativ ${minimum} după ${annexSix}`;
}

const optionalText = (min: number, max: number, what: string) =>
  z
    .string()
    .trim()
    .max(max, `${what} are cel mult ${max} de caractere.`)
    .refine(
      (value) => value.length === 0 || value.length >= min,
      `${what} are cel puțin ${min} caractere.`
    );

const isoDate = z.string();

const laterThan = (last: string, next: string) => last === '' || next === '' || last <= next;

// Form values are strings so inputs stay controlled; the API request is derived on submit.
export const equipmentFormSchema = z
  .object({
    workplaceId: z.string().min(1, 'Alege locul de muncă.'),
    kind: z.enum(fireEquipmentKinds),
    agent: z.string(),
    capacity: z.string().trim(),
    wheeled: z.boolean(),
    label: optionalText(1, 80, 'Numărul de inventar'),
    location: optionalText(2, 160, 'Amplasamentul'),
    manufacturedYear: z
      .string()
      .trim()
      .refine(
        (value) =>
          value === '' ||
          (/^[0-9]{4}$/.test(value) && Number(value) >= 1990 && Number(value) <= 2100),
        'Introdu un an între 1990 și 2100.'
      ),
    lastServiceOn: isoDate,
    nextServiceOn: isoDate,
    maintainer: optionalText(2, 160, 'Denumirea firmei'),
  })
  .superRefine((values, context) => {
    if (!laterThan(values.lastServiceOn, values.nextServiceOn)) {
      context.addIssue({
        code: 'custom',
        path: ['nextServiceOn'],
        message: 'Următorul service nu poate fi înaintea ultimului.',
      });
    }
    if (values.kind !== 'extinguisher') return;
    if (!(fireExtinguishingAgents as readonly string[]).includes(values.agent)) {
      context.addIssue({
        code: 'custom',
        path: ['agent'],
        message: 'Alege agentul de stingere.',
      });
    }
    const capacity = Number(values.capacity);
    if (!/^[0-9]+$/.test(values.capacity) || capacity < 1 || capacity > 250) {
      context.addIssue({
        code: 'custom',
        path: ['capacity'],
        message: 'Introdu capacitatea, un număr întreg de la 1 la 250.',
      });
    }
  });

export type EquipmentFormValues = z.infer<typeof equipmentFormSchema>;

export function newEquipmentForm(workplaceId: string): EquipmentFormValues {
  return {
    workplaceId,
    kind: 'extinguisher',
    agent: '',
    capacity: '',
    wheeled: false,
    label: '',
    location: '',
    manufacturedYear: '',
    lastServiceOn: '',
    nextServiceOn: '',
    maintainer: '',
  };
}

export function toEquipmentForm(unit: FireEquipment): EquipmentFormValues {
  return {
    workplaceId: unit.workplaceId,
    kind: unit.kind,
    agent: unit.agent ?? '',
    capacity: unit.capacity?.toString() ?? '',
    wheeled: unit.wheeled,
    label: unit.label ?? '',
    location: unit.location ?? '',
    manufacturedYear: unit.manufacturedYear?.toString() ?? '',
    lastServiceOn: unit.lastServiceOn ?? '',
    nextServiceOn: unit.nextServiceOn ?? '',
    maintainer: unit.maintainer ?? '',
  };
}

export function toEquipmentRequest(values: EquipmentFormValues): FireEquipmentRequest {
  const extinguisher = values.kind === 'extinguisher';
  return {
    workplaceId: values.workplaceId,
    kind: values.kind as FireEquipmentKind,
    agent: extinguisher ? (values.agent as FireExtinguishingAgent) : null,
    capacity: extinguisher ? Number(values.capacity) : null,
    wheeled: extinguisher && values.wheeled,
    label: values.label || null,
    location: values.location || null,
    manufacturedYear: values.manufacturedYear ? Number(values.manufacturedYear) : null,
    lastServiceOn: values.lastServiceOn || null,
    nextServiceOn: values.nextServiceOn || null,
    maintainer: values.maintainer || null,
  };
}

export const installationFormSchema = z
  .object({
    workplaceId: z.string().min(1, 'Alege locul de muncă.'),
    kind: z
      .string()
      .refine(
        (value) => (fireInstallationKinds as readonly string[]).includes(value),
        'Alege tipul instalației.'
      ),
    description: optionalText(2, 240, 'Descrierea'),
    maintainer: optionalText(2, 160, 'Denumirea firmei'),
    lastCheckOn: isoDate,
    nextCheckOn: isoDate,
  })
  .superRefine((values, context) => {
    if (values.kind === 'other' && values.description === '') {
      context.addIssue({
        code: 'custom',
        path: ['description'],
        message: 'Descrie instalația.',
      });
    }
    if (!laterThan(values.lastCheckOn, values.nextCheckOn)) {
      context.addIssue({
        code: 'custom',
        path: ['nextCheckOn'],
        message: 'Următoarea verificare nu poate fi înaintea ultimei.',
      });
    }
  });

export type InstallationFormValues = z.infer<typeof installationFormSchema>;

export function newInstallationForm(workplaceId: string): InstallationFormValues {
  return {
    workplaceId,
    kind: '',
    description: '',
    maintainer: '',
    lastCheckOn: '',
    nextCheckOn: '',
  };
}

export function toInstallationForm(installation: FireInstallation): InstallationFormValues {
  return {
    workplaceId: installation.workplaceId,
    kind: installation.kind,
    description: installation.description ?? '',
    maintainer: installation.maintainer ?? '',
    lastCheckOn: installation.lastCheckOn ?? '',
    nextCheckOn: installation.nextCheckOn ?? '',
  };
}

export function toInstallationRequest(values: InstallationFormValues): FireInstallationRequest {
  return {
    workplaceId: values.workplaceId,
    kind: values.kind as FireInstallationKind,
    description: values.description || null,
    maintainer: values.maintainer || null,
    lastCheckOn: values.lastCheckOn || null,
    nextCheckOn: values.nextCheckOn || null,
  };
}

const requiredText = (min: number, max: number, empty: string, what: string) =>
  z
    .string()
    .trim()
    .min(1, empty)
    .min(min, `${what} are cel puțin ${min} caractere.`)
    .max(max, `${what} are cel mult ${max} de caractere.`);

export const maintenanceItemFormSchema = z.object({
  workplaceId: z.string().min(1, 'Alege locul de muncă.'),
  subject: requiredText(2, 160, 'Scrie ce se verifică.', 'Descrierea'),
  intervalLabel: requiredText(2, 60, 'Scrie cât de des se verifică.', 'Periodicitatea'),
  checkedBy: requiredText(2, 160, 'Scrie cine efectuează verificarea.', 'Numele'),
});

export type MaintenanceItemFormValues = z.infer<typeof maintenanceItemFormSchema>;

export function newMaintenanceItemForm(workplaceId: string): MaintenanceItemFormValues {
  return { workplaceId, subject: '', intervalLabel: '', checkedBy: '' };
}

export function toMaintenanceItemForm(item: FireMaintenanceItem): MaintenanceItemFormValues {
  return {
    workplaceId: item.workplaceId,
    subject: item.subject,
    intervalLabel: item.intervalLabel,
    checkedBy: item.checkedBy,
  };
}

export function toMaintenanceItemRequest(
  values: MaintenanceItemFormValues
): FireMaintenanceItemRequest {
  return {
    workplaceId: values.workplaceId,
    subject: values.subject,
    intervalLabel: values.intervalLabel,
    checkedBy: values.checkedBy,
  };
}

// Romanian writes the decimal comma; "412,5" and "412.5" are the same area.
const decimalText = /^[0-9]{1,8}([.,][0-9]{1,2})?$/;
const parsedDecimal = (value: string) => Number(value.replace(',', '.'));

export const buildingFormSchema = z.object({
  yearBuilt: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === '' ||
        (/^[0-9]{4}$/.test(value) &&
          Number(value) >= 1800 &&
          Number(value) <= new Date().getFullYear()),
      `Introdu un an între 1800 și ${new Date().getFullYear()}.`
    ),
  builtAreaM2: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || (decimalText.test(value) && parsedDecimal(value) > 0),
      'Introdu suprafața în m², de exemplu 412,5.'
    ),
  levels: optionalText(1, 40, 'Regimul de înălțime'),
  classification: z.string(),
  structure: optionalText(2, 120, 'Structura'),
  heatingFuel: optionalText(2, 80, 'Combustibilul'),
  gasUse: optionalText(2, 120, 'Utilizarea gazelor'),
  electricalMaintainer: optionalText(2, 160, 'Denumirea firmei'),
  electricalLastCheckOn: isoDate,
  waterReserveM3: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || decimalText.test(value),
      'Introdu rezerva în m³, de exemplu 54 sau 0.'
    ),
  notes: optionalText(2, 1000, 'Observațiile'),
});

export type BuildingFormValues = z.infer<typeof buildingFormSchema>;

export function toBuildingForm(building: FireBuilding | null): BuildingFormValues {
  const decimal = (value: number | null | undefined) =>
    value == null ? '' : String(value).replace('.', ',');
  return {
    yearBuilt: building?.yearBuilt?.toString() ?? '',
    builtAreaM2: decimal(building?.builtAreaM2),
    levels: building?.levels ?? '',
    classification: building?.classification ?? '',
    structure: building?.structure ?? '',
    heatingFuel: building?.heatingFuel ?? '',
    gasUse: building?.gasUse ?? '',
    electricalMaintainer: building?.electricalMaintainer ?? '',
    electricalLastCheckOn: building?.electricalLastCheckOn ?? '',
    waterReserveM3: decimal(building?.waterReserveM3),
    notes: building?.notes ?? '',
  };
}

export function toBuildingRequest(values: BuildingFormValues): FireBuildingRequest {
  return {
    yearBuilt: values.yearBuilt ? Number(values.yearBuilt) : null,
    builtAreaM2: values.builtAreaM2 ? parsedDecimal(values.builtAreaM2) : null,
    levels: values.levels || null,
    classification: (fireBuildingClassifications as readonly string[]).includes(
      values.classification
    )
      ? (values.classification as FireBuildingClassification)
      : null,
    structure: values.structure || null,
    heatingFuel: values.heatingFuel || null,
    gasUse: values.gasUse || null,
    electricalMaintainer: values.electricalMaintainer || null,
    electricalLastCheckOn: values.electricalLastCheckOn || null,
    waterReserveM3: values.waterReserveM3 ? parsedDecimal(values.waterReserveM3) : null,
    notes: values.notes || null,
  };
}

export const buildingIsEmpty = (building: FireBuildingRequest) =>
  Object.values(building).every((value) => value === null || value === undefined);
