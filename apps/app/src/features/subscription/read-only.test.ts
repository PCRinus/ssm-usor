import { describe, expect, it } from 'vitest';

import { ApiHttpError } from '@/api/http';
import { uploadFailureMessage } from '@/features/client-files/client-file-format';

import { isReadOnlyError, readOnlyMessage } from './read-only';

describe('read-only refusals', () => {
  const refused = new ApiHttpError(403, {
    error: 'forbidden',
    message: 'The organization is read-only.',
    reason: 'read_only',
  });

  it('tells a read-only refusal from any other 403', () => {
    expect(isReadOnlyError(refused)).toBe(true);
    expect(isReadOnlyError(new ApiHttpError(403, { error: 'forbidden', message: 'No.' }))).toBe(
      false
    );
    expect(isReadOnlyError(new Error('offline'))).toBe(false);
  });

  it('names the read-only account when an upload is refused, not a missing permission', () => {
    expect(uploadFailureMessage(refused)).toBe(readOnlyMessage);
  });
});
