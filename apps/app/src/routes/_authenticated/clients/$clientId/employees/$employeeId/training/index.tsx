import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_authenticated/clients/$clientId/employees/$employeeId/training/'
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/clients/$clientId/employees/$employeeId/training/ssm',
      params,
      replace: true,
    });
  },
});
