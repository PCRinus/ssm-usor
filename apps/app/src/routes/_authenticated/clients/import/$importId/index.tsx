import { createFileRoute } from '@tanstack/react-router';

import { ImportProcessingPage } from '@/features/imports/import-processing-page';

export const Route = createFileRoute('/_authenticated/clients/import/$importId/')({
  component: ImportPage,
});

function ImportPage() {
  const { importId } = Route.useParams();
  return <ImportProcessingPage importId={importId} />;
}
