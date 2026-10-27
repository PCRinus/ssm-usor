import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { ImportSectionPage } from '@/features/imports/import-page';
import { sectionIds, sectionLabels } from '@/features/imports/review-model';

export const Route = createFileRoute('/_authenticated/clients/import/$importId/$section')({
  params: { parse: (params) => ({ section: z.enum(sectionIds).parse(params.section) }) },
  loader: ({ params }) => ({ crumb: sectionLabels[params.section] }),
  component: ImportSectionRoute,
});

function ImportSectionRoute() {
  const { importId, section } = Route.useParams();
  return <ImportSectionPage importId={importId} section={section} />;
}
