import {
  employeeStatuses,
  organizationEmployeeSortKeys,
  sortOrderSchema,
  testStateFilters,
  trainingDomains,
  trainingStateFilters,
} from '@ssm-usor/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { OrganizationEmployeesPage } from '@/features/employees/organization-employees-page';

const searchSchema = z.object({
  status: z.enum(employeeStatuses).optional().catch(undefined),
  clientId: z.uuid().optional().catch(undefined),
  trainingState: z.enum(trainingStateFilters).optional().catch(undefined),
  testState: z.enum(testStateFilters).optional().catch(undefined),
  domain: z.enum(trainingDomains).optional().catch(undefined),
  q: z.string().max(100).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
  sort: z.enum(organizationEmployeeSortKeys).optional().catch(undefined),
  order: sortOrderSchema.optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/employees/')({
  staticData: { title: 'Angajați' },
  validateSearch: searchSchema,
  component: OrganizationEmployeesPage,
});
