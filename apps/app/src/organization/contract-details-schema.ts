import { formatIban, isValidIban } from '@ssm-usor/contracts';
import { z } from 'zod';

import type {
  OrganizationContractDetailsResponse,
  UpdateOrganizationContractDetailsRequest,
} from '../api/generated/api';

type ContractDetails = OrganizationContractDetailsResponse['contractDetails'];

// Form values are strings so inputs stay controlled; the API request is derived on submit.
// Everything is optional here: generating a contract is what asks for it.
const optionalText = (min: number, max: number, tooShort: string, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .refine((value) => value.length === 0 || value.length >= min, tooShort);

export const contractDetailsFormSchema = z.object({
  phone: optionalText(
    5,
    20,
    'Telefonul are cel puțin 5 caractere.',
    'Telefonul are cel mult 20 de caractere.'
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
  authorizationCertificateNumber: optionalText(1, 40, '', 'Numărul are cel mult 40 de caractere.'),
  authorizationCertificateDate: z.string(),
  authorizationCertificateIssuer: optionalText(
    2,
    200,
    'Emitentul are cel puțin 2 caractere.',
    'Emitentul are cel mult 200 de caractere.'
  ),
  vatPayer: z.boolean(),
  fireSafetyTechnicianName: optionalText(
    2,
    160,
    'Numele are cel puțin 2 caractere.',
    'Numele are cel mult 160 de caractere.'
  ),
  fireSafetyTechnicianCertificate: optionalText(
    1,
    80,
    '',
    'Certificatul are cel mult 80 de caractere.'
  ),
});

export type ContractDetailsFormValues = z.infer<typeof contractDetailsFormSchema>;

export function toContractDetailsForm(details: ContractDetails): ContractDetailsFormValues {
  return {
    phone: details.phone ?? '',
    iban: details.iban ? formatIban(details.iban) : '',
    bankName: details.bankName ?? '',
    authorizationCertificateNumber: details.authorizationCertificateNumber ?? '',
    authorizationCertificateDate: details.authorizationCertificateDate ?? '',
    authorizationCertificateIssuer: details.authorizationCertificateIssuer ?? '',
    vatPayer: details.vatPayer,
    fireSafetyTechnicianName: details.fireSafetyTechnicianName ?? '',
    fireSafetyTechnicianCertificate: details.fireSafetyTechnicianCertificate ?? '',
  };
}

const textOrNull = (value: string) => (value ? value : null);

// The route replaces every field, so an emptied input clears what was saved.
export function toContractDetailsRequest(
  values: ContractDetailsFormValues
): UpdateOrganizationContractDetailsRequest {
  return {
    phone: textOrNull(values.phone),
    iban: textOrNull(values.iban),
    bankName: textOrNull(values.bankName),
    authorizationCertificateNumber: textOrNull(values.authorizationCertificateNumber),
    authorizationCertificateDate: textOrNull(values.authorizationCertificateDate),
    authorizationCertificateIssuer: textOrNull(values.authorizationCertificateIssuer),
    vatPayer: values.vatPayer,
    fireSafetyTechnicianName: textOrNull(values.fireSafetyTechnicianName),
    fireSafetyTechnicianCertificate: textOrNull(values.fireSafetyTechnicianCertificate),
  };
}
