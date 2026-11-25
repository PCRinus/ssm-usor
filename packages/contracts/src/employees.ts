import { z } from 'zod';

import { decodeCnp, isValidCnpInput, normalizeCnp } from './cnp';
import { commuteMeanSchema, commuteMeansOtherMaxLength } from './commute-means';
import {
  dutiesAcknowledgementFilterSchema,
  dutiesAcknowledgementStatusSchema,
} from './duties-acknowledgements';
import { listQuerySchema, listSearchSchema, pageSchema, repeatedQueryValue } from './list';
import { participantChannelSchema, portalLanguageSchema } from './participant-channels';
import { phoneSchema } from './phone';
import { employeeTestsSchema, testStateFilterSchema } from './tests';
import {
  employeeTrainingSchema,
  employeeTrainingStateFilterSchema,
  minutesRange,
} from './trainings';

const text = ([min, max]: readonly [number, number]) => z.string().trim().min(min).max(max);
const optionalText = (min: number, max: number) => text([min, max]).nullish();

// The lengths an employee's text takes, which an import's values are checked against too.
export const employeeTextLimits = {
  lastName: [1, 100],
  firstName: [1, 100],
  employeeNumber: [1, 40],
  birthPlace: [1, 160],
  homeAddress: [1, 240],
  residenceAddress: [1, 240],
  education: [1, 160],
  qualification: [1, 160],
  jobTitle: [2, 160],
  commuteRoute: [1, 1000],
} as const satisfies Record<string, readonly [number, number]>;

const optionalLimited = (name: keyof typeof employeeTextLimits) =>
  text(employeeTextLimits[name]).nullish();

// Reasons of a 409 that the app words itself.
export const employeeConflictReasons = {
  cnpTaken: 'employee_cnp_taken',
  numberTaken: 'employee_number_taken',
} as const;

// Absences will be dated events, not a status.
export const employeeStatuses = ['active', 'terminated'] as const;
export const employeeStatusSchema = z.enum(employeeStatuses);
export type EmployeeStatus = z.infer<typeof employeeStatusSchema>;

export const bloodGroups = ['0(I)', 'A(II)', 'B(III)', 'AB(IV)'] as const;
export const bloodGroupSchema = z.enum(bloodGroups);
export type BloodGroup = z.infer<typeof bloodGroupSchema>;

export const rhFactors = ['+', '-'] as const;
export const rhFactorSchema = z.enum(rhFactors);
export type RhFactor = z.infer<typeof rhFactorSchema>;

const cnpInputSchema = z
  .string()
  .trim()
  .min(13)
  .max(20)
  .refine(isValidCnpInput, { message: 'Invalid CNP (format, date, or control digit).' });

// A new employee is always active; status changes come with the detail page. The CNP
// accepts spacing; the API stores digits.
export const createEmployeeRequestSchema = z
  .object({
    lastName: text(employeeTextLimits.lastName),
    firstName: text(employeeTextLimits.firstName),
    cnp: cnpInputSchema.nullish(),
    employeeNumber: optionalLimited('employeeNumber'),
    email: z.email().trim().toLowerCase().max(254).nullish(),
    phone: phoneSchema.nullish(),
    // The title in the employment contract. Usually the name of the job position, and not the
    // same fact (ADR 006).
    jobTitle: text(employeeTextLimits.jobTitle),
    contractNumber: optionalText(1, 50),
    // The post the person fills. Left out, the position named like the contract title, which
    // the client gets if it lacks it.
    jobPositionId: z.uuid().nullish(),
    hiredAt: z.iso.date(),
    birthDate: z.iso.date().nullish(),
    birthPlace: optionalLimited('birthPlace'),
    homeAddress: optionalLimited('homeAddress'),
    // Where the person lives when it is not their domicile; no sheet prints it.
    residenceAddress: optionalLimited('residenceAddress'),
    bloodGroup: bloodGroupSchema.nullish(),
    rhFactor: rhFactorSchema.nullish(),
    notes: optionalText(1, 2000),
    // Left out when adding someone, the client's only active workplace if it has exactly one;
    // left out when editing, the stored one stays (ADR 021).
    workplaceId: z.uuid().nullish(),
    qualification: optionalLimited('qualification'),
    education: optionalLimited('education'),
    authorizations: optionalText(1, 500),
    commuteRoute: optionalLimited('commuteRoute'),
    // Left out, none; repeated codes count once.
    commuteMeans: z.array(commuteMeanSchema).max(20).nullish(),
    commuteMeansOther: optionalText(1, commuteMeansOtherMaxLength),
    commuteMinutes: z.number().int().min(minutesRange.min).max(minutesRange.max).nullish(),
  })
  .superRefine((body, ctx) => {
    if (body.birthDate && body.birthDate >= body.hiredAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['birthDate'],
        message: 'The birth date must be before the hire date.',
      });
    }
    // The CNP encodes the birth date for Romanian citizens; the two must agree.
    const encoded = body.cnp ? decodeCnp(normalizeCnp(body.cnp)!).birthDate : null;
    if (encoded && body.birthDate && body.birthDate !== encoded) {
      ctx.addIssue({
        code: 'custom',
        path: ['birthDate'],
        message: 'The birth date does not match the CNP.',
      });
    }
  });

