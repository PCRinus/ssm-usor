import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PhotoStrip } from './photo-strip';
import { sectionUnderlines, type StripPhoto } from './photo-strip-model';

const photos = (count: number): StripPhoto[] =>
  Array.from({ length: count }, (_, index) => ({
    key: `p${index + 1}`,
    label: `Fotografia ${index + 1} din ${count}, Fișa SSM, periodice`,
    caption: 'Fișa SSM, periodice',
    thumb: (className) => <span className={className} />,
  }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollBy');
});

describe('the photos a section underlines', () => {
  it('underlines up to five photos when they are under 40% of the photos', () => {
    expect([...sectionUnderlines(['p2', 'p3', 'p7', 'p12'], 14)]).toEqual([
      'p2',
      'p3',
      'p7',
      'p12',
    ]);
    expect([...sectionUnderlines(['p1', 'p2', 'p3', 'p4', 'p5'], 14)]).toHaveLength(5);
  });

  it('underlines none when the section cites more than five photos', () => {
    expect(sectionUnderlines(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], 30).size).toBe(0);
  });

  it('underlines none when the section cites 40% of the photos or more', () => {
    expect(sectionUnderlines(['p1', 'p2'], 5).size).toBe(0);
    expect(sectionUnderlines(['p1', 'p2'], 6).size).toBe(2);
    expect(sectionUnderlines(['p1'], 1).size).toBe(0);
  });
});

describe('the photo strip', () => {
  const strip = (props: Partial<Parameters<typeof PhotoStrip>[0]> = {}) => (
    <PhotoStrip
      photos={photos(14)}
      ringed="p3"
      underlined={sectionUnderlines(['p2', 'p3', 'p7', 'p12'], 14)}
      onOpen={() => undefined}
      label="Fotografiile lui Stoica Ionuț-Cristian"
      description="Subliniate: fotografiile secțiunii de pe ecran"
      {...props}
    />
  );

  it('numbers each frame, rings the photo last opened and never underlines it', () => {
    render(strip());
    const group = screen.getByRole('group', { name: 'Fotografiile lui Stoica Ionuț-Cristian' });
    expect(group.getAttribute('aria-description')).toBe(
      'Subliniate: fotografiile secțiunii de pe ecran'
    );
    expect(group.title).toBe('Subliniate: fotografiile secțiunii de pe ecran');
    const frames = within(group).getAllByRole('button');
    expect(frames).toHaveLength(14);
    expect(frames[2]!.getAttribute('aria-label')).toBe('Fotografia 3 din 14, Fișa SSM, periodice');
    expect(frames[2]!.textContent).toBe('3');
    expect(
      frames.filter((frame) => frame.dataset.ringed).map((frame) => frame.textContent)
    ).toEqual(['3']);
    expect(
      frames.filter((frame) => frame.dataset.underlined).map((frame) => frame.textContent)
    ).toEqual(['2', '7', '12']);
  });

  it('opens the photo of a frame', async () => {
    const onOpen = vi.fn();
    render(strip({ onOpen }));
    await userEvent.click(screen.getByRole('button', { name: /^Fotografia 7 din 14/ }));
    expect(onOpen).toHaveBeenCalledWith('p7');
  });

  it('previews a frame on focus, larger and with the kind of page, and closes it with Escape', async () => {
    const user = userEvent.setup();
    render(strip());
    await user.tab();
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toContain('Fotografia 3 din 14');
    expect(tooltip.textContent).toContain('Fișa SSM, periodice');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows no counter and no arrows while every frame fits', () => {
    render(strip());
    expect(screen.queryByTestId('photo-strip-position')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fotografiile de după' })).toBeNull();
  });

  it('counts the ringed photo and pages with the arrows when the frames overflow', async () => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(1500);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
    const scrollBy = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollBy', {
      configurable: true,
      value: scrollBy,
    });
    render(strip({ photos: photos(30), ringed: 'p17' }));
    expect(screen.getByTestId('photo-strip-position').textContent).toBe('17 din 30');
    expect(screen.getByRole('button', { name: 'Fotografiile dinainte' })).toHaveProperty(
      'disabled',
      true
    );
    await userEvent.click(screen.getByRole('button', { name: 'Fotografiile de după' }));
    expect(scrollBy).toHaveBeenLastCalledWith(expect.objectContaining({ left: 480 }));

    vi.spyOn(HTMLElement.prototype, 'scrollLeft', 'get').mockReturnValue(900);
    act(() => {
      screen.getByTestId('photo-strip-frames').dispatchEvent(new Event('scroll'));
    });
    expect(screen.getByRole('button', { name: 'Fotografiile de după' })).toHaveProperty(
      'disabled',
      true
    );
  });

  it('is one tab stop on the ringed photo, moved with the arrow keys and opened with Enter', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(strip({ onOpen }));
    const frames = screen.getAllByTestId('photo-strip-frame');
    expect(frames.filter((frame) => frame.tabIndex === 0)).toEqual([frames[2]]);
    expect(frames[2]!.getAttribute('aria-current')).toBe('true');
    await user.tab();
    expect(document.activeElement).toBe(frames[2]);
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(document.activeElement).toBe(frames[4]);
    expect(frames.filter((frame) => frame.tabIndex === 0)).toEqual([frames[4]]);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(frames[13]);
    await user.keyboard('{Home}{Enter}');
    expect(onOpen).toHaveBeenCalledWith('p1');
  });

  it('opens no preview when the focus comes back without the keyboard', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(strip());
    act(() => screen.getAllByTestId('photo-strip-frame')[2]!.focus());
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(screen.queryByRole('tooltip')).toBeNull();
    vi.useRealTimers();
  });
});
