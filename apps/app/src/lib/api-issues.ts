import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import type { ApiErrorResponse } from '@/api/generated/api';

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
