import { createFileRoute, redirect } from '@tanstack/react-router';

// An old address, kept so that bookmarks and links already sent still arrive.
export const Route = createFileRoute('/_authenticated/clienti/$clientId/date-documente')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/clienti/$clientId/instruire',
      params: { clientId: params.clientId },
      replace: true,
    });
  },
});
