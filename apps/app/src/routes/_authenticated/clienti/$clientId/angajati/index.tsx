import { employeeSortKeys } from '@ssm-usor/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { listPageSearchSchema } from '@/components/list-filters/use-list-search';
import { EmployeesPage } from '@/features/employees/employees-page';
import {
  clientWorkerFilterSearch,
  fromLegacyWorkerFilters,
  legacyWorkerFilterSearch,
} from '@/features/employees/worker-filters';

// The table state lives in the URL: the filters, the page, and one sort key, so refresh and
// back keep the place in the list. Defaults are omitted to keep links short.
const searchSchema = listPageSearchSchema(employeeSortKeys)
  .extend({
    status: z.literal('terminated').optional().catch(undefined),
    import: z.literal(true).optional().catch(undefined),
    ...clientWorkerFilterSearch,
    ...legacyWorkerFilterSearch,
  })
  .transform(fromLegacyWorkerFilters);

export const Route = createFileRoute('/_authenticated/clienti/$clientId/angajati/')({
  staticData: { flushSheet: true },
  validateSearch: searchSchema,
  component: EmployeesPage,
});
