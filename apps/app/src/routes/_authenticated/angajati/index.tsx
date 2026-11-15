import { organizationEmployeeSortKeys, sortOrderSchema } from '@ssm-usor/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { OrganizationEmployeesPage } from '@/features/employees/organization-employees-page';
import {
  fromLegacyWorkerFilters,
  legacyWorkerFilterSearch,
  organizationWorkerFilterSearch,
} from '@/features/employees/worker-filters';

const searchSchema = z
  .object({
    status: z.literal('terminated').optional().catch(undefined),
    q: z.string().max(100).optional().catch(undefined),
    page: z.number().int().min(1).optional().catch(undefined),
    sort: z.enum(organizationEmployeeSortKeys).optional().catch(undefined),
    order: sortOrderSchema.optional().catch(undefined),
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
