import { useParams } from '@tanstack/react-router';

import { BackLink } from '@/components/back-link';
import { JobPositionBack } from '@/features/job-positions/job-position-back';

export function RiskEvaluationBack() {
  const { clientId, jobPositionId } = useParams({ strict: false });
  if (!clientId || !jobPositionId) return <JobPositionBack />;
  return (
    <BackLink
      to="/clienti/$clientId/posturi/$jobPositionId"
      params={{ clientId, jobPositionId }}
      label="Înapoi la post"
    />
  );
}
