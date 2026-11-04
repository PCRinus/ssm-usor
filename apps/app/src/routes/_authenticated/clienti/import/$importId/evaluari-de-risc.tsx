import { createFileRoute } from '@tanstack/react-router';

import { ImportRisksPage } from '@/features/imports/import-page';

export const Route = createFileRoute('/_authenticated/clienti/import/$importId/evaluari-de-risc')({
  loader: () => ({ crumb: 'Evaluări de risc' }),
  component: ImportRisksRoute,
});

function ImportRisksRoute() {
  const { importId } = Route.useParams();
  return <ImportRisksPage importId={importId} />;
}
