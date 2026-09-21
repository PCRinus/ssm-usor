import { z } from 'zod';

import { countyCodeSchema } from './counties';
import { isValidCuiInput } from './cui';
import { isValidIban } from './iban';

// Every field is optional while it is being filled in; generating a document is what
// requires them.

const optionalText = (min: number, max: number) => z.string().trim().min(min).max(max).nullish();

/** What documents and contracts print about the provider as a company. Owners write it. */
export const organizationCompanyDetailsSchema = z.object({
  legalName: z.string().nullable(),
  cui: z.string().nullable(),
  // Decides the sentence about VAT beside the prices of a contract.
  vatPayer: z.boolean(),
  tradeRegisterNumber: z.string().nullable(),
  countyCode: countyCodeSchema.nullable(),
  locality: z.string().nullable(),
  addressLine: z.string().nullable(),
  phone: z.string().nullable(),
  legalRepresentativeName: z.string().nullable(),
  legalRepresentativeRole: z.string().nullable(),
  // Without spaces; `formatIban` prints it.
  iban: z.string().nullable(),
  bankName: z.string().nullable(),
});

export type OrganizationCompanyDetails = z.infer<typeof organizationCompanyDetailsSchema>;

export const organizationCompanyDetailsResponseSchema = z.object({
  companyDetails: organizationCompanyDetailsSchema,
});

export type OrganizationCompanyDetailsResponse = z.infer<
  typeof organizationCompanyDetailsResponseSchema
>;

// Replaces all of them: a field left out or null is cleared, and `vatPayer` left out is false.
export const updateOrganizationCompanyDetailsRequestSchema = z.object({
  legalName: optionalText(2, 200),
  cui: z
    .string()
    .trim()
    .min(2)
    .max(16)
    .refine(isValidCuiInput, { message: 'Invalid CUI (format or control digit).' })
    .nullish(),
  vatPayer: z.boolean().default(false),
  tradeRegisterNumber: optionalText(1, 40),
  countyCode: countyCodeSchema.nullish(),
  locality: optionalText(1, 120),
  addressLine: optionalText(1, 240),
  phone: optionalText(5, 20),
  legalRepresentativeName: optionalText(2, 160),
  legalRepresentativeRole: optionalText(2, 80),
  iban: z
    .string()
    .trim()
    .max(42)
    .refine(isValidIban, { message: 'Invalid IBAN (format or check digits).' })
    .nullish(),
  bankName: optionalText(2, 120),
});

export type UpdateOrganizationCompanyDetailsRequest = z.infer<
  typeof updateOrganizationCompanyDetailsRequestSchema
>;

/** The certificate of authorization and the fire-safety technician. Owners write them. */
export const organizationAuthorizationsSchema = z.object({
  authorizationCertificateNumber: z.string().nullable(),
  authorizationCertificateDate: z.iso.date().nullable(),
  authorizationCertificateIssuer: z.string().nullable(),
  fireSafetyTechnicianName: z.string().nullable(),
  fireSafetyTechnicianCertificate: z.string().nullable(),
});

export type OrganizationAuthorizations = z.infer<typeof organizationAuthorizationsSchema>;

export const organizationAuthorizationsResponseSchema = z.object({
  authorizations: organizationAuthorizationsSchema,
});

export type OrganizationAuthorizationsResponse = z.infer<
  typeof organizationAuthorizationsResponseSchema
>;

// Replaces all of them: a field left out or null is cleared.
export const updateOrganizationAuthorizationsRequestSchema = z.object({
  authorizationCertificateNumber: optionalText(1, 40),
  authorizationCertificateDate: z.iso.date().nullish(),
  authorizationCertificateIssuer: optionalText(2, 200),
  fireSafetyTechnicianName: optionalText(2, 160),
  fireSafetyTechnicianCertificate: optionalText(1, 80),
});

export type UpdateOrganizationAuthorizationsRequest = z.infer<
  typeof updateOrganizationAuthorizationsRequestSchema
