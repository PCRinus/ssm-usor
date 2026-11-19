import { createFileRoute } from '@tanstack/react-router';

import { ImportsLayout } from '@/features/imports/list/imports-layout';

export const Route = createFileRoute('/_authenticated/importuri')({
  staticData: { title: 'Importuri AI' },
  component: ImportsLayout,
});
