import { bankNameForIban, isValidIban, normalizeCui, normalizeIban } from '@ssm-usor/contracts';
import { z } from 'zod';

import type {
  CompanyLookupResponse,
  UpdateOrganizationCompanyDetailsRequest,
} from '@/api/generated/api';
import { fullNameField } from '@/features/account/profile-schema';
import { optionalCuiField } from '@/features/organization/company-details-schema';

export const onboardingSchema = z.object({
  fullName: fullNameField,
  cui: optionalCuiField,
  // Same bounds as `organizationNameSchema` in the contracts.
  organizationName: z
    .string()
    .trim()
    .min(2, 'Completează numele organizației.')
    .max(160, 'Numele poate avea cel mult 160 de caractere.'),
  acceptsDataProcessing: z.boolean().refine((accepted) => accepted, {
    message: 'Pentru a continua trebuie să accepți acordul de prelucrare a datelor.',
  }),
  // Names the clauses that Civil Code art. 1203 wants accepted expressly (ADR 029), so ticking it
  // is recorded as that express acceptance too.
  acceptsTerms: z.boolean().refine((accepted) => accepted, {
    message: 'Pentru a continua trebuie să accepți termenii.',
  }),
});

export type OnboardingValues = z.infer<typeof onboardingSchema>;

export type CompanyLookup = CompanyLookupResponse['company'];

// The route replaces every field, which is safe only because the organization is new.
export function toOnboardingCompanyDetails(
  input: string,
  company: CompanyLookup | null
): { request: UpdateOrganizationCompanyDetailsRequest; fromAnaf: boolean } | null {
  const cui = input ? normalizeCui(input)?.cui : undefined;
  if (!cui) return null;
  const found = company?.cui === cui ? company : null;
  return {
    fromAnaf: found !== null,
    request: {
      cui,
      legalName: found?.legalName ?? null,
      vatPayer: found?.vatPayer ?? false,
      tradeRegisterNumber: found?.tradeRegisterNumber ?? null,
      countyCode: found?.countyCode ?? null,
      locality: found?.locality ?? null,
      addressLine: found?.addressLine ?? null,
      phone: anafPhone(found),
      legalRepresentativeName: null,
      legalRepresentativeRole: null,
      iban: anafIban(found),
      bankName: bankNameForIban(anafIban(found) ?? ''),
    },
  };
}

// ANAF's free-text fields are not checked against the bounds the save applies, and one field out
// of bounds would refuse the whole save.
function anafPhone(company: CompanyLookup | null) {
  const phone = company?.phone?.trim();
  return phone && phone.length >= 5 && phone.length <= 20 ? phone : null;
}

function anafIban(company: CompanyLookup | null) {
  return company?.iban && isValidIban(company.iban) ? normalizeIban(company.iban) : null;
}

const listed = (items: string[]) =>
  items.length > 1 ? `${items.slice(0, -1).join(', ')} și ${items.at(-1)}` : (items[0] ?? '');

export function anafFoundMessage(company: CompanyLookup) {
  const taken = [
    'denumirea',
    ...(company.addressLine || company.locality ? ['sediul'] : []),
    ...(company.tradeRegisterNumber ? ['numărul de la registrul comerțului'] : []),
    ...(anafPhone(company) ? ['telefonul'] : []),
    ...(anafIban(company) ? ['contul bancar'] : []),
  ];
  const missing = anafIban(company)
    ? 'Reprezentantul legal nu este la ANAF. Îl completezi în pasul următor.'
    : 'Reprezentantul legal și contul bancar nu sunt la ANAF. Le completezi în pașii următori.';
  return {
    taken: `Am preluat de la ANAF ${listed(taken)} pentru ${company.legalName}.`,
    missing,
  };
}
