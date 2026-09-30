import { employeeSortKeys, employeeStatuses, sortOrderSchema } from '@ssm-usor/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { EmployeesPage } from '@/features/employees/employees-page';

// The table state lives in the URL: status filter, page, and one sort key, so refresh and
// back keep the place in the list. Defaults are omitted to keep links short.
const searchSchema = z.object({
  status: z.enum(employeeStatuses).optional(),
  page: z.number().int().min(1).optional().catch(undefined),
  sort: z.enum(employeeSortKeys).optional().catch(undefined),
  order: sortOrderSchema.optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/clients/$clientId/employees/')({
  validateSearch: searchSchema,
  component: EmployeesPage,
});
