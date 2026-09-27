import { afterEach, describe, expect, it, vi } from 'vitest';

import { fromDatabaseError } from './db';

afterEach(() => vi.restoreAllMocks());

describe('fromDatabaseError', () => {
  it('logs why a request never reached the database', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = fromDatabaseError(
      { code: '', message: 'TypeError: fetch failed' },
      'list clients'
    );
    expect(error.code).toBe('service_unavailable');
    expect(logged).toHaveBeenCalledWith(
      'Database request failed (list clients): no code: TypeError: fetch failed'
    );
  });

  it('logs only the code of an error the database raised', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = fromDatabaseError(
      { code: 'XX000', message: 'failed on row (Ion Popescu)' },
      'save employee'
    );
    expect(error.code).toBe('internal_error');
    expect(logged).toHaveBeenCalledWith('Database request failed (save employee): XX000');
  });
});
