import { z } from 'zod';

import { employeeListItemSchema, employeeStatusSchema } from './employees';
import { listQuerySchema, listSearchSchema, pageSchema } from './list';
import { testStateFilterSchema } from './tests';
import { trainingStateFilterSchema } from './trainings';

export const organizationEmployeeSortKeys = ['name', 'client', 'jobPosition', 'hiredAt'] as const;
export type OrganizationEmployeeSortKey = (typeof organizationEmployeeSortKeys)[number];

export const listOrganizationEmployeesQuerySchema = listQuerySchema(
  organizationEmployeeSortKeys,
  'name'
).extend({
  status: employeeStatusSchema.optional(),
  clientId: z.uuid().optional(),
  trainingState: trainingStateFilterSchema.optional(),
  testState: testStateFilterSchema.optional(),
  q: listSearchSchema.optional(),
});

export type ListOrganizationEmployeesQuery = z.infer<typeof listOrganizationEmployeesQuerySchema>;

export const organizationEmployeeListItemSchema = employeeListItemSchema.extend({
  client: z.object({ id: z.uuid(), name: z.string() }),
});

export type OrganizationEmployeeListItem = z.infer<typeof organizationEmployeeListItemSchema>;

export const organizationEmployeeListResponseSchema = pageSchema(
  organizationEmployeeListItemSchema
);

export type OrganizationEmployeeListResponse = z.infer<
  typeof organizationEmployeeListResponseSchema
>;
