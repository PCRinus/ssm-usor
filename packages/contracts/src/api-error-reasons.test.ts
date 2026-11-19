import { describe, expect, it } from 'vitest';

import { apiErrorReasons } from './api-error-reasons';

describe('apiErrorReasons', () => {
  it('holds snake_case identifiers only', () => {
    expect(apiErrorReasons.filter((reason) => !/^[a-z0-9]+(_[a-z0-9]+)*$/.test(reason))).toEqual(
      []
    );
  });
});
