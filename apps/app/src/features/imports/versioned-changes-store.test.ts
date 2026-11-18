import { importErrorReasons } from '@ssm-usor/contracts';
import { describe, expect, it, vi } from 'vitest';

import { ApiHttpError } from '@/api/http';

import { type Saved, VersionedChangesStore } from './versioned-changes-store';

type Changes = { values: Record<string, number> };

const refusal = (reason: string) =>
  new ApiHttpError(409, { error: 'conflict', message: reason, reason });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function storeWith(save: (version: number, changes: Changes) => Promise<Saved>) {
  return new VersionedChangesStore<Changes>({
    initial: { changes: { values: {} }, version: 3 },
    save,
    savedByOthers: 'Altcineva a modificat.',
    closedBy: { [importErrorReasons.partExpired]: 'A expirat.' },
  });
}

const set = (key: string, value: number) => (current: Changes) => ({
  values: { ...current.values, [key]: value },
});

describe('a review that saves its changes on a version', () => {
  it('sends only the latest of the changes made while a save is on its way', async () => {
    const first = deferred<Saved>();
    const save = vi
      .fn<(version: number, changes: Changes) => Promise<Saved>>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ version: 5 });
    const store = storeWith(save);

    store.update(set('a', 1));
    store.update(set('b', 2));
    store.update(set('c', 3));
    expect(store.getSnapshot().saving).toBe(true);
    first.resolve({ version: 4 });

    expect(await store.flush()).toEqual({ version: 5 });
    expect(save.mock.calls).toEqual([
      [3, { values: { a: 1 } }],
      [4, { values: { a: 1, b: 2, c: 3 } }],
    ]);
    expect(store.getSnapshot()).toMatchObject({ saving: false, error: null });
  });

  it('stops saving once someone else saved first', async () => {
    const save = vi.fn().mockRejectedValue(refusal(importErrorReasons.changed));
    const store = storeWith(save);

    store.update(set('a', 1));
    expect(await store.flush()).toEqual({ error: 'Altcineva a modificat.' });
    store.update(set('b', 2));
    store.retry();
    await store.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({ conflict: true, changes: { values: { a: 1 } } });
  });

  it('closes for good on a refusal no retry can fix, and says why', async () => {
    const save = vi.fn().mockRejectedValue(refusal(importErrorReasons.partExpired));
    const store = storeWith(save);

    store.update(set('a', 1));
    expect(await store.flush()).toEqual({ error: 'A expirat.' });
    store.update(set('b', 2));
    await store.flush();

    expect(save).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({ closed: 'A expirat.', error: null });
  });

  it('keeps a failed change and sends it again when flushed', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new ApiHttpError(503, undefined))
      .mockResolvedValueOnce({ version: 4 });
    const store = storeWith(save);

    store.update(set('a', 1));
    await vi.waitFor(() => expect(store.getSnapshot().error).not.toBeNull());
    expect(store.getSnapshot().saving).toBe(false);

    expect(await store.flush()).toEqual({ version: 4 });
    expect(save).toHaveBeenLastCalledWith(3, { values: { a: 1 } });
    expect(store.getSnapshot().error).toBeNull();
  });

  it('takes the saved changes and version again on reload, and saves again after a conflict', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(refusal(importErrorReasons.changed))
      .mockResolvedValueOnce({ version: 8 });
    const store = new VersionedChangesStore<Changes>({
      initial: { changes: { values: {} }, version: 3 },
      save,
      savedByOthers: 'Altcineva a modificat.',
      reload: async () => ({ changes: { values: { z: 9 } }, version: 7 }),
    });

    store.update(set('a', 1));
    await store.flush();
    await store.reload();
    expect(store.getSnapshot()).toMatchObject({ conflict: false, changes: { values: { z: 9 } } });

    store.update(set('b', 2));
    expect(await store.flush()).toEqual({ version: 8 });
    expect(save).toHaveBeenLastCalledWith(7, { values: { z: 9, b: 2 } });
  });
});
