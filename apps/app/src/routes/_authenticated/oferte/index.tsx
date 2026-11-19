import { leadSortKeys, serviceContractStates } from '@ssm-usor/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { filterSearchSchema } from '@/components/list-filters/url';
import { listPageSearchSchema } from '@/components/list-filters/use-list-search';
import { LeadsPage } from '@/features/clients/leads-page';

const searchSchema = listPageSearchSchema(leadSortKeys).extend({
  status: z.literal('archived').optional().catch(undefined),
  contractState: filterSearchSchema(serviceContractStates),
});

export const Route = createFileRoute('/_authenticated/oferte/')({
  validateSearch: searchSchema,
  component: LeadsPage,
});
