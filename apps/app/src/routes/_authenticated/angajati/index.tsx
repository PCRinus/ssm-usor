import { organizationEmployeeSortKeys } from '@ssm-usor/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { listPageSearchSchema } from '@/components/list-filters/use-list-search';
import { OrganizationEmployeesPage } from '@/features/employees/organization-employees-page';
import {
  fromLegacyWorkerFilters,
  legacyWorkerFilterSearch,
  organizationWorkerFilterSearch,
} from '@/features/employees/worker-filters';

const searchSchema = listPageSearchSchema(organizationEmployeeSortKeys)
  .extend({
    status: z.literal('terminated').optional().catch(undefined),
    ...organizationWorkerFilterSearch,
    ...legacyWorkerFilterSearch,
    // The single client the list filtered by before it took several.
    clientId: z.uuid().optional().catch(undefined),
  })
  .transform(({ clientId, ...search }) => ({
    ...fromLegacyWorkerFilters({
      ...search,
      client: search.client ?? (clientId ? [clientId] : undefined),
    }),
    clientId: undefined,
  }));

export const Route = createFileRoute('/_authenticated/angajati/')({
  staticData: { title: 'Lucrători' },
  validateSearch: searchSchema,
  component: OrganizationEmployeesPage,
});
