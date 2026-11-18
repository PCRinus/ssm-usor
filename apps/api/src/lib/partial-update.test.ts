import { describe, expect, it } from 'vitest';

import { sentColumns } from './partial-update';

describe('sentColumns', () => {
  it('keeps a null and a false, and drops what was not sent', () => {
    expect(
      sentColumns({ name: undefined, role: null, excluded: false, months: 6, kinds: [] })
    ).toEqual({ role: null, excluded: false, months: 6, kinds: [] });
  });
});
