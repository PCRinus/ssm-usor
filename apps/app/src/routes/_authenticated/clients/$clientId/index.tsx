import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/clients/$clientId/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/clients/$clientId/details',
      params: { clientId: params.clientId },
      replace: true,
    });
  },
});
