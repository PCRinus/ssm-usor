import { instructionDomainSchema } from '@ssm-usor/contracts';
import { createFileRoute } from '@tanstack/react-router';

import { ImportLibraryPage } from '@/features/imports/import-page';
import { partLabels, partOfDomain } from '@/features/imports/library/library-model';

export const Route = createFileRoute(
  '/_authenticated/clienti/import/$importId/instructiuni/$domain'
)({
  params: { parse: (params) => ({ domain: instructionDomainSchema.parse(params.domain) }) },
  loader: ({ params }) => ({ crumb: partLabels[partOfDomain[params.domain]] }),
  component: ImportLibraryRoute,
});

function ImportLibraryRoute() {
  const { importId, domain } = Route.useParams();
  return <ImportLibraryPage importId={importId} domain={domain} />;
}
