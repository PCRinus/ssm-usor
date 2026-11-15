import { employeeSortKeys, sortOrderSchema } from '@ssm-usor/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { EmployeesPage } from '@/features/employees/employees-page';
import {
  clientWorkerFilterSearch,
  fromLegacyWorkerFilters,
  legacyWorkerFilterSearch,
} from '@/features/employees/worker-filters';

// The table state lives in the URL: the filters, the page, and one sort key, so refresh and
// back keep the place in the list. Defaults are omitted to keep links short.
const searchSchema = z
  .object({
    status: z.literal('terminated').optional().catch(undefined),
    page: z.number().int().min(1).optional().catch(undefined),
    sort: z.enum(employeeSortKeys).optional().catch(undefined),
    order: sortOrderSchema.optional().catch(undefined),
    q: z.string().max(100).optional().catch(undefined),
    ...clientWorkerFilterSearch,
    ...legacyWorkerFilterSearch,
  })
  .transform(fromLegacyWorkerFilters);

export const Route = createFileRoute('/_authenticated/clienti/$clientId/angajati/')({
  validateSearch: searchSchema,
  component: EmployeesPage,
});
