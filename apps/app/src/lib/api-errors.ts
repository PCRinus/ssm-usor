import { readOnlyReason } from '@ssm-usor/contracts';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import type { ApiErrorResponse } from '@/api/generated/api';
import { apiErrorReason, ApiHttpError } from '@/api/http';
import { impersonationRefusal } from '@/features/impersonation/refusal';

export const sessionExpiredMessage =
  'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.';

export const readOnlyMessage =
  'Contul este doar pentru citire, așa că nu se mai pot face modificări.';

export const isReadOnlyError = (cause: unknown) => apiErrorReason(cause) === readOnlyReason;

export const isSessionExpired = (cause: unknown) =>
  cause instanceof ApiHttpError && cause.status === 401;

// The refusals that mean the same on every page, whatever the page was doing; a page words the
// rest itself. A page that sends a route refused while impersonating must also send
// `wordingRefusalHere`, or the impersonation line shows twice: here and in the global toast.
export function commonFailure(cause: unknown): string | undefined {
  if (isSessionExpired(cause)) return sessionExpiredMessage;
  if (isReadOnlyError(cause)) return readOnlyMessage;
  return impersonationRefusal(cause);
}

export const rejectedValueMessage = 'Valoarea nu a fost acceptată. Verifică acest câmp.';

export type IssueTarget<V extends FieldValues> = { field: Path<V>; message?: string };

// The API words its issues in English for whoever reads its logs, and names the request's
// fields, not the form's. The member reads the form's own Romanian, or a general line.
// Returns whether any issue found a field.
export function setApiIssues<V extends FieldValues>(
  setError: UseFormSetError<V>,
  issues: ApiErrorResponse['issues'],
  targetOf: (path: string) => IssueTarget<V> | undefined
) {
  let mapped = false;
  for (const issue of issues ?? []) {
    const target = targetOf(issue.path);
    if (!target) continue;
    setError(target.field, { message: target.message ?? rejectedValueMessage });
    mapped = true;
  }
  return mapped;
}
