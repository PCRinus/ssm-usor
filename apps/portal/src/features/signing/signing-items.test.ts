import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { invalidateSigningQueries } from './signing-items';

describe('signing refreshes prepared files', () => {
  it('discards an initial agreement link response read before signing completed', async () => {
    const client = new QueryClient();
    const key = ['signing-agreement-link', 'participant', 'employee'];
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
      await invalidateSigningQueries(client);
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
    'loads the latest version of an already prepared %s',
    async (kind) => {
      const client = new QueryClient();
      const key = [kind, 'participant', 'employee', 'ssm', 1];
      client.setQueryData(key, { url: 'v1.pdf' });
      const load = vi.fn(async () => ({ url: 'v2.pdf' }));
      const observer = new QueryObserver(client, {
        queryKey: key,
        queryFn: load,
        staleTime: 540_000,
      });
      const unsubscribe = observer.subscribe(() => {});
      try {
        expect(load).not.toHaveBeenCalled();
        await invalidateSigningQueries(client);
        expect(observer.getCurrentResult().data?.url).toBe('v2.pdf');
        expect(load).toHaveBeenCalledTimes(1);
      } finally {
        unsubscribe();
        client.clear();
      }
    }
  );
});
