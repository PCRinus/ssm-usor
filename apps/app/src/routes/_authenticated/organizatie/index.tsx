import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/organizatie/')({
  beforeLoad: () => {
    throw redirect({ to: '/organizatie/echipa', replace: true });
  },
});
