import { afterEach, beforeEach, expect, type Mock, vi } from 'vitest';

import * as api from '@/api/generated/api';

import { queryPending } from './portal';

vi.mock('@/api/generated/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/generated/api')>();
  return Object.fromEntries(
    Object.entries(actual).map(([name, value]) => [
      name,
      typeof value === 'function' && !/(QueryKey|MutationKey|Url|Options)$/.test(name)
        ? vi.fn()
        : value,
    ])
  );
});

const mutationIdle = () => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
  isError: false,
});

const unexpectedCalls: string[] = [];

export const takeUnexpectedCalls = () => unexpectedCalls.splice(0);

const isQueryHook = (name: string) =>
  /^use[A-Z]/.test(name) && `get${name.slice('use'.length)}QueryKey` in api;

beforeEach(() => {
  for (const [name, value] of Object.entries(api)) {
    if (!vi.isMockFunction(value)) continue;
    const stub = value as Mock;
    stub.mockReset();
    if (isQueryHook(name)) stub.mockReturnValue(queryPending());
    else if (/^use[A-Z]/.test(name)) stub.mockReturnValue(mutationIdle());
    else {
      stub.mockImplementation(() => {
        unexpectedCalls.push(name);
        return Promise.reject(new Error(`Unexpected call: ${name}`));
      });
    }
  }
});

// The page catches the rejection and shows its error state, which a test may never look at.
afterEach(() => {
  expect(takeUnexpectedCalls(), 'calls to the API nobody stubbed').toEqual([]);
});
