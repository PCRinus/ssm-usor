import {
  type CountyCode,
  countyCodes,
  formatIban,
  isValidCuiInput,
  isValidIban,
} from '@ssm-usor/contracts';
import { z } from 'zod';

import type {
  OrganizationCompanyDetailsResponse,
  UpdateOrganizationCompanyDetailsRequest,
} from '../api/generated/api';
import { optionalText, textOrNull } from './optional-text';

type CompanyDetails = OrganizationCompanyDetailsResponse['companyDetails'];

export const companyDetailsFormSchema = z.object({
  cui: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || isValidCuiInput(value),
      'CUI invalid. Verifică cifrele și cifra de control.'
    ),
  vatPayer: z.boolean(),
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
  phone: optionalText(
    5,
    20,
    'Telefonul are cel puțin 5 caractere.',
    'Telefonul are cel mult 20 de caractere.'
  ),
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
  iban: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || isValidIban(value),
      'IBAN invalid. Verifică literele și cifrele.'
    ),
  bankName: optionalText(
    2,
    120,
    'Numele băncii are cel puțin 2 caractere.',
    'Numele băncii are cel mult 120 de caractere.'
  ),
});

export type CompanyDetailsFormValues = z.infer<typeof companyDetailsFormSchema>;

export function toCompanyDetailsForm(details: CompanyDetails): CompanyDetailsFormValues {
  return {
    cui: details.cui ?? '',
    vatPayer: details.vatPayer,
    legalName: details.legalName ?? '',
    tradeRegisterNumber: details.tradeRegisterNumber ?? '',
    countyCode: details.countyCode ?? '',
    locality: details.locality ?? '',
    addressLine: details.addressLine ?? '',
    phone: details.phone ?? '',
    legalRepresentativeName: details.legalRepresentativeName ?? '',
    legalRepresentativeRole: details.legalRepresentativeRole ?? '',
    iban: details.iban ? formatIban(details.iban) : '',
    bankName: details.bankName ?? '',
  };
}

// The route replaces every field, so an emptied input clears what was saved.
export function toCompanyDetailsRequest(
  values: CompanyDetailsFormValues
): UpdateOrganizationCompanyDetailsRequest {
  return {
    cui: textOrNull(values.cui),
    vatPayer: values.vatPayer,
    legalName: textOrNull(values.legalName),
    tradeRegisterNumber: textOrNull(values.tradeRegisterNumber),
    countyCode: values.countyCode ? (values.countyCode as CountyCode) : null,
    locality: textOrNull(values.locality),
    addressLine: textOrNull(values.addressLine),
    phone: textOrNull(values.phone),
    legalRepresentativeName: textOrNull(values.legalRepresentativeName),
    legalRepresentativeRole: textOrNull(values.legalRepresentativeRole),
    iban: textOrNull(values.iban),
    bankName: textOrNull(values.bankName),
  };
}
