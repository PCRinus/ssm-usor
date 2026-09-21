import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/organization/')({
  beforeLoad: () => {
    throw redirect({ to: '/organization/team', replace: true });
  },
});