export type CreateEmployeeRequest = z.infer<typeof createEmployeeRequestSchema>;

/**
 * Replaces what was entered about an employee: the same fields and rules as creating one.
 * Whether the person still works there is not among them; that is a status change.
 */
export const updateEmployeeRequestSchema = createEmployeeRequestSchema;

export type UpdateEmployeeRequest = z.infer<typeof updateEmployeeRequestSchema>;

// Marking a leaver needs the leave date; reactivating clears it and is meant for undoing
// a mistake. A rehire after a gap is a new employee row.
export const updateEmployeeStatusRequestSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('terminated'), terminatedAt: z.iso.date() }),
  z.object({ status: z.literal('active') }),
]);

export type UpdateEmployeeStatusRequest = z.infer<typeof updateEmployeeStatusRequestSchema>;

// Without a status the list returns current employees. "name" orders by last name then
// first name.
export const employeeSortKeys = [
  'name',
  'jobTitle',
  'jobPosition',
  'hiredAt',
  'terminatedAt',
  'ssmTraining',
  'suTraining',
  'portal',
] as const;
export type EmployeeSortKey = (typeof employeeSortKeys)[number];

// "toTrain" is the clients list's "de instruit", untrained or overdue in either domain, and
// "trainingDue" its "scadente", due within 30 days in either domain.
export const employeeAttentionFilters = [
  'signaturesPending',
  'noPhone',
  'noEmail',
  'toTrain',
  'trainingDue',
] as const;
export type EmployeeAttentionFilter = (typeof employeeAttentionFilters)[number];

// Within one filter any value matches; across filters every one must. A training state is read
// in its own domain, "attention" being untrained or overdue there; a test state in either
// domain, and "passed" in both.
export const employeeListFiltersSchema = z.object({
  ssmTraining: repeatedQueryValue(employeeTrainingStateFilterSchema).optional(),
  suTraining: repeatedQueryValue(employeeTrainingStateFilterSchema).optional(),
  test: repeatedQueryValue(testStateFilterSchema).optional(),
  attention: repeatedQueryValue(z.enum(employeeAttentionFilters)).optional(),
  dutiesAcknowledgement: repeatedQueryValue(dutiesAcknowledgementFilterSchema).optional(),
});

export type EmployeeListFilters = z.infer<typeof employeeListFiltersSchema>;

// An employee's standing on the portal (ADR 022), in the order the Portal tab sorts it.
// "expired": an invitation neither accepted nor revoked past its 30 days. "revoked": the latest
// access or invitation was revoked and nothing newer is pending.
export const portalAccessStates = ['active', 'invited', 'expired', 'none', 'revoked'] as const;
export const portalAccessStateSchema = z.enum(portalAccessStates);
export type PortalAccessState = z.infer<typeof portalAccessStateSchema>;

// Stands for the employees with no workplace, beside workplace ids in the same filter.
export const noWorkplace = 'none';

export const clientEmployeeListFiltersSchema = employeeListFiltersSchema.extend({
  jobPosition: repeatedQueryValue(z.uuid()).optional(),
  workplace: repeatedQueryValue(z.union([z.uuid(), z.literal(noWorkplace)])).optional(),
  portal: repeatedQueryValue(portalAccessStateSchema).optional(),
});

export type ClientEmployeeListFilters = z.infer<typeof clientEmployeeListFiltersSchema>;

export const listEmployeesQuerySchema = listQuerySchema(employeeSortKeys, 'name')
  .extend({
    status: employeeStatusSchema.optional(),
    q: listSearchSchema.optional(),
  })
  .extend(clientEmployeeListFiltersSchema.shape);

