import type { RiskEvaluationErrorReason } from '@ssm-usor/contracts';

import type { ApiErrorResponse } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';

export const failureReason = (cause: unknown) =>
  cause instanceof ApiHttpError
    ? ((cause.body as Partial<ApiErrorResponse> | null)?.reason as
        RiskEvaluationErrorReason | undefined)
    : undefined;

export function evaluationFailure(cause: unknown, fallback: string) {
  if (!(cause instanceof ApiHttpError)) return fallback;
  const reason = failureReason(cause);
  if (reason === 'risk_evaluation_exists') {
    return 'Fișa de evaluare există deja; reîncarcă pagina ca s-o vezi.';
  }
  if (reason === 'risk_evaluation_name_taken') {
    return 'Clientul are deja o fișă de evaluare cu această denumire.';
  }
  if (reason === 'sensitive_groups_evaluated') {
    return 'Grupurile sensibile au deja o fișă de evaluare; reîncarcă pagina ca s-o vezi.';
  }
  if (reason === 'client_archived') {
    return 'Clientul este arhivat; fișele lui de evaluare nu se mai schimbă.';
  }
  if (cause.status === 404) return 'Fișa sau factorul nu mai există la acest client.';
  if (cause.status === 401) {
    return 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.';
  }
  return fallback;
}
