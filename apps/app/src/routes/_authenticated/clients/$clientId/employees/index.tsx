import {
  employeeSortKeys,
  employeeStatuses,
  sortOrderSchema,
  testStateFilters,
  trainingStateFilters,
} from '@ssm-usor/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { EmployeesPage } from '@/features/employees/employees-page';

// The table state lives in the URL: the filters, the page, and one sort key, so refresh and
// back keep the place in the list. Defaults are omitted to keep links short.
const searchSchema = z.object({
  status: z.enum(employeeStatuses).optional(),
  trainingState: z.enum(trainingStateFilters).optional().catch(undefined),
  testState: z.enum(testStateFilters).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
  sort: z.enum(employeeSortKeys).optional().catch(undefined),
  order: sortOrderSchema.optional().catch(undefined),
  q: z.string().max(100).optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/clients/$clientId/employees/')({
  validateSearch: searchSchema,
  component: EmployeesPage,
});
