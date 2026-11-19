import { clientConflictReasons, type RiskEvaluationErrorReason } from '@ssm-usor/contracts';

import { apiErrorReason, ApiHttpError } from '@/api/http';
import { commonFailure } from '@/lib/api-errors';

export const failureReason = (cause: unknown) =>
  apiErrorReason(cause) as RiskEvaluationErrorReason | undefined;

export function evaluationFailure(cause: unknown, fallback: string) {
  if (!(cause instanceof ApiHttpError)) return fallback;
  const reason = failureReason(cause);
  if (reason === 'risk_evaluation_exists') {
    return 'Fișa de evaluare a riscurilor există deja; reîncarcă pagina ca s-o vezi.';
  }
  if (reason === 'risk_evaluation_name_taken') {
    return 'Clientul are deja o fișă de evaluare a riscurilor cu această denumire.';
  }
  if (reason === 'sensitive_groups_evaluated') {
    return 'Grupurile sensibile au deja o fișă de evaluare a riscurilor; reîncarcă pagina ca s-o vezi.';
  }
  if (reason === clientConflictReasons.clientArchived) {
    return 'Clientul este arhivat; fișele lui de evaluare a riscurilor nu se mai schimbă.';
  }
  if (cause.status === 404) return 'Fișa sau factorul nu mai există la acest client.';
  return commonFailure(cause) ?? fallback;
}
