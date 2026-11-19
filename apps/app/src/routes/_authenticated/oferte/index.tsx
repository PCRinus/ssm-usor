import { leadSortKeys, serviceContractStates, sortOrderSchema } from '@ssm-usor/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { filterSearchSchema, listQuerySearchSchema } from '@/components/list-filters/url';
import { LeadsPage } from '@/features/clients/leads-page';

const searchSchema = z.object({
  page: z.number().int().min(1).optional().catch(undefined),
  sort: z.enum(leadSortKeys).optional().catch(undefined),
  order: sortOrderSchema.optional().catch(undefined),
  status: z.literal('archived').optional().catch(undefined),
  q: listQuerySearchSchema,
  contractState: filterSearchSchema(serviceContractStates),
});

export const Route = createFileRoute('/_authenticated/oferte/')({
  validateSearch: searchSchema,
  component: LeadsPage,
});
