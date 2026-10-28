import { createFileRoute } from '@tanstack/react-router';

import { ImportPage } from '@/features/imports/import-page';

export const Route = createFileRoute('/_authenticated/clients/import/$importId/')({
  component: ImportRoute,
});

function ImportRoute() {
  const { importId } = Route.useParams();
  return <ImportPage importId={importId} />;
}
