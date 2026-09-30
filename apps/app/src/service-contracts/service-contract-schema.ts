import { z } from 'zod';

import type { SaveServiceContractRequest, ServiceContractResponse } from '@/api/generated/api';

// Form values are strings so inputs stay controlled; the API request is derived on submit.
export const serviceContractFormSchema = z
  .object({
    contractNumber: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]{0,5}$/, 'Introdu numărul contractului, din registrul tău.'),
    contractDate: z.string().min(1, 'Alege data contractului.'),
    startDate: z.string().min(1, 'Alege data de la care începe contractul.'),
    durationMonths: z
      .string()
      .trim()
      .regex(/^([1-9]|[1-9][0-9]|1[01][0-9]|120)$/, 'Durata este între 1 și 120 de luni.'),
    renewsAutomatically: z.boolean(),
    coversOccupationalSafety: z.boolean(),
    coversFireSafety: z.boolean(),
    clientRepresentativeName: z
      .string()
      .trim()
      .max(160, 'Numele are cel mult 160 de caractere.')
      .refine(
        (value) => value.length === 0 || value.length >= 2,
        'Numele are cel puțin 2 caractere.'
      ),
    clientRepresentativeRole: z
      .string()
      .trim()
      .max(80, 'Funcția are cel mult 80 de caractere.')
      .refine(
        (value) => value.length === 0 || value.length >= 2,
        'Funcția are cel puțin 2 caractere.'
      ),
  })
  .refine((values) => values.coversOccupationalSafety || values.coversFireSafety, {
    path: ['coversOccupationalSafety'],
    message: 'Alege cel puțin unul dintre servicii.',
  });

export type ServiceContractFormValues = z.infer<typeof serviceContractFormSchema>;

export function toServiceContractForm(
  { contract, suggestedNumber, clientRepresentative }: ServiceContractResponse,
  today: string
): ServiceContractFormValues {
  return {
    contractNumber: (contract?.contractNumber ?? suggestedNumber)?.toString() ?? '',
    contractDate: contract?.contractDate ?? today,
    startDate: contract?.startDate ?? today,
    durationMonths: (contract?.durationMonths ?? 12).toString(),
    renewsAutomatically: contract?.renewsAutomatically ?? true,
    coversOccupationalSafety: contract?.coversOccupationalSafety ?? true,
    coversFireSafety: contract?.coversFireSafety ?? false,
    clientRepresentativeName: clientRepresentative.name ?? '',
    clientRepresentativeRole: clientRepresentative.role ?? '',
  };
}

export function toServiceContractRequest(
  values: ServiceContractFormValues
): SaveServiceContractRequest {
  return {
    contractNumber: Number(values.contractNumber),
    contractDate: values.contractDate,
    startDate: values.startDate,
    durationMonths: Number(values.durationMonths),
    renewsAutomatically: values.renewsAutomatically,
    coversOccupationalSafety: values.coversOccupationalSafety,
    coversFireSafety: values.coversFireSafety,
    // An emptied name is not sent as null: the client keeps the one it has, which the
    // documentation set may already print.
    ...(values.clientRepresentativeName && {
      clientRepresentativeName: values.clientRepresentativeName,
    }),
    ...(values.clientRepresentativeRole && {
      clientRepresentativeRole: values.clientRepresentativeRole,
    }),
  };
}
