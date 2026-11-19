import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCountdown } from './use-countdown';

afterEach(() => vi.useRealTimers());

describe('useCountdown', () => {
  it('counts down from the time it is given, a second at a time, and stops at zero', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const { result } = renderHook(() => useCountdown(1_000_000 + 2_500));
    expect(result.current.secondsLeft).toBe(3);
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.secondsLeft).toBe(2);
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current.secondsLeft).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts at zero and counts again from a restart', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    const { result } = renderHook(() => useCountdown());
    expect(result.current.secondsLeft).toBe(0);
    act(() => result.current.restart(60));
    expect(result.current.secondsLeft).toBe(60);
    act(() => vi.advanceTimersByTime(23_000));
    expect(result.current.secondsLeft).toBe(37);
  });
});
