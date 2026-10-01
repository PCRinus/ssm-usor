import type { RiskEvaluationErrorReason } from '@ssm-usor/contracts';

import type { ApiErrorResponse } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';

export const failureReason = (cause: unknown) =>
  cause instanceof ApiHttpError
    ? ((cause.body as Partial<ApiErrorResponse> | null)?.reason as
        RiskEvaluationErrorReason | 'client_archived' | undefined)
    : undefined;

export function evaluationFailure(cause: unknown, fallback: string) {
  if (!(cause instanceof ApiHttpError)) return fallback;
  const reason = failureReason(cause);
  if (reason === 'risk_evaluation_exists') {
    return 'Evaluarea există deja; reîncarcă pagina ca s-o vezi.';
  }
  if (reason === 'risk_evaluation_name_taken') {
    return 'Clientul are deja o evaluare cu această denumire.';
  }
  if (cause.status === 409) return 'Clientul este arhivat; evaluările lui nu se mai schimbă.';
  if (cause.status === 404) return 'Evaluarea sau factorul nu mai există la acest client.';
  if (cause.status === 401) {
    return 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.';
  }
  return fallback;
}
