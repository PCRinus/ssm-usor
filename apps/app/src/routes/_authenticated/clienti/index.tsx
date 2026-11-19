import {
  clientAttentionFilters,
  clientContractFilters,
  clientSortKeys,
  clientTrainingFilters,
  countyCodes,
  documentationStates,
} from '@ssm-usor/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { filterSearchSchema } from '@/components/list-filters/url';
import { listPageSearchSchema } from '@/components/list-filters/use-list-search';
import { ClientsPage } from '@/features/clients/clients-page';

const searchSchema = listPageSearchSchema(clientSortKeys).extend({
  status: z.literal('archived').optional().catch(undefined),
  documentation: filterSearchSchema(documentationStates),
  fireSafetyDocumentation: filterSearchSchema(documentationStates),
  training: filterSearchSchema(clientTrainingFilters),
  attention: filterSearchSchema(clientAttentionFilters),
  county: filterSearchSchema(countyCodes),
  contract: filterSearchSchema(clientContractFilters),
  import: z.literal(true).optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/clienti/')({
  validateSearch: searchSchema,
  component: ClientsPage,
});
