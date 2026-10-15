import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/instructions/')({
  beforeLoad: () => {
    throw redirect({ to: '/instructions/ssm', replace: true });
  },
});
