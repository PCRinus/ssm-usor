import { QueryClient, type QueryKey } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import {
  getGetClientQueryKey,
  getGetEmployeeQueryKey,
  getGetMeQueryKey,
  getListEmployeesQueryKey,
  getListJobPositionsQueryKey,
  getListWorkplacesQueryKey,
} from '@/api/generated/api';

import { refreshWorkforce } from './employee-cache';

const clientId = '0f3c6a4e-0d8f-4b7e-9a51-3c2d1e0f9a10';
const otherClientId = '6b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const employeeId = 'a6f0c1d2-3e4f-4a5b-8c6d-7e8f9a0b1c2d';
const user = 'user-one';

async function cached() {
  const queryClient = new QueryClient();
  const keys = {
    list: [...getListEmployeesQueryKey(clientId, { page: 2 }), user],
    employee: [...getGetEmployeeQueryKey(clientId, employeeId), user],
    me: [...getGetMeQueryKey(), user],
    positions: [...getListJobPositionsQueryKey(clientId), user],
    workplaces: [...getListWorkplacesQueryKey(clientId), user],
    otherList: [...getListEmployeesQueryKey(otherClientId), user],
  } satisfies Record<string, QueryKey>;
  for (const key of Object.values(keys)) queryClient.setQueryData(key, {});
  let clientReads = 0;
  await queryClient.fetchQuery({
    queryKey: [...getGetClientQueryKey(clientId), user],
    queryFn: () => ({ read: ++clientReads }),
  });
  const invalidated = (key: QueryKey) => queryClient.getQueryState(key)?.isInvalidated;
  return { queryClient, keys, invalidated, clientReads: () => clientReads };
}

describe('refreshWorkforce', () => {
  it('refreshes everything that counts the client’s current workers', async () => {
    const { queryClient, keys, invalidated, clientReads } = await cached();

    await refreshWorkforce(queryClient, clientId, { employeeId });

    expect(invalidated(keys.list)).toBe(true);
    expect(invalidated(keys.employee)).toBe(true);
    expect(invalidated(keys.me)).toBe(true);
    expect(invalidated(keys.positions)).toBe(true);
    expect(invalidated(keys.workplaces)).toBe(true);
    expect(clientReads()).toBe(2);
    expect(invalidated(keys.otherList)).toBe(false);
  });

  it('leaves a worker’s page alone when no worker is named', async () => {
    const { queryClient, keys, invalidated } = await cached();

    await refreshWorkforce(queryClient, clientId);

    expect(invalidated(keys.list)).toBe(true);
    expect(invalidated(keys.employee)).toBe(false);
  });
});
