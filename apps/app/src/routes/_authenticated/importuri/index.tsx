import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/importuri/')({
  beforeLoad: () => {
    throw redirect({ to: '/importuri/clienti', replace: true });
  },
});
