// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deployWindow,
  fetchDeployedCommit,
  reloadStamp,
  versionCheckInterval,
  watchDeployedVersion,
} from './version-watch';

function setVisibility(state: DocumentVisibilityState) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('watching the deployed version', () => {
  beforeEach(() => vi.useFakeTimers());

  it('checks when the tab becomes visible and every ten minutes while visible', async () => {
    const fetchCommit = vi.fn(async () => 'abc');
    const onNewer = vi.fn();
    const stop = watchDeployedVersion({ running: 'abc', fetchCommit, onNewer });

    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCommit).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(versionCheckInterval);
    expect(fetchCommit).toHaveBeenCalledTimes(2);

    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(versionCheckInterval * 3);
    expect(fetchCommit).toHaveBeenCalledTimes(2);
    expect(onNewer).not.toHaveBeenCalled();
    stop();
  });

  it('announces a newer build once, and again only for a build newer than that', async () => {
    let deployed = 'def';
    const onNewer = vi.fn();
    const stop = watchDeployedVersion({
      running: 'abc',
      fetchCommit: async () => deployed,
      onNewer,
    });

    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(versionCheckInterval);
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(onNewer).toHaveBeenCalledTimes(1);
    expect(onNewer).toHaveBeenLastCalledWith('def', expect.any(Function));

    deployed = 'ghi';
    await vi.advanceTimersByTimeAsync(versionCheckInterval);
    expect(onNewer).toHaveBeenCalledTimes(2);
    expect(onNewer).toHaveBeenLastCalledWith('ghi', expect.any(Function));
    stop();
  });

  it('never checks a local build', async () => {
    const fetchCommit = vi.fn(async () => 'def');
    watchDeployedVersion({ running: 'local', fetchCommit, onNewer: vi.fn() });
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(versionCheckInterval * 2);
    expect(fetchCommit).not.toHaveBeenCalled();
  });

  it('keeps a postponed build postponed for a new watch, and announces a newer one', async () => {
    let deployed = 'def';
    const watch = (onNewer: (commit: string, postpone: () => void) => void) =>
      watchDeployedVersion({
        running: 'abc',
        postponedKey: 'postponed',
        fetchCommit: async () => deployed,
        onNewer,
      });

    const first = watch((_commit, postpone) => postpone());
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    first();
    expect(localStorage.getItem('postponed')).toBe('def');

    const onNewer = vi.fn();
    const second = watch(onNewer);
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(onNewer).not.toHaveBeenCalled();

    deployed = 'ghi';
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(onNewer).toHaveBeenCalledWith('ghi', expect.any(Function));
    second();
  });

  it('postpones in the watch only, without a key', async () => {
    const onNewer = vi.fn((_commit: string, postpone: () => void) => postpone());
    const stop = watchDeployedVersion({
      running: 'abc',
      fetchCommit: async () => 'def',
      onNewer,
    });
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(onNewer).toHaveBeenCalledOnce();
    expect(localStorage.length).toBe(0);
    stop();
  });
});

it('reads the commit without the cache and ignores an answer that is not a version', async () => {
  const fetcher = vi.fn(async () => Response.json({ commit: 'def' }));
  expect(await fetchDeployedCommit(fetcher)).toBe('def');
  expect(fetcher).toHaveBeenCalledWith('/version.json', { cache: 'no-store' });

  expect(await fetchDeployedCommit(async () => new Response('<!doctype html>'))).toBeNull();
  expect(await fetchDeployedCommit(async () => new Response('', { status: 404 }))).toBeNull();
  expect(await fetchDeployedCommit(async () => Response.json({ commit: '' }))).toBeNull();
  expect(
    await fetchDeployedCommit(async () => Promise.reject(new TypeError('offline')))
  ).toBeNull();
});

describe('the reload stamp', () => {
  it('locks a dialog until a minute after the reload it follows', () => {
    const stamp = reloadStamp('reloaded-at');
    expect(stamp.lockedUntil(1_000)).toBeNull();
    stamp.mark(1_000);
    expect(stamp.lockedUntil(1_000 + 18_000)).toBe(1_000 + deployWindow);
    expect(stamp.lockedUntil(1_000 + deployWindow)).toBeNull();
  });

  it('ignores a stamp that is not a time', () => {
    sessionStorage.setItem('reloaded-at', 'soon');
    expect(reloadStamp('reloaded-at').lockedUntil()).toBeNull();
  });
});
