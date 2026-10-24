import { normalizeCui } from '@ssm-usor/contracts';
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
      phone: null,
      legalRepresentativeName: null,
      legalRepresentativeRole: null,
      iban: null,
      bankName: null,
    },
  };
}
