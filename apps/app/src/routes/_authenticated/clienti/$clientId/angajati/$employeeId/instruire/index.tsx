import { createFileRoute, redirect } from '@tanstack/react-router';

import { keepOpener } from '@/app/opener';

export const Route = createFileRoute(
  '/_authenticated/clienti/$clientId/angajati/$employeeId/instruire/'
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/clienti/$clientId/angajati/$employeeId/instruire/ssm',
      params,
      replace: true,
      state: keepOpener,
    });
  },
});
