// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSecondsLeft } from './countdown';

afterEach(() => vi.useRealTimers());

describe('useSecondsLeft', () => {
  it('counts down to the time it is given and stops its timer at zero', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const { result } = renderHook(() => useSecondsLeft(1_000_000 + 2_500));
    expect(result.current).toBe(3);
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current).toBe(2);
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reads zero without a time and runs no timer', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const { result } = renderHook(() => useSecondsLeft(null));
    expect(result.current).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shows the full count of a time given later', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const { result, rerender } = renderHook(({ until }) => useSecondsLeft(until), {
      initialProps: { until: null as number | null },
    });
    act(() => vi.advanceTimersByTime(23_000));
    rerender({ until: Date.now() + 60_000 });
    expect(result.current).toBe(60);
    act(() => vi.advanceTimersByTime(23_000));
    expect(result.current).toBe(37);
  });

  it('ticks at the rate it is given', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const { result } = renderHook(() => useSecondsLeft(1_000_000 + 1_100, 250));
    expect(result.current).toBe(2);
    act(() => vi.advanceTimersByTime(250));
    expect(result.current).toBe(1);
  });
});
