import { z } from 'zod';

import { countyCodeSchema } from './counties';
import { isValidCuiInput } from './cui';

// The facts a client's SSM documentation prints (ADR 005). Every field is optional while it
// is being filled in; generating a document is what requires them.

const optionalText = (min: number, max: number) => z.string().trim().min(min).max(max).nullish();

/** The provider's legal details, as documents print them. Owners only. */
export const organizationLegalDetailsSchema = z.object({
  legalName: z.string().nullable(),
  cui: z.string().nullable(),
  tradeRegisterNumber: z.string().nullable(),
  countyCode: countyCodeSchema.nullable(),
  locality: z.string().nullable(),
  addressLine: z.string().nullable(),
  legalRepresentativeName: z.string().nullable(),
  legalRepresentativeRole: z.string().nullable(),
});

export type OrganizationLegalDetails = z.infer<typeof organizationLegalDetailsSchema>;

export const organizationLegalDetailsResponseSchema = z.object({
  legalDetails: organizationLegalDetailsSchema,
});

export type OrganizationLegalDetailsResponse = z.infer<
  typeof organizationLegalDetailsResponseSchema
>;

// Replaces all of them: a field left out or null is cleared.
export const updateOrganizationLegalDetailsRequestSchema = z.object({
  legalName: optionalText(2, 200),
  cui: z
    .string()
    .trim()
    .min(2)
    .max(16)
    .refine(isValidCuiInput, { message: 'Invalid CUI (format or control digit).' })
    .nullish(),
  tradeRegisterNumber: optionalText(1, 40),
  countyCode: countyCodeSchema.nullish(),
  locality: optionalText(1, 120),
  addressLine: optionalText(1, 240),
  legalRepresentativeName: optionalText(2, 160),
  legalRepresentativeRole: optionalText(2, 80),
});

export type UpdateOrganizationLegalDetailsRequest = z.infer<
  typeof updateOrganizationLegalDetailsRequestSchema
>;

/** Mirrors the intervals H.G. 1425/2006 art. 96 allows and the database checks. */
const trainingScheduleFields = {
  periodicTrainingHours: z.int().min(1).max(8),
  administrativeTrainingIntervalMonths: z.int().min(1).max(12),
  workerTrainingIntervalMonths: z.int().min(1).max(6),
  trainingFirstMonth: z.int().min(1).max(12),
  trainingDayFrom: z.int().min(1).max(31),
  trainingDayTo: z.int().min(1).max(31),
};

/** What documents print about a client beyond its registration data. */
export const clientDocumentDetailsSchema = z.object({
  // Also asked when the client is created; this is where it is corrected or filled in later.
  legalRepresentativeName: z.string().nullable(),
  legalRepresentativeRole: z.string().nullable(),
  periodicTrainingHours: trainingScheduleFields.periodicTrainingHours.nullable(),
  administrativeTrainingIntervalMonths:
    trainingScheduleFields.administrativeTrainingIntervalMonths.nullable(),
  workerTrainingIntervalMonths: trainingScheduleFields.workerTrainingIntervalMonths.nullable(),
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
    periodicTrainingHours: trainingScheduleFields.periodicTrainingHours.nullish(),
    administrativeTrainingIntervalMonths:
      trainingScheduleFields.administrativeTrainingIntervalMonths.nullish(),
    workerTrainingIntervalMonths: trainingScheduleFields.workerTrainingIntervalMonths.nullish(),
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
  );

export type UpdateClientDocumentDetailsRequest = z.infer<
  typeof updateClientDocumentDetailsRequestSchema
>;

/** A client's registered office or point of work. */
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

// Used to create and to replace a workplace.
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
  jobTitle: z.string(),
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

// Used to create and to replace a responsible person.
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
 * months until the year ends. February every 3 months gives 2, 5, 8, 11. Documents print
 * this list, and the form previews it.
 */
export function trainingMonths(firstMonth: number, intervalMonths: number): number[] {
  const months: number[] = [];
  for (let month = firstMonth; month <= 12; month += intervalMonths) months.push(month);
  return months;
}
