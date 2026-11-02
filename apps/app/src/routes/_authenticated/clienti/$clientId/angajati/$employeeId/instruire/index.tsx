import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_authenticated/clienti/$clientId/angajati/$employeeId/instruire/'
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/clienti/$clientId/angajati/$employeeId/instruire/ssm',
      params,
      replace: true,
    });
  },
});
