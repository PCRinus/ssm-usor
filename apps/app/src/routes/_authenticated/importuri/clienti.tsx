import { createFileRoute } from '@tanstack/react-router';

import { importsSearchSchema } from '@/features/imports/list/imports-search';
import { ImportsTab } from '@/features/imports/list/imports-tab';

export const Route = createFileRoute('/_authenticated/importuri/clienti')({
  staticData: { title: 'Clienți' },
  validateSearch: importsSearchSchema,
  component: ClientImports,
});

function ClientImports() {
  return <ImportsTab kind="client" search={Route.useSearch()} />;
}
