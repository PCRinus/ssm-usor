import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { invalidateSignatures } from './signature-queries';

const clientId = '11111111-2222-4333-8444-555555555555';
const otherClientId = '99999999-2222-4333-8444-555555555555';
const employeeId = '22222222-3333-4444-8555-666666666666';

describe('invalidateSignatures', () => {
  it("refreshes the client's employees' tests, where a test sheet's slots are, and nothing of another client", async () => {
    const queryClient = new QueryClient();
    const keys = {
      tests: [`/clients/${clientId}/employees/${employeeId}/tests`],
      otherTests: [`/clients/${otherClientId}/employees/${employeeId}/tests`],
      employee: [`/clients/${clientId}/employees/${employeeId}`],
      recordSignatures: [`/clients/${clientId}/training-records/r1/signatures`],
    };
    for (const key of Object.values(keys)) queryClient.setQueryData(key, {});
    await invalidateSignatures(queryClient, clientId);
    const invalidated = (key: string[]) => queryClient.getQueryState(key)?.isInvalidated;
    expect(invalidated(keys.tests)).toBe(true);
    expect(invalidated(keys.recordSignatures)).toBe(true);
    expect(invalidated(keys.otherTests)).toBe(false);
    expect(invalidated(keys.employee)).toBe(false);
  });
});

describe('signatures refresh prepared files of the client', () => {
  it('discards an initial link response that was read before the signatures changed', async () => {
    const client = new QueryClient();
    const key = ['training-sheet-link', clientId, employeeId, 'ssm', 1];
    let finishOld!: (link: { url: string }) => void;
    const old = new Promise<{ url: string }>((resolve) => {
      finishOld = resolve;
    });
    const load = vi
      .fn<() => Promise<{ url: string }>>()
      .mockReturnValueOnce(old)
      .mockResolvedValueOnce({ url: 'v2.pdf' });
    const observer = new QueryObserver(client, {
      queryKey: key,
      queryFn: load,
      staleTime: 540_000,
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      expect(load).toHaveBeenCalledTimes(1);
      await invalidateSignatures(client, clientId);
      expect(observer.getCurrentResult().data?.url).toBe('v2.pdf');
      finishOld({ url: 'v1.pdf' });
      await old;
      expect(load).toHaveBeenCalledTimes(2);
      expect(client.getQueryData(key)).toEqual({ url: 'v2.pdf' });
    } finally {
      unsubscribe();
      client.clear();
    }
  });

  it.each(['signing-agreement-link', 'training-sheet-link', 'test-sheet-link'])(
    'refreshes %s without touching another client',
    async (kind) => {
      const client = new QueryClient();
      const key = [kind, 'client', 'employee', 'ssm', 1];
      const other = [kind, 'other-client', 'employee'];
      client.setQueryData(key, { url: 'v1.pdf' });
      client.setQueryData(other, { url: 'other.pdf' });
      const load = vi.fn(async () => ({ url: 'v2.pdf' }));
      const observer = new QueryObserver(client, {
        queryKey: key,
        queryFn: load,
        staleTime: 540_000,
      });
      const unsubscribe = observer.subscribe(() => {});
      try {
        await invalidateSignatures(client, 'client');
        expect(observer.getCurrentResult().data?.url).toBe('v2.pdf');
        expect(load).toHaveBeenCalledTimes(1);
        expect(client.getQueryState(other)?.isInvalidated).toBe(false);
      } finally {
        unsubscribe();
        client.clear();
      }
    }
  );
});
