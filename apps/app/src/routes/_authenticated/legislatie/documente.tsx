import { createFileRoute, redirect } from '@tanstack/react-router';

// The tab before the documents split by set; links to it still land somewhere.
export const Route = createFileRoute('/_authenticated/legislatie/documente')({
  beforeLoad: () => {
    throw redirect({ to: '/legislatie/documente-ssm', replace: true });
  },
});
