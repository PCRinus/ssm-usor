import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ApiError } from './errors';
import { parsed } from './validation';

const schema = z.object({
  page: z.coerce.number().int().min(1),
  filter: z.object({ q: z.string() }),
});

describe('parsed', () => {
  it('gives back the parsed value', () => {
    expect(parsed(schema, { page: '2', filter: { q: 'a' } })).toEqual({
      page: 2,
      filter: { q: 'a' },
    });
  });

  it('refuses with a validation error naming each field by its dotted path', () => {
    let refusal: unknown;
    try {
      parsed(schema, { page: '0', filter: {} });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(ApiError);
    expect(refusal).toMatchObject({ code: 'validation_error' });
    expect((refusal as ApiError).issues?.map((issue) => issue.path)).toEqual(['page', 'filter.q']);
  });
});
