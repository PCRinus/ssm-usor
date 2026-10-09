import { createFileRoute } from '@tanstack/react-router';

import { LegislationLayout } from '@/features/legislation/legislation-layout';

export const Route = createFileRoute('/_authenticated/legislatie')({
  staticData: { title: 'Legislație' },
  component: LegislationLayout,
});
