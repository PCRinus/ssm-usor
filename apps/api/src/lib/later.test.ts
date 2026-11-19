import type { Context } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import type { ApiEnv } from './env';
import { ApiError } from './errors';
import { failureLabel, later } from './later';

const contextWith = (executionCtx: () => { waitUntil: (work: Promise<unknown>) => void }) =>
  ({
    get executionCtx() {
      return executionCtx();
    },
  }) as unknown as Context<ApiEnv>;

describe('later', () => {
  it('hands the work to the runtime to finish after the response', () => {
    const waitUntil = vi.fn();
    const work = Promise.resolve();
    later(
      contextWith(() => ({ waitUntil })),
      work
    );
    expect(waitUntil).toHaveBeenCalledWith(work);
  });

  it('lets the work run on where the runtime gives no execution context', () => {
    const work = Promise.resolve();
    expect(() =>
      later(
        contextWith(() => {
          throw new Error('This context has no ExecutionContext');
        }),
        work
      )
    ).not.toThrow();
  });
});

describe('failureLabel', () => {
  it('names an API error by its reason, else its code', () => {
    expect(failureLabel(new ApiError('conflict', 'x', undefined, 'slot_signed'))).toBe(
      'slot_signed'
    );
    expect(failureLabel(new ApiError('service_unavailable'))).toBe('service_unavailable');
  });

  it('names any other error by its name alone, never its message', () => {
    expect(failureLabel(new TypeError('the row of Popescu Ion'))).toBe('TypeError');
    expect(failureLabel('a string')).toBe('unknown');
  });
});
