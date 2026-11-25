import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import {
  getGetDutiesAcknowledgementQueryKey,
  getListEmployeesQueryKey,
  getListOrganizationEmployeesQueryKey,
} from '@/api/generated/api';

import { invalidateClientDutiesAcknowledgements } from './use-duties-acknowledgement';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const otherClientId = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';

describe('refreshing the sheets once document 13 is issued', () => {
  it("marks every worker's sheet of the client and both workers lists stale, and nothing else", async () => {
    const queryClient = new QueryClient();
    const keys = {
      first: [...getGetDutiesAcknowledgementQueryKey(clientId, 'e1'), 'user'],
      second: [...getGetDutiesAcknowledgementQueryKey(clientId, 'e2'), 'user'],
      other: [...getGetDutiesAcknowledgementQueryKey(otherClientId, 'e3'), 'user'],
      employee: [`/clients/${clientId}/employees/e1`, 'user'],
      list: [...getListEmployeesQueryKey(clientId), 'user'],
      organization: [...getListOrganizationEmployeesQueryKey(), 'user'],
    };
    for (const key of Object.values(keys)) queryClient.setQueryData(key, {});

    await invalidateClientDutiesAcknowledgements(queryClient, clientId);

    expect(
      Object.fromEntries(
        Object.entries(keys).map(([name, key]) => [
          name,
          queryClient.getQueryState(key)?.isInvalidated,
        ])
      )
    ).toEqual({
      first: true,
      second: true,
      other: false,
      employee: false,
      list: true,
      organization: true,
    });
  });
});
