import { describe, expect, it } from 'vitest';

import { createTestQueryClient } from './mount';

const failing = (status: number) => {
  let attempts = 0;
  const queryFn = async () => {
    attempts += 1;
    throw Object.assign(new Error('failed'), { status });
  };
  return { queryFn, attempts: () => attempts };
};

describe('the test query client', () => {
  it('retries a failed read twice as the app does, without waiting between attempts', async () => {
    const server = failing(500);
    const started = Date.now();

    await expect(
      createTestQueryClient().fetchQuery({ queryKey: ['down'], queryFn: server.queryFn })
    ).rejects.toThrow('failed');

    expect(server.attempts()).toBe(3);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('does not retry a refused read', async () => {
    const refused = failing(403);

    await expect(
      createTestQueryClient().fetchQuery({ queryKey: ['refused'], queryFn: refused.queryFn })
    ).rejects.toThrow('failed');

    expect(refused.attempts()).toBe(1);
  });
});
