import { z } from 'zod';

import { decodeCnp, isValidCnpInput, normalizeCnp } from './cnp';
import { listQuerySchema, pageSchema } from './list';

const optionalText = (min: number, max: number) => z.string().trim().min(min).max(max).nullish();

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
    lastName: z.string().trim().min(1).max(100),
    firstName: z.string().trim().min(1).max(100),
    cnp: cnpInputSchema.nullish(),
    employeeNumber: optionalText(1, 40),
    email: z.email().trim().toLowerCase().max(254).nullish(),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9][0-9 ().-]{3,18}$/, { message: 'Invalid phone number.' })
      .nullish(),
    // The title in the employment contract. Usually the name of the job position, and not the
    // same fact (ADR 006).
    jobTitle: z.string().trim().min(2).max(160),
    // The post the person fills. Left out, the position named like the contract title, which
    // the client gets if it lacks it.
    jobPositionId: z.uuid().nullish(),
    hiredAt: z.iso.date(),
    birthDate: z.iso.date().nullish(),
    birthPlace: optionalText(1, 160),
    homeAddress: optionalText(1, 240),
    bloodGroup: bloodGroupSchema.nullish(),
    rhFactor: rhFactorSchema.nullish(),
    notes: optionalText(1, 2000),
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
export const employeeSortKeys = ['name', 'jobTitle', 'jobPosition', 'hiredAt'] as const;
export type EmployeeSortKey = (typeof employeeSortKeys)[number];

export const listEmployeesQuerySchema = listQuerySchema(employeeSortKeys, 'name').extend({
  status: employeeStatusSchema.optional(),
});

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
  // The post the person fills; one per employee.
  jobPosition: z.object({ id: z.uuid(), name: z.string() }),
  hiredAt: z.iso.date(),
  status: employeeStatusSchema,
  terminatedAt: z.iso.date().nullable(),
  birthDate: z.iso.date().nullable(),
  birthPlace: z.string().nullable(),
  homeAddress: z.string().nullable(),
  bloodGroup: bloodGroupSchema.nullable(),
  rhFactor: rhFactorSchema.nullable(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type Employee = z.infer<typeof employeeSchema>;

export const employeeListItemSchema = employeeSchema.pick({
  id: true,
  clientId: true,
  lastName: true,
  firstName: true,
  employeeNumber: true,
  email: true,
  phone: true,
  jobTitle: true,
  jobPosition: true,
  hiredAt: true,
  status: true,
  terminatedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type EmployeeListItem = z.infer<typeof employeeListItemSchema>;

/** Moves an employee to another of the client's job positions. */
export const updateEmployeeJobPositionRequestSchema = z.object({
  jobPositionId: z.uuid(),
  // Given when the contract changed with the post; left out, the contract title stays.
  jobTitle: z.string().trim().min(2).max(160).optional(),
});

export type UpdateEmployeeJobPositionRequest = z.infer<
  typeof updateEmployeeJobPositionRequestSchema
>;

export const employeeResponseSchema = z.object({ employee: employeeSchema });

export type EmployeeResponse = z.infer<typeof employeeResponseSchema>;

export const employeeListResponseSchema = pageSchema(employeeListItemSchema);

export type EmployeeListResponse = z.infer<typeof employeeListResponseSchema>;

export function formatEmployeeName(employee: Pick<Employee, 'lastName' | 'firstName'>) {
  return `${employee.lastName} ${employee.firstName}`;
}
