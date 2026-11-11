import { ApiHttpError } from '@ssm-usor/api-http';

import { identityChangedReason } from './acting-as';

export const impersonationRefusedMessage =
  'Nu se poate în timp ce acționezi ca membru: semnarea și trimiterile sunt oprite.';

const reasonOf = (error: unknown) =>
  error instanceof ApiHttpError
    ? (error.body as { reason?: unknown } | null | undefined)?.reason
    : undefined;

export const isImpersonationRefused = (error: unknown) =>
  reasonOf(error) === 'impersonation_refused';

export const isIdentityChanged = (error: unknown) =>
  error instanceof ApiHttpError &&
  error.status === 409 &&
  reasonOf(error) === identityChangedReason;

// For the pages that send what is refused: the page shows the message where the action was, and
// the toast every other page relies on stays away.
export const wordingRefusalHere = <T extends object>(request: T) => ({
  ...request,
  refusalShownByPage: true,
});

export const impersonationRefusal = (error: unknown) =>
  isImpersonationRefused(error) ? impersonationRefusedMessage : undefined;