export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;

// The full record, returned only by the detail route because it carries the CNP.
export const employeeSchema = z.object({
  id: z.uuid(),
  clientId: z.uuid(),
  lastName: z.string(),
  firstName: z.string(),
  cnp: z.string().nullable(),
  employeeNumber: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  // The title in the employment contract.
  jobTitle: z.string(),
  contractNumber: z.string().nullable(),
  // The post the person fills; one per employee.
  jobPosition: z.object({ id: z.uuid(), name: z.string(), archived: z.boolean() }),
  hiredAt: z.iso.date(),
  status: employeeStatusSchema,
  terminatedAt: z.iso.date().nullable(),
  birthDate: z.iso.date().nullable(),
  birthPlace: z.string().nullable(),
  homeAddress: z.string().nullable(),
  residenceAddress: z.string().nullable(),
  bloodGroup: bloodGroupSchema.nullable(),
  rhFactor: rhFactorSchema.nullable(),
  notes: z.string().nullable(),
  workplace: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  qualification: z.string().nullable(),
  education: z.string().nullable(),
  authorizations: z.string().nullable(),
  commuteRoute: z.string().nullable(),
  // In the list's order.
  commuteMeans: z.array(commuteMeanSchema),
  commuteMeansOther: z.string().nullable(),
  commuteMinutes: z.number().int().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
  training: employeeTrainingSchema,
  tests: employeeTestsSchema,
});

export type Employee = z.infer<typeof employeeSchema>;

export const employeeListItemSchema = employeeSchema
  .pick({
    id: true,
    clientId: true,
    lastName: true,
    firstName: true,
    employeeNumber: true,
    email: true,
    phone: true,
    jobTitle: true,
    hiredAt: true,
    status: true,
    terminatedAt: true,
    workplace: true,
    createdAt: true,
    updatedAt: true,
    training: true,
    tests: true,
  })
  .extend({
    jobPosition: z.object({ id: z.uuid(), name: z.string() }),
    signaturesPending: z.int().min(0),
    // Null for a former employee.
    dutiesAcknowledgement: dutiesAcknowledgementStatusSchema.nullable(),
  });

export type EmployeeListItem = z.infer<typeof employeeListItemSchema>;

export const employeePortalAccessSchema = z.object({
  state: portalAccessStateSchema,
  // Active: when access began. Invited or expired: when the invitation was last sent.
  since: z.iso.datetime({ offset: true }).nullable(),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  revokedAt: z.iso.datetime({ offset: true }).nullable(),
  // When a pending invitation may be sent again; null for any other state.
  resendableAt: z.iso.datetime({ offset: true }).nullable(),
  channel: participantChannelSchema.nullable(),
  address: z.string().nullable(),
  // Chosen by an active participant in the portal; null before the choice.
  language: portalLanguageSchema.nullable(),
  participantId: z.uuid().nullable(),
  invitationId: z.uuid().nullable(),
  // The employee is the client administrator, and the standing is theirs as such.
  administrator: z.boolean(),
});

export type EmployeePortalAccess = z.infer<typeof employeePortalAccessSchema>;

export const clientEmployeeListItemSchema = employeeListItemSchema.extend({
  portal: employeePortalAccessSchema,
});

export type ClientEmployeeListItem = z.infer<typeof clientEmployeeListItemSchema>;

/** Moves an employee to another of the client's job positions. */
export const updateEmployeeJobPositionRequestSchema = z.object({
  jobPositionId: z.uuid(),
  // Given when the contract changed with the post; left out, the contract title stays.
  jobTitle: text(employeeTextLimits.jobTitle).optional(),
});

export type UpdateEmployeeJobPositionRequest = z.infer<
  typeof updateEmployeeJobPositionRequestSchema
>;

export const employeeResponseSchema = z.object({ employee: employeeSchema });

export type EmployeeResponse = z.infer<typeof employeeResponseSchema>;

export const employeeListResponseSchema = pageSchema(clientEmployeeListItemSchema).extend({
  // The count of the status asked for, with no search and no filter.
  unfilteredTotal: z.int().min(0),
});

export type EmployeeListResponse = z.infer<typeof employeeListResponseSchema>;

export function formatEmployeeName(employee: Pick<Employee, 'lastName' | 'firstName'>) {
  return `${employee.lastName} ${employee.firstName}`;
}
