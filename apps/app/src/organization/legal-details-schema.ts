import { type CountyCode, countyCodes, isValidCuiInput } from '@ssm-usor/contracts';
import { z } from 'zod';

import type {
  OrganizationLegalDetailsResponse,
  UpdateOrganizationLegalDetailsRequest,
} from '../api/generated/api';

type LegalDetails = OrganizationLegalDetailsResponse['legalDetails'];

// Form values are strings so inputs stay controlled; the API request is derived on submit.
// Everything is optional here: generating a document is what asks for it.
const optionalText = (min: number, max: number, tooShort: string, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .refine((value) => value.length === 0 || value.length >= min, tooShort);

export const legalDetailsFormSchema = z.object({
  cui: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || isValidCuiInput(value),
      'CUI invalid. Verifică cifrele și cifra de control.'
    ),
  legalName: optionalText(
    2,
    200,
    'Denumirea are cel puțin 2 caractere.',
    'Denumirea poate avea cel mult 200 de caractere.'
  ),
  tradeRegisterNumber: optionalText(
    1,
    40,
    '',
    'Numărul de înregistrare are cel mult 40 de caractere.'
  ),
  countyCode: z
    .string()
    .refine(
      (value) => value === '' || (countyCodes as readonly string[]).includes(value),
      'Alege un județ din listă.'
    ),
  locality: optionalText(1, 120, '', 'Localitatea are cel mult 120 de caractere.'),
  addressLine: optionalText(1, 240, '', 'Adresa are cel mult 240 de caractere.'),
  legalRepresentativeName: optionalText(
    2,
    160,
    'Numele are cel puțin 2 caractere.',
    'Numele are cel mult 160 de caractere.'
  ),
  legalRepresentativeRole: optionalText(
    2,
    80,
    'Funcția are cel puțin 2 caractere.',
    'Funcția are cel mult 80 de caractere.'
  ),
});

export type LegalDetailsFormValues = z.infer<typeof legalDetailsFormSchema>;

export function toLegalDetailsForm(details: LegalDetails): LegalDetailsFormValues {
  return {
    cui: details.cui ?? '',
    legalName: details.legalName ?? '',
    tradeRegisterNumber: details.tradeRegisterNumber ?? '',
    countyCode: details.countyCode ?? '',
    locality: details.locality ?? '',
    addressLine: details.addressLine ?? '',
    legalRepresentativeName: details.legalRepresentativeName ?? '',
    legalRepresentativeRole: details.legalRepresentativeRole ?? '',
  };
}

const textOrNull = (value: string) => (value ? value : null);

// The route replaces every field, so an emptied input clears what was saved.
export function toLegalDetailsRequest(
  values: LegalDetailsFormValues
): UpdateOrganizationLegalDetailsRequest {
  return {
    cui: textOrNull(values.cui),
    legalName: textOrNull(values.legalName),
    tradeRegisterNumber: textOrNull(values.tradeRegisterNumber),
    countyCode: values.countyCode ? (values.countyCode as CountyCode) : null,
    locality: textOrNull(values.locality),
    addressLine: textOrNull(values.addressLine),
    legalRepresentativeName: textOrNull(values.legalRepresentativeName),
    legalRepresentativeRole: textOrNull(values.legalRepresentativeRole),
  };
}
