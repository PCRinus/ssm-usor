import {
  signatureListSortKeys,
  signatureListSubjects,
  sortOrderSchema,
  trainingDomains,
} from '@ssm-usor/contracts';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { filterSearchSchema, idFilterSearchSchema } from '@/components/list-filters/url';
import { SignatureListPage } from '@/features/signatures/signature-list-page';

const searchSchema = z.object({
  page: z.number().int().min(1).optional().catch(undefined),
  sort: z.enum(signatureListSortKeys).optional().catch(undefined),
  order: sortOrderSchema.optional().catch(undefined),
  q: z.string().max(100).optional().catch(undefined),
  client: idFilterSearchSchema(),
  domain: filterSearchSchema(trainingDomains),
  kind: filterSearchSchema(signatureListSubjects),
});

export const Route = createFileRoute('/_authenticated/semnaturi')({
  staticData: { title: 'Semnături' },
  validateSearch: searchSchema,
  component: SignatureListPage,
});
