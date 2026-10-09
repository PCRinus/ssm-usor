import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/legislatie/')({
  beforeLoad: () => {
    throw redirect({ to: '/legislatie/documente', replace: true });
  },
});
