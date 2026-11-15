import { z } from 'zod';

import {
  employeeListFiltersSchema,
  employeeListItemSchema,
  employeeStatusSchema,
} from './employees';
import { listQuerySchema, listSearchSchema, pageSchema, repeatedQueryValue } from './list';

export const organizationEmployeeSortKeys = [
  'name',
  'client',
  'jobPosition',
  'hiredAt',
  'terminatedAt',
  'ssmTraining',
  'suTraining',
] as const;
export type OrganizationEmployeeSortKey = (typeof organizationEmployeeSortKeys)[number];

export const organizationEmployeeListFiltersSchema = employeeListFiltersSchema.extend({
  client: repeatedQueryValue(z.uuid()).optional(),
});

export type OrganizationEmployeeListFilters = z.infer<typeof organizationEmployeeListFiltersSchema>;

export const listOrganizationEmployeesQuerySchema = listQuerySchema(
  organizationEmployeeSortKeys,
  'name'
)
  .extend({
    status: employeeStatusSchema.optional(),
    q: listSearchSchema.optional(),
  })
  .extend(organizationEmployeeListFiltersSchema.shape);

export type ListOrganizationEmployeesQuery = z.infer<typeof listOrganizationEmployeesQuerySchema>;

export const organizationEmployeeListItemSchema = employeeListItemSchema.extend({
  client: z.object({ id: z.uuid(), name: z.string() }),
});

export type OrganizationEmployeeListItem = z.infer<typeof organizationEmployeeListItemSchema>;

export const organizationEmployeeListResponseSchema = pageSchema(
  organizationEmployeeListItemSchema
).extend({
  // The count of the status asked for, with no search and no filter.
  unfilteredTotal: z.int().min(0),
});

export type OrganizationEmployeeListResponse = z.infer<
  typeof organizationEmployeeListResponseSchema
>;
