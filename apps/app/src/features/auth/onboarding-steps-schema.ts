import { z } from 'zod';

import type {
  OrganizationCompanyDetailsResponse,
  UpdateOrganizationCompanyDetailsRequest,
} from '@/api/generated/api';
import { professionalTitleField } from '@/features/account/profile-schema';
import { companyDetailsFormSchema } from '@/features/organization/company-details-schema';

type CompanyDetails = OrganizationCompanyDetailsResponse['companyDetails'];

export const signatoryStepSchema = companyDetailsFormSchema
  .pick({ legalRepresentativeName: true, legalRepresentativeRole: true })
  .extend({ representativeIsMe: z.boolean(), professionalTitle: professionalTitleField });

export type SignatoryStepValues = z.infer<typeof signatoryStepSchema>;

export const contractStepSchema = companyDetailsFormSchema.pick({
  phone: true,
  iban: true,
  bankName: true,
});

export type ContractStepValues = z.infer<typeof contractStepSchema>;

// The company-details route replaces every field, so a step sends what is saved with its own
// fields over it; a field left out would be cleared. A partial route was not added: the step has
// just read the record, and the new organization's owner is the only one writing it.
export function withStepDetails(
  saved: CompanyDetails,
  changes: Partial<CompanyDetails>
): UpdateOrganizationCompanyDetailsRequest {
  return { ...saved, ...changes };
}
