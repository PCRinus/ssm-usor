import { type CountyCode, countyCodes, isValidCuiInput, normalizeCui } from '@ssm-usor/contracts';
import { z } from 'zod';

import type { CreateClientRequest } from '../api/generated/api';

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
};

const textOrNull = (value: string) => (value ? value : null);

export function toCreateClientRequest(values: ClientFormValues): CreateClientRequest {
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
    declaredEmployeeCount: values.declaredEmployeeCount
      ? Number(values.declaredEmployeeCount)
      : null,
  };
}
