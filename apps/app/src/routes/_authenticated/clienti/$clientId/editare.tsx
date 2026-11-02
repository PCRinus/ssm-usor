import { createFileRoute, redirect } from '@tanstack/react-router';

// An old address, kept so that bookmarks and links already sent still arrive.
export const Route = createFileRoute('/_authenticated/clienti/$clientId/editare')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/clienti/$clientId/detalii',
      params: { clientId: params.clientId },
      replace: true,
    });
  },
});