>;

// The durations an SSM specialist confirmed providers use (issue #81).
export const periodicTrainingMinutesOptions = [30, 60, 90, 120] as const;

/** "30 de minute", "1 oră", "1 oră și 30 de minute", "2 ore": as the first decision prints it. */
export function formatTrainingDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hoursText = hours === 1 ? '1 oră' : `${hours} ore`;
  const restText = rest >= 20 ? `${rest} de minute` : `${rest} minute`;
  if (hours === 0) return restText;
  return rest === 0 ? hoursText : `${hoursText} și ${restText}`;
}

/** Mirrors the intervals H.G. 1425/2006 art. 96 allows and the database checks. */
const trainingScheduleFields = {
  // Not z.literal([...]): the OpenAPI generator keeps only the first value of the list.
  periodicTrainingMinutes: z
    .int()
    .refine((minutes) => (periodicTrainingMinutesOptions as readonly number[]).includes(minutes)),
  administrativeTrainingIntervalMonths: z.int().min(1).max(12),
  workerTrainingIntervalMonths: z.int().min(1).max(6),
  trainingFirstMonth: z.int().min(1).max(12),
  trainingDayFrom: z.int().min(1).max(31),
  trainingDayTo: z.int().min(1).max(31),
};

export const clientDocumentDetailsSchema = z.object({
  // Also asked when the client is created; this is where it is corrected or filled in later.
  legalRepresentativeName: z.string().nullable(),
  legalRepresentativeRole: z.string().nullable(),
  periodicTrainingMinutes: trainingScheduleFields.periodicTrainingMinutes.nullable(),
  administrativeTrainingIntervalMonths:
    trainingScheduleFields.administrativeTrainingIntervalMonths.nullable(),
  administrativeTrainingNotApplicable: z.boolean(),
  workerTrainingIntervalMonths: trainingScheduleFields.workerTrainingIntervalMonths.nullable(),
  workerTrainingNotApplicable: z.boolean(),
  trainingFirstMonth: trainingScheduleFields.trainingFirstMonth.nullable(),
  trainingDayFrom: trainingScheduleFields.trainingDayFrom.nullable(),
  trainingDayTo: trainingScheduleFields.trainingDayTo.nullable(),
});

export type ClientDocumentDetails = z.infer<typeof clientDocumentDetailsSchema>;

export const clientDocumentDetailsResponseSchema = z.object({
  documentDetails: clientDocumentDetailsSchema,
});

export type ClientDocumentDetailsResponse = z.infer<typeof clientDocumentDetailsResponseSchema>;

// Replaces all of them: a field left out or null is cleared.
export const updateClientDocumentDetailsRequestSchema = z
  .object({
    legalRepresentativeName: optionalText(2, 160),
    legalRepresentativeRole: optionalText(2, 80),
    periodicTrainingMinutes: trainingScheduleFields.periodicTrainingMinutes.nullish(),
    administrativeTrainingIntervalMonths:
      trainingScheduleFields.administrativeTrainingIntervalMonths.nullish(),
    administrativeTrainingNotApplicable: z.boolean().optional(),
    workerTrainingIntervalMonths: trainingScheduleFields.workerTrainingIntervalMonths.nullish(),
    workerTrainingNotApplicable: z.boolean().optional(),
    trainingFirstMonth: trainingScheduleFields.trainingFirstMonth.nullish(),
    trainingDayFrom: trainingScheduleFields.trainingDayFrom.nullish(),
    trainingDayTo: trainingScheduleFields.trainingDayTo.nullish(),
  })
  .refine(
    (value) =>
      value.trainingDayFrom == null ||
      value.trainingDayTo == null ||
      value.trainingDayFrom <= value.trainingDayTo,
    { path: ['trainingDayTo'], message: 'The last day cannot precede the first.' }
  )
  .refine(
    (value) =>
      !value.administrativeTrainingNotApplicable ||
      value.administrativeTrainingIntervalMonths == null,
    {
      path: ['administrativeTrainingIntervalMonths'],
      message: 'An excluded category cannot have a training interval.',
    }
  )
  .refine(
    (value) => !value.workerTrainingNotApplicable || value.workerTrainingIntervalMonths == null,
    {
      path: ['workerTrainingIntervalMonths'],
      message: 'An excluded category cannot have a training interval.',
    }
  );

