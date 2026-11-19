import { describe, expect, it } from 'vitest';

import { toIso, toIsoOrNull } from './timestamps';

describe('a database timestamp in the API', () => {
  it('is an ISO instant in UTC, whatever offset the database wrote', () => {
    expect(toIso('2026-10-02 10:00:00+03')).toBe('2026-10-02T07:00:00.000Z');
    expect(toIso('2026-10-02T08:00:00+00:00')).toBe('2026-10-02T08:00:00.000Z');
  });

  it('stays null when there is none', () => {
    expect(toIsoOrNull(null)).toBeNull();
    expect(toIsoOrNull(undefined)).toBeNull();
    expect(toIsoOrNull('2026-10-02T08:00:00.123456+00:00')).toBe('2026-10-02T08:00:00.123Z');
  });
});
