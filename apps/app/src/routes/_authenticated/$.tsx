import { createFileRoute } from '@tanstack/react-router';

import { PageNotFound } from '@/app/route-states';

export const Route = createFileRoute('/_authenticated/$')({
  staticData: { title: 'Pagina nu a fost găsită' },
  component: PageNotFound,
});
