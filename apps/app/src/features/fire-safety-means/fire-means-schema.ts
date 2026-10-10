import {
  extinguisherCode,
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
} from '@ssm-usor/contracts';
import { z } from 'zod';

import type {
  FireEquipmentListResponse,
  FireEquipmentRequest,
  FireInstallationListResponse,
  FireInstallationRequest,
} from '@/api/generated/api';

export type FireEquipment = FireEquipmentListResponse['items'][number];
export type FireInstallation = FireInstallationListResponse['items'][number];

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

// Annex 6 is orientative, so this is a hint beside the count and never a warning.
export function extinguisherHint(
  count: number,
  workplace: { floorAreaM2: number | null; extinguisherNorm: FireExtinguisherNorm | null }
) {
  const { floorAreaM2, extinguisherNorm } = workplace;
  if (floorAreaM2 === null || extinguisherNorm === null) return null;
  const minimum = minimumExtinguishers(floorAreaM2, extinguisherNorm);
  return minimum === null
    ? `${extinguisherCountLabel(count)} · cel puțin unul pe nivel (anexa 6)`
    : `${extinguisherCountLabel(count)} · minim orientativ ${minimum} (anexa 6)`;
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
