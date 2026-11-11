import { ApiHttpError } from '@ssm-usor/api-http';

export const impersonationRefusedMessage =
  'Nu se poate în timp ce acționezi ca membru: semnarea și trimiterile sunt oprite.';

export function isImpersonationRefused(error: unknown) {
  return (
    error instanceof ApiHttpError &&
    (error.body as { reason?: unknown } | null | undefined)?.reason === 'impersonation_refused'
  );
}
