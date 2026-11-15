import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useTimeReached } from './use-time-reached';

const day = 86_400_000;
const start = Date.parse('2026-11-15T10:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ now: start });
});

afterEach(() => {
  vi.useRealTimers();
});

it('waits out a moment weeks away and turns true only when it comes', () => {
  const expiry = new Date(start + 60 * day).toISOString();
  const { result } = renderHook(() => useTimeReached(expiry));
  expect(result.current).toBe(false);

  act(() => void vi.advanceTimersByTime(30 * day));
  expect(result.current).toBe(false);

  act(() => void vi.advanceTimersByTime(30 * day - 1));
  expect(result.current).toBe(false);

  act(() => void vi.advanceTimersByTime(1));
  expect(result.current).toBe(true);
});

it('is true at once for a moment already past', () => {
  const { result } = renderHook(() => useTimeReached(new Date(start - day).toISOString()));
  expect(result.current).toBe(true);
});
