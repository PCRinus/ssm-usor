import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/tests/')({
  beforeLoad: () => {
    throw redirect({ to: '/tests/ssm', replace: true });
  },
});
