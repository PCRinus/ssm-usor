import { type CountyCode, countyCodes, isValidCuiInput, normalizeCui } from '@ssm-usor/contracts';
import { z } from 'zod';

import type {
  ClientResponse,
  CreateClientRequest,
  UpdateClientRequest,
} from '../api/generated/api';

export type Client = ClientResponse['client'];
export type ClientStage = Client['stage'];

// Form values are strings so inputs stay controlled; the API request is derived on submit.
const optionalText = (max: number, message: string) => z.string().trim().max(max, message);

export const clientFormSchema = z.object({
  cui: z
    .string()
    .trim()
    .min(1, 'Introdu codul CUI.')
    .refine(isValidCuiInput, 'CUI invalid. Verifică cifrele și cifra de control.'),
  vatPayer: z.boolean(),
  legalName: z
    .string()
    .trim()
    .min(2, 'Introdu denumirea companiei (cel puțin 2 caractere).')
    .max(200, 'Denumirea poate avea cel mult 200 de caractere.'),
  caenCode: z
    .string()
    .trim()
    .regex(/^([0-9]{4})?$/, 'Codul CAEN are exact patru cifre.'),
  tradeRegisterNumber: optionalText(40, 'Numărul de înregistrare are cel mult 40 de caractere.'),
  countyCode: z
    .string()
    .refine(
      (value) => value === '' || (countyCodes as readonly string[]).includes(value),
      'Alege un județ din listă.'
    ),
  locality: optionalText(120, 'Localitatea are cel mult 120 de caractere.'),
  addressLine: optionalText(240, 'Adresa are cel mult 240 de caractere.'),
  legalRepresentativeName: optionalText(160, 'Numele are cel mult 160 de caractere.').refine(
    (value) => value.length === 0 || value.length >= 2,
    'Numele reprezentantului are cel puțin 2 caractere.'
  ),
  declaredEmployeeCount: z
    .string()
    .trim()
    .regex(/^[0-9]{0,7}$/, 'Introdu un număr întreg de angajați.'),
  contactName: optionalText(160, 'Numele are cel mult 160 de caractere.').refine(
    (value) => value.length === 0 || value.length >= 2,
    'Numele persoanei de contact are cel puțin 2 caractere.'
  ),
  contactEmail: z
    .string()
    .trim()
    .max(254, 'Adresa de email are cel mult 254 de caractere.')
    .refine(
      (value) => value === '' || z.email().safeParse(value).success,
      'Introdu o adresă de email validă.'
    ),
  contactPhone: optionalText(20, 'Telefonul are cel mult 20 de caractere.').refine(
    (value) => value.length === 0 || value.length >= 5,
    'Telefonul are cel puțin 5 caractere.'
  ),
});

export type ClientFormValues = z.infer<typeof clientFormSchema>;

export const emptyClientForm: ClientFormValues = {
  cui: '',
  vatPayer: false,
  legalName: '',
  caenCode: '',
  tradeRegisterNumber: '',
  countyCode: '',
  locality: '',
  addressLine: '',
  legalRepresentativeName: '',
  declaredEmployeeCount: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
};

const textOrNull = (value: string) => (value ? value : null);

export function toCreateClientRequest(
  values: ClientFormValues,
  stage: ClientStage = 'client'
): CreateClientRequest {
  // Validation guarantees a well-formed CUI; the RO prefix also means VAT registration.
  const { cui, vatPrefix } = normalizeCui(values.cui)!;
  return {
    legalName: values.legalName,
    cui,
    vatPayer: values.vatPayer || vatPrefix,
    caenCode: textOrNull(values.caenCode),
    tradeRegisterNumber: textOrNull(values.tradeRegisterNumber),
    countyCode: values.countyCode ? (values.countyCode as CountyCode) : null,
    locality: textOrNull(values.locality),
    addressLine: textOrNull(values.addressLine),
    legalRepresentativeName: textOrNull(values.legalRepresentativeName),
    // Only a lead declares a headcount; a client has its employee list (ADR 010).
    ...(stage === 'lead' && {
      declaredEmployeeCount: values.declaredEmployeeCount
        ? Number(values.declaredEmployeeCount)
        : null,
    }),
    contactName: textOrNull(values.contactName),
    contactEmail: textOrNull(values.contactEmail),
    contactPhone: textOrNull(values.contactPhone),
    stage,
  };
}

export function toUpdateClientRequest(
  values: ClientFormValues,
  stage: ClientStage
): UpdateClientRequest {
  const request: Partial<CreateClientRequest> = toCreateClientRequest(values, stage);
  delete request.legalRepresentativeName;
  delete request.stage;
  return request as UpdateClientRequest;
}

export function toClientForm(client: Client): ClientFormValues {
  return {
    cui: client.cui,
    vatPayer: client.vatPayer,
    legalName: client.legalName,
    caenCode: client.caenCode ?? '',
    tradeRegisterNumber: client.tradeRegisterNumber ?? '',
    countyCode: client.countyCode ?? '',
    locality: client.locality ?? '',
    addressLine: client.addressLine ?? '',
    legalRepresentativeName: client.legalRepresentativeName ?? '',
    declaredEmployeeCount: client.declaredEmployeeCount?.toString() ?? '',
    contactName: client.contactName ?? '',
    contactEmail: client.contactEmail ?? '',
    contactPhone: client.contactPhone ?? '',
  };
}
