import { readOnlyReason } from '@ssm-usor/contracts';

import { ApiHttpError } from '@/api/http';

export const readOnlyMessage =
  'Contul este doar pentru citire, așa că nu se mai pot face modificări.';

export function isReadOnlyError(error: unknown) {
  return (
    error instanceof ApiHttpError &&
    (error.body as { reason?: unknown } | null)?.reason === readOnlyReason
  );
}
