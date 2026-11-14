import { BackLink } from '@/components/back-link';
import { RiskEvaluationPending } from '@/features/risk-evaluations/risk-evaluation-pending';

export function ProfilePending() {
  return (
    <RiskEvaluationPending
      back={<BackLink to="/evaluari-de-risc" label="Înapoi la evaluările de risc" />}
    />
  );
}
