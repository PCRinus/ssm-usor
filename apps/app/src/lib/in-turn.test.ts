import { describe, expect, it } from 'vitest';

import { inTurn } from './in-turn';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('inTurn', () => {
  it('starts a save only after the previous one for the same key has finished', async () => {
    const order: string[] = [];
    const first = deferred();
    const a = inTurn('record', async () => {
      order.push('a started');
      await first.promise;
      order.push('a finished');
    });
    const b = inTurn('record', async () => {
      order.push('b started');
    });
    await Promise.resolve();
    expect(order).toEqual(['a started']);
    first.resolve();
    await Promise.all([a, b]);
    expect(order).toEqual(['a started', 'a finished', 'b started']);
  });

  it('still runs the next save when the previous one fails', async () => {
    const failed = inTurn('failing', () => Promise.reject(new Error('offline')));
    const next = inTurn('failing', () => Promise.resolve('saved'));
    await expect(failed).rejects.toThrow('offline');
    await expect(next).resolves.toBe('saved');
  });

  it('does not hold back saves of other records', async () => {
    const held = deferred();
    const slow = inTurn('one', () => held.promise);
    await expect(inTurn('two', () => Promise.resolve('other'))).resolves.toBe('other');
    held.resolve();
    await slow;
  });
});
