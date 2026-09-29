import { createFileRoute, redirect } from '@tanstack/react-router';

// An old address, kept so that bookmarks and links already sent still arrive.
export const Route = createFileRoute('/_authenticated/clients/$clientId/document-data')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/clients/$clientId/training',
      params: { clientId: params.clientId },
      replace: true,
    });
  },
});
