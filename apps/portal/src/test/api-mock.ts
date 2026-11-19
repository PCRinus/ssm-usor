import { beforeEach, type Mock, vi } from 'vitest';

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

beforeEach(() => {
  for (const [name, value] of Object.entries(api)) {
    if (!vi.isMockFunction(value)) continue;
    const stub = value as Mock;
    stub.mockReset();
    if (/^use(Get|List)[A-Z]/.test(name)) stub.mockReturnValue(queryPending());
    else if (/^use[A-Z]/.test(name)) stub.mockReturnValue(mutationIdle());
    else stub.mockRejectedValue(new Error(`Unexpected call: ${name}`));
  }
});
