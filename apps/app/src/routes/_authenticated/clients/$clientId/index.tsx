import { createFileRoute, redirect } from '@tanstack/react-router';

// The client has no overview yet; its first section is the employees list.
export const Route = createFileRoute('/_authenticated/clients/$clientId/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/clients/$clientId/employees',
      params: { clientId: params.clientId },
      replace: true,
    });
  },
});
