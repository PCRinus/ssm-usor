import { clientListStatuses, sortOrderSchema } from '@ssm-usor/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { leadSortKeys } from '@/features/clients/lead-sort';
import { LeadsPage } from '@/features/clients/leads-page';

// Page, sort and the archived view live in the URL; defaults are omitted to keep links short.
const searchSchema = z.object({
  page: z.number().int().min(1).optional().catch(undefined),
  sort: z.enum(leadSortKeys).optional().catch(undefined),
  order: sortOrderSchema.optional().catch(undefined),
  status: z.enum(clientListStatuses).optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/leads/')({
  validateSearch: searchSchema,
  component: LeadsPage,
});
