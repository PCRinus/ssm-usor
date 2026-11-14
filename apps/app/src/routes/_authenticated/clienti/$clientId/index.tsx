import { createFileRoute, redirect } from '@tanstack/react-router';

import { keepOpener } from '@/app/opener';

export const Route = createFileRoute('/_authenticated/clienti/$clientId/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/clienti/$clientId/detalii',
      params: { clientId: params.clientId },
      replace: true,
      state: keepOpener,
    });
  },
});
