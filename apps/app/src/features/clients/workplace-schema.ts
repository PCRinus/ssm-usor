import {
  type CountyCode,
  countyCodes,
  type FireExtinguisherNorm,
  fireExtinguisherNorms,
  romanianCounties,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import type { WorkplaceListResponse, WorkplaceRequest } from '@/api/generated/api';

export type Workplace = WorkplaceListResponse['items'][number];

const optionalText = (max: number, what: string) =>
  z
    .string()
    .trim()
    .max(max, `${what} are cel mult ${max} de caractere.`)
    .refine(
      (value) => value.length === 0 || value.length >= 2,
      `${what} are cel puțin 2 caractere.`
    );

// Form values are strings so inputs stay controlled; the API request is derived on submit.
export const workplaceFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Introdu denumirea (cel puțin 2 caractere).')
    .max(160, 'Denumirea are cel mult 160 de caractere.'),
  isRegisteredOffice: z.boolean(),
  countyCode: z
    .string()
    .refine(
      (value) => value === '' || (countyCodes as readonly string[]).includes(value),
      'Alege un județ din listă.'
    ),
  locality: z.string().trim().max(120, 'Localitatea are cel mult 120 de caractere.'),
  addressLine: z.string().trim().max(240, 'Adresa are cel mult 240 de caractere.'),
  activity: optionalText(160, 'Activitatea'),
  floorAreaM2: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === '' ||
        (/^[0-9]+$/.test(value) && Number(value) >= 1 && Number(value) <= 1_000_000),
      'Introdu suprafața în metri pătrați, un număr întreg de la 1 la 1.000.000.'
    ),
  extinguisherNorm: z
    .string()
    .refine(
      (value) => value === '' || (fireExtinguisherNorms as readonly string[]).includes(value),
      'Alege o normă din listă.'
    ),
  assemblyPoint: optionalText(240, 'Punctul de adunare'),
  combustibleMaterials: optionalText(600, 'Textul'),
  ignitionSources: optionalText(600, 'Textul'),
  fireRiskEquipment: optionalText(600, 'Textul'),
  specificMeasures: optionalText(600, 'Textul'),
});

export type WorkplaceFormValues = z.infer<typeof workplaceFormSchema>;

export const emptyWorkplaceForm: WorkplaceFormValues = {
  name: '',
  isRegisteredOffice: false,
  countyCode: '',
  locality: '',
  addressLine: '',
  activity: '',
  floorAreaM2: '',
  extinguisherNorm: '',
  assemblyPoint: '',
  combustibleMaterials: '',
  ignitionSources: '',
  fireRiskEquipment: '',
  specificMeasures: '',
};

export function toWorkplaceForm(workplace: Workplace): WorkplaceFormValues {
  return {
    name: workplace.name,
    isRegisteredOffice: workplace.isRegisteredOffice,
    countyCode: workplace.countyCode ?? '',
    locality: workplace.locality ?? '',
    addressLine: workplace.addressLine ?? '',
    activity: workplace.activity ?? '',
    floorAreaM2: workplace.floorAreaM2?.toString() ?? '',
    extinguisherNorm: workplace.extinguisherNorm ?? '',
    assemblyPoint: workplace.assemblyPoint ?? '',
    combustibleMaterials: workplace.combustibleMaterials ?? '',
    ignitionSources: workplace.ignitionSources ?? '',
    fireRiskEquipment: workplace.fireRiskEquipment ?? '',
    specificMeasures: workplace.specificMeasures ?? '',
  };
}

export function toWorkplaceRequest(values: WorkplaceFormValues): WorkplaceRequest {
  return {
    name: values.name,
    isRegisteredOffice: values.isRegisteredOffice,
    countyCode: values.countyCode ? (values.countyCode as CountyCode) : null,
    locality: values.locality || null,
    addressLine: values.addressLine || null,
    activity: values.activity || null,
    floorAreaM2: values.floorAreaM2 ? Number(values.floorAreaM2) : null,
    extinguisherNorm: (values.extinguisherNorm || null) as FireExtinguisherNorm | null,
    assemblyPoint: values.assemblyPoint || null,
    combustibleMaterials: values.combustibleMaterials || null,
    ignitionSources: values.ignitionSources || null,
    fireRiskEquipment: values.fireRiskEquipment || null,
    specificMeasures: values.specificMeasures || null,
  };
}

// The route replaces the whole row, so a change made outside the dialog sends the rest as saved.
export const workplaceRequestOf = (workplace: Workplace) =>
  toWorkplaceRequest(toWorkplaceForm(workplace));

// What generating the fire-safety set asks of every workplace (ADR 018), in the dialog's order;
// the specific measures are optional.
const requiredFireFields = [
  ['activity', 'workplace-activity'],
  ['floorAreaM2', 'workplace-floor-area'],
  ['extinguisherNorm', 'workplace-norm'],
  ['assemblyPoint', 'workplace-assembly-point'],
  ['combustibleMaterials', 'workplace-combustible-materials'],
  ['ignitionSources', 'workplace-ignition-sources'],
  ['fireRiskEquipment', 'workplace-fire-risk-equipment'],
] as const satisfies readonly (readonly [keyof Workplace, string])[];

export function firstMissingFireField(workplace: Workplace) {
  return requiredFireFields.find(([field]) => workplace[field] === null)?.[1] ?? null;
}

const countyNames = new Map<string, string>(
  romanianCounties.map((county) => [county.code, county.name])
);

type Address = Pick<Workplace, 'countyCode' | 'locality' | 'addressLine'>;

// The registered office as the client's own data has it, when the workplace reads differently.
// Only what the client has filled in counts: an address line it lacks is not a disagreement,
// and adopting must not blank the workplace's.
export function differingClientAddress(workplace: Workplace, client: Address): Address | null {
  if (!workplace.isRegisteredOffice) return null;
  const parts = ['countyCode', 'locality', 'addressLine'] as const;
  const differs = parts.some(
    (part) => client[part] && client[part].trim() !== (workplace[part] ?? '').trim()
  );
  if (!differs) return null;
  return {
    countyCode: client.countyCode ?? workplace.countyCode,
    locality: client.locality ?? workplace.locality,
    addressLine: client.addressLine ?? workplace.addressLine,
  };
}

export function workplaceAddress(workplace: Address) {
  const county = workplace.countyCode ? countyNames.get(workplace.countyCode) : null;
  return [workplace.addressLine, workplace.locality, county].filter(Boolean).join(', ');
}
