import { signatureListSortKeys, signatureListSubjects, trainingDomains } from '@ssm-usor/contracts';
import { createFileRoute } from '@tanstack/react-router';

import { filterSearchSchema, idFilterSearchSchema } from '@/components/list-filters/url';
import { listPageSearchSchema } from '@/components/list-filters/use-list-search';
import { SignatureListPage } from '@/features/signatures/signature-list-page';

const searchSchema = listPageSearchSchema(signatureListSortKeys).extend({
  client: idFilterSearchSchema(),
  domain: filterSearchSchema(trainingDomains),
  kind: filterSearchSchema(signatureListSubjects),
});

export const Route = createFileRoute('/_authenticated/semnaturi')({
  staticData: { title: 'Semnături' },
  validateSearch: searchSchema,
  component: SignatureListPage,
});
