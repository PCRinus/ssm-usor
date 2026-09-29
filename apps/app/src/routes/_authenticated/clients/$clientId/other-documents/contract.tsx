import { createFileRoute, redirect } from '@tanstack/react-router';

// An old address, kept so that bookmarks and links already sent still arrive.
export const Route = createFileRoute('/_authenticated/clients/$clientId/other-documents/contract')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/clients/$clientId/contract/edit',
      params: { clientId: params.clientId },
      replace: true,
    });
  },
});