export type UpdateClientDocumentDetailsRequest = z.infer<
  typeof updateClientDocumentDetailsRequestSchema
>;

export const workplaceSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  name: z.string(),
  isRegisteredOffice: z.boolean(),
  countyCode: countyCodeSchema.nullable(),
  locality: z.string().nullable(),
  addressLine: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type Workplace = z.infer<typeof workplaceSchema>;

export const workplaceResponseSchema = z.object({ workplace: workplaceSchema });

export type WorkplaceResponse = z.infer<typeof workplaceResponseSchema>;

// A client has a handful of workplaces, so the list is not paginated.
export const workplaceListResponseSchema = z.object({ items: z.array(workplaceSchema) });

export type WorkplaceListResponse = z.infer<typeof workplaceListResponseSchema>;

export const workplaceRequestSchema = z.object({
  name: z.string().trim().min(2).max(160),
  isRegisteredOffice: z.boolean().default(false),
  countyCode: countyCodeSchema.nullish(),
  locality: optionalText(1, 120),
  addressLine: optionalText(1, 240),
});

export type WorkplaceRequest = z.infer<typeof workplaceRequestSchema>;

/** Mirrors the `responsible_person_role` enum in the database. */
export const responsiblePersonRoles = [
  'workplace_manager',
  'first_aid',
  'risk_evaluation_team',
  'imminent_danger',
] as const;

export const responsiblePersonRoleSchema = z.enum(responsiblePersonRoles);

export type ResponsiblePersonRole = z.infer<typeof responsiblePersonRoleSchema>;

/** A person the client designates by decision. One person often holds every role. */
export const responsiblePersonSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  // Set when the person is one of the client's employees; the administrator often is not.
  employeeId: z.uuid().nullable(),
  fullName: z.string(),
  // As the decisions print it: copied when the person was chosen and kept until someone
  // changes it here, because a decision is a legal act (ADR 006).
  jobTitle: z.string(),
  // The employee's contract title today, which the copy above may no longer match. Null for
  // someone who is not an employee.
  employeeJobTitle: z.string().nullable(),
  roles: z.array(responsiblePersonRoleSchema).min(1),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type ResponsiblePerson = z.infer<typeof responsiblePersonSchema>;

export const responsiblePersonResponseSchema = z.object({
  responsiblePerson: responsiblePersonSchema,
});

export type ResponsiblePersonResponse = z.infer<typeof responsiblePersonResponseSchema>;

export const responsiblePersonListResponseSchema = z.object({
  items: z.array(responsiblePersonSchema),
});

export type ResponsiblePersonListResponse = z.infer<typeof responsiblePersonListResponseSchema>;

export const responsiblePersonRequestSchema = z.object({
  employeeId: z.uuid().nullish(),
  fullName: z.string().trim().min(2).max(160),
  jobTitle: z.string().trim().min(2).max(160),
  roles: z
    .array(responsiblePersonRoleSchema)
    .min(1)
    .max(responsiblePersonRoles.length)
    .refine((roles) => new Set(roles).size === roles.length, { message: 'A role appears twice.' }),
});

export type ResponsiblePersonRequest = z.infer<typeof responsiblePersonRequestSchema>;

/**
 * The months of the year with a periodic training: the first month, then every `interval`
 * months until the year ends. February every 3 months gives 2, 5, 8, 11.
 */
export function trainingMonths(firstMonth: number, intervalMonths: number): number[] {
  const months: number[] = [];
  for (let month = firstMonth; month <= 12; month += intervalMonths) months.push(month);
  return months;
}
