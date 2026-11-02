import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/teste/')({
  beforeLoad: () => {
    throw redirect({ to: '/teste/ssm', replace: true });
  },
});
