import { describe, expect, it } from 'vitest';

import { clientFormSchema } from './client-form-schema';

describe('the declared employee count', () => {
  const count = clientFormSchema.shape.declaredEmployeeCount;

  it('accepts an empty count and one up to a million', () => {
    expect(count.safeParse('').success).toBe(true);
    expect(count.safeParse('1000000').success).toBe(true);
  });

  it('refuses more than a million, as the API does', () => {
    const result = count.safeParse('1000001');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'Numărul de angajați este de cel mult 1.000.000.'
    );
  });
});
