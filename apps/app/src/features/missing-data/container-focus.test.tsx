import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { scrollAndFocus } from './focus';

function mount() {
  const { unmount } = render(
    <>
      <button type="button">Before</button>
      <section aria-label="Alocarea articolului">
        <label>
          <input type="radio" name="allocation" value="personal" />
          Inventar personal
        </label>
        <label>
          <input type="radio" name="allocation" value="section" />
          Inventar de secție
        </label>
      </section>
    </>
  );
  const container = screen.getByRole('region', { name: 'Alocarea articolului' });
  const rectangles = [new DOMRect(0, 300, 400, 200)];
  vi.spyOn(container, 'getClientRects').mockReturnValue(
    Object.assign(rectangles, { item: (index: number) => rectangles[index] ?? null })
  );
  const before = screen.getByRole('button', { name: 'Before' });
  before.focus();
  return { container, before, unmount };
}

describe('scrollAndFocus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('points only at the outer container and focuses it after the pause, without suggesting a choice', () => {
    const { container, before } = mount();

    scrollAndFocus(container);
    vi.advanceTimersByTime(300);

    expect(document.activeElement).toBe(before);
    expect(container.hasAttribute('data-pointed')).toBe(true);
    expect(container.querySelector('[data-pointed]')).toBeNull();

    vi.advanceTimersByTime(700);

    expect(document.activeElement).toBe(container);
    expect(container.tabIndex).toBe(-1);
    expect(screen.getAllByRole<HTMLInputElement>('radio').every((option) => !option.checked)).toBe(
      true
    );
    expect(container.querySelector(':focus')).toBeNull();
    expect(container.querySelector('[data-pointed]')).toBeNull();
  });

  it('does not move focus after the request is cancelled', () => {
    const { container, before } = mount();

    const cancel = scrollAndFocus(container);
    vi.advanceTimersByTime(300);
    cancel();
    vi.advanceTimersByTime(1000);

    expect(document.activeElement).toBe(before);
  });

  it('does not focus a container that disappeared before the request completes', () => {
    const { container, unmount } = mount();
    const focus = vi.spyOn(container, 'focus');

    scrollAndFocus(container);
    vi.advanceTimersByTime(300);
    unmount();
    vi.advanceTimersByTime(1000);

    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });

  it('uses immediate scrolling for reduced motion and preserves an explicit tab order', () => {
    const { container } = mount();
    vi.mocked(window.matchMedia).mockReturnValue({
      ...window.matchMedia('(prefers-reduced-motion: reduce)'),
      matches: true,
    });
    vi.mocked(container.getClientRects).mockReturnValue(Object.assign([], { item: () => null }));
    container.tabIndex = 0;

    scrollAndFocus(container);

    expect(container.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
    expect(document.activeElement).toBe(container);
    expect(container.tabIndex).toBe(0);
    expect(screen.getAllByRole<HTMLInputElement>('radio').every((option) => !option.checked)).toBe(
      true
    );
  });
});
