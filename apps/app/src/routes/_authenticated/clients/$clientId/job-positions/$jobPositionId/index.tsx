import { createFileRoute } from '@tanstack/react-router';

import { JobPositionPage } from '@/features/job-positions/job-position-page';

export const Route = createFileRoute(
  '/_authenticated/clients/$clientId/job-positions/$jobPositionId/'
)({
  component: JobPositionPage,
});
