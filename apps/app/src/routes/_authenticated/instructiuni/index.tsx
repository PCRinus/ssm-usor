import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/instructiuni/')({
  beforeLoad: () => {
    throw redirect({ to: '/instructiuni/ssm', replace: true });
  },
});
