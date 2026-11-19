import { describe, expect, it } from 'vitest';

import { modelUsageOf } from './import-queries';

describe('modelUsageOf', () => {
  it('reads numbers given as text, and a missing count as none', () => {
    expect(
      modelUsageOf({
        input_tokens: '181000',
        cached_input_tokens: null,
        output_tokens: 4200,
        cost_usd: '0.26',
      })
    ).toEqual({ costUsd: 0.26, inputTokens: 181_000, cachedInputTokens: 0, outputTokens: 4200 });
  });
});
