import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LibraryReviewStore } from './use-library-parts';

const importId = '0b6f2f4e-7d2a-4c1e-9a55-3e1f0c2d4b61';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const store = () =>
  new LibraryReviewStore(
    importId,
    'instructions_ssm',
    { changes: { instructions: {} }, version: 3 },
    { baseUrl: 'http://localhost:8787' },
    new QueryClient()
  );

describe('saving the review of a library part', () => {
  it('says that an expired part saves nothing more, and offers no retry', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: 'conflict', message: 'expired', reason: 'import_part_expired' },
        { status: 409 }
      )
    );
    const review = store();
    review.setInstruction('instruction-1', () => ({ included: false }));
    expect(await review.flush()).toEqual({
      error:
        'Propunerea a expirat la 14 zile după crearea clientului, așa că schimbarea ta nu a mai fost salvată, iar instrucțiunile nu mai pot fi confirmate.',
    });
    expect(review.getSnapshot()).toMatchObject({ error: null });
    expect(review.getSnapshot().closed).toMatch(/^Propunerea a expirat/);

    review.retry();
    review.setInstruction('instruction-2', () => ({ included: false }));
    await review.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('offers to save again after a failure a retry can fix', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    fetchMock.mockResolvedValueOnce(Response.json({ version: 4 }));
    const review = store();
    review.setInstruction('instruction-1', () => ({ included: false }));
    await vi.waitFor(() => expect(review.getSnapshot().error).not.toBeNull());
    expect(review.getSnapshot().closed).toBeNull();
    expect(await review.flush()).toEqual({ version: 4 });
  });
});
