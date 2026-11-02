import { createFileRoute } from '@tanstack/react-router';

import { ImportFilesPage } from '@/features/imports/import-page';

export const Route = createFileRoute('/_authenticated/clienti/import/$importId/fisiere')({
  staticData: { title: 'Fișierele importului' },
  component: ImportFilesRoute,
});

function ImportFilesRoute() {
  const { importId } = Route.useParams();
  return <ImportFilesPage importId={importId} />;
}
