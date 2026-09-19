import { type CountyCode, countyCodes, romanianCounties } from '@ssm-usor/contracts';
import { z } from 'zod';

import type { WorkplaceListResponse, WorkplaceRequest } from '../api/generated/api';

export type Workplace = WorkplaceListResponse['items'][number];

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
});

export type WorkplaceFormValues = z.infer<typeof workplaceFormSchema>;

export const emptyWorkplaceForm: WorkplaceFormValues = {
  name: '',
  isRegisteredOffice: false,
  countyCode: '',
  locality: '',
  addressLine: '',
};

export function toWorkplaceForm(workplace: Workplace): WorkplaceFormValues {
  return {
    name: workplace.name,
    isRegisteredOffice: workplace.isRegisteredOffice,
    countyCode: workplace.countyCode ?? '',
    locality: workplace.locality ?? '',
    addressLine: workplace.addressLine ?? '',
  };
}

export function toWorkplaceRequest(values: WorkplaceFormValues): WorkplaceRequest {
  return {
    name: values.name,
    isRegisteredOffice: values.isRegisteredOffice,
    countyCode: values.countyCode ? (values.countyCode as CountyCode) : null,
    locality: values.locality || null,
    addressLine: values.addressLine || null,
  };
}

const countyNames = new Map<string, string>(
  romanianCounties.map((county) => [county.code, county.name])
);

export function workplaceAddress(workplace: Workplace) {
  const county = workplace.countyCode ? countyNames.get(workplace.countyCode) : null;
  return [workplace.addressLine, workplace.locality, county].filter(Boolean).join(', ');
}
