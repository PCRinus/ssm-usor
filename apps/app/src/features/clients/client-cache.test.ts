import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import {
  type ClientResponse,
  getGetClientQueryKey,
  getListClientsQueryKey,
} from '@/api/generated/api';

import { storeClient } from './client-cache';

const clientId = '0f3c6a4e-0d8f-4b7e-9a51-3c2d1e0f9a10';
const user = 'user-one';

describe('storeClient', () => {
  it('writes the saved client where its page reads it and refreshes the lists', async () => {
    const queryClient = new QueryClient();
    const recordKey = [...getGetClientQueryKey(clientId), user];
    const listKey = [...getListClientsQueryKey({ page: 1 }), user];
    const otherKey = [...getGetClientQueryKey('6b1d2c3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e'), user];
    queryClient.setQueryData(recordKey, { client: { id: clientId, legalName: 'Vechi' } });
    queryClient.setQueryData(listKey, { items: [] });
    queryClient.setQueryData(otherKey, { client: { legalName: 'Altul' } });
    const saved = { client: { id: clientId, legalName: 'Nou' }, canDelete: false };

    await storeClient(queryClient, saved as ClientResponse);

    expect(queryClient.getQueryData(recordKey)).toEqual(saved);
    expect(queryClient.getQueryState(recordKey)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(otherKey)).toEqual({ client: { legalName: 'Altul' } });
  });
});
