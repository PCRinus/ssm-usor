import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { getListJobPositionsQueryKey } from '@/api/generated/api';

import { invalidateTrainings } from './training-queries';

const clientId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
const otherClientId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('invalidateTrainings', () => {
  it("refreshes the client's positions, whose workers to train a training changes", async () => {
    const queryClient = new QueryClient();
    const positions = [...getListJobPositionsQueryKey(clientId), 'user-one'];
    const otherPositions = [...getListJobPositionsQueryKey(otherClientId), 'user-one'];
    queryClient.setQueryData(positions, { items: [] });
    queryClient.setQueryData(otherPositions, { items: [] });

    await invalidateTrainings(queryClient, clientId);

    expect(queryClient.getQueryState(positions)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherPositions)?.isInvalidated).toBe(false);
  });
});
