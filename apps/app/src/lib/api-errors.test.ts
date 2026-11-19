import { impersonationErrorReasons, readOnlyReason } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { ApiHttpError } from '@/api/http';
import { impersonationRefusedMessage } from '@/features/impersonation/refusal';

import { commonFailure, readOnlyMessage, sessionExpiredMessage } from './api-errors';

describe('the failures every page words the same', () => {
  it('asks to sign in again when the session has ended', () => {
    expect(commonFailure(new ApiHttpError(401, undefined))).toBe(sessionExpiredMessage);
  });

  it('says the account is read-only when a change is refused for it', () => {
    const refused = new ApiHttpError(403, { error: 'forbidden', reason: readOnlyReason });
    expect(commonFailure(refused)).toBe(readOnlyMessage);
  });

  it('says what an admin acting as a member cannot do', () => {
    const refused = new ApiHttpError(403, {
      error: 'forbidden',
      reason: impersonationErrorReasons.refused,
    });
    expect(commonFailure(refused)).toBe(impersonationRefusedMessage);
  });

  it('leaves every other failure to the page', () => {
    expect(commonFailure(new ApiHttpError(403, { error: 'forbidden' }))).toBeUndefined();
    expect(commonFailure(new ApiHttpError(500, undefined))).toBeUndefined();
    expect(commonFailure(new TypeError('Failed to fetch'))).toBeUndefined();
  });
});
