import { describe, expect, it } from 'vitest';

import { holdPassage, passageRowClass } from './source-word-passage';

type Place = { top: number; left: number; width: number; height: number };

function editorViewport() {
  const viewport = document.createElement('div');
  for (const [name, value] of Object.entries({
    scrollTop: 0,
    scrollLeft: 0,
    clientHeight: 600,
    clientWidth: 800,
    scrollHeight: 10_000,
    scrollWidth: 800,
  })) {
    Object.defineProperty(viewport, name, { value, writable: true });
  }
  viewport.getBoundingClientRect = () => new DOMRect(0, 100, 800, 600);
  const marks = document.createElement('div');
  marks.dataset.highlightSet = 'import-quote';
  viewport.append(marks);

  const placeAt = (element: HTMLElement, place: Place) => {
    element.getBoundingClientRect = () =>
      new DOMRect(
        place.left - viewport.scrollLeft,
        100 + place.top - viewport.scrollTop,
        place.width,
        place.height
      );
    return element;
  };
  const mark = (place: Place) => {
    const element = placeAt(document.createElement('div'), place);
    element.className = 'docx-text-highlight';
    marks.append(element);
    return { element, place };
  };
  const row = (place: Place) => {
    const element = placeAt(document.createElement('div'), place);
    element.className = 'docx-table-row';
    viewport.append(element);
    return element;
  };
  return { viewport, mark, row };
}

function manualClock() {
  let time = 0;
  let next = 1;
  const queued = new Map<number, () => void>();
  return {
    frame: (callback: () => void) => {
      queued.set(next, callback);
      return next++;
    },
    cancel: (handle: number) => void queued.delete(handle),
    now: () => time,
    run(ms: number) {
      for (const end = time + ms; time < end;) {
        time += 16;
        const due = [...queued.values()];
        queued.clear();
        for (const callback of due) callback();
      }
    },
    get waiting() {
      return queued.size;
    },
  };
}

describe('holding the passage in view in the Word viewer', () => {
  it('centres the passage and centres it again when the document moves after it settled', () => {
    const { viewport, mark } = editorViewport();
    const clock = manualClock();
    const passage = mark({ top: 5000, left: 100, width: 80, height: 20 });
    const stop = holdPassage(viewport, { clock });

    clock.run(32);
    expect(viewport.scrollTop).toBe(5010 - 300);

    viewport.scrollTop = 5100;
    clock.run(32);
    expect(viewport.scrollTop).toBe(4710);

    passage.place.top = 5400;
    clock.run(32);
    expect(viewport.scrollTop).toBe(5110);
    stop();
  });

  it('lets go once the passage has stayed put, and as soon as the reader scrolls', () => {
    const { viewport, mark } = editorViewport();
    const clock = manualClock();
    mark({ top: 5000, left: 100, width: 80, height: 20 });
    holdPassage(viewport, { clock });
    clock.run(1200);
    viewport.scrollTop = 0;
    clock.run(100);
    expect(viewport.scrollTop).toBe(0);

    const second = editorViewport();
    second.mark({ top: 5000, left: 100, width: 80, height: 20 });
    holdPassage(second.viewport, { clock });
    clock.run(32);
    second.viewport.dispatchEvent(new WheelEvent('wheel'));
    second.viewport.scrollTop = 6000;
    clock.run(100);
    expect(second.viewport.scrollTop).toBe(6000);
  });

  it('holds the passage while the fonts load and follows it when they move it without a scroll', () => {
    const { viewport, mark } = editorViewport();
    const clock = manualClock();
    let fontsPending = true;
    const passage = mark({ top: 8400, left: 100, width: 80, height: 20 });
    holdPassage(viewport, { clock, fontsPending: () => fontsPending });
    clock.run(32);
    expect(viewport.scrollTop).toBe(8110);

    clock.run(2000);
    passage.place.top = 8010;
    fontsPending = false;
    clock.run(32);
    expect(viewport.scrollTop).toBe(7720);

    clock.run(1200);
    viewport.scrollTop = 0;
    clock.run(100);
    expect(viewport.scrollTop).toBe(0);
  });

  it('waits for the editor to paint the passage before it scrolls', () => {
    const { viewport, mark } = editorViewport();
    const clock = manualClock();
    holdPassage(viewport, { clock });
    clock.run(800);
    expect(viewport.scrollTop).toBe(0);
    expect(clock.waiting).toBeGreaterThan(0);

    mark({ top: 3000, left: 100, width: 80, height: 20 });
    clock.run(32);
    expect(viewport.scrollTop).toBe(2710);
  });

  it('marks the table row a highlight sits in and centres the row with it', async () => {
    const { viewport, mark, row } = editorViewport();
    const clock = manualClock();
    const above = row({ top: 4960, left: 50, width: 700, height: 20 });
    const matched = row({ top: 4980, left: 50, width: 700, height: 60 });
    mark({ top: 5000, left: 600, width: 80, height: 20 });
    const stop = holdPassage(viewport, { clock });

    clock.run(32);
    expect(matched.classList.contains(passageRowClass)).toBe(true);
    expect(above.classList.contains(passageRowClass)).toBe(false);
    expect(viewport.scrollTop).toBe(5010 - 300);

    clock.run(1200);
    const repainted = row({ top: 4980, left: 50, width: 700, height: 60 });
    matched.remove();
    await Promise.resolve();
    clock.run(16);
    expect(repainted.classList.contains(passageRowClass)).toBe(true);
    stop();
  });

  it('shows the end of a passage taller than the screen when asked, as a row under its heading', () => {
    const { viewport, mark } = editorViewport();
    const clock = manualClock();
    mark({ top: 1000, left: 100, width: 80, height: 20 });
    mark({ top: 3000, left: 100, width: 80, height: 20 });
    holdPassage(viewport, { clock, showEnd: true });
    clock.run(32);
    expect(viewport.scrollTop).toBe(3020 + 24 - 600);

    const second = editorViewport();
    second.mark({ top: 1000, left: 100, width: 80, height: 20 });
    second.mark({ top: 3000, left: 100, width: 80, height: 20 });
    holdPassage(second.viewport, { clock });
    clock.run(32);
    expect(second.viewport.scrollTop).toBe(1000 - 24);
  });

  it('scrolls across to a passage past the right edge of a narrow screen', () => {
    const { viewport, mark } = editorViewport();
    Object.assign(viewport, { clientWidth: 300, scrollWidth: 900 });
    const clock = manualClock();
    mark({ top: 1000, left: 700, width: 100, height: 20 });
    holdPassage(viewport, { clock });
    clock.run(32);
    expect(viewport.scrollLeft).toBe(700 + 100 + 24 - 300);
  });
});
