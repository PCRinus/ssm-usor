import { BackLink } from '@/components/back-link';
import { RiskEvaluationPending } from '@/features/risk-evaluations/risk-evaluation-pending';

export function ProfilePending() {
  return (
    <div className="grid gap-4">
      <div className="flex">
        <BackLink to="/evaluari-de-risc" label="Înapoi la evaluările de risc" />
      </div>
      <RiskEvaluationPending />
    </div>
  );
}
