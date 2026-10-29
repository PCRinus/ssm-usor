export const passageMarks = '[data-highlight-set="import-quote"] .docx-text-highlight';
export const passageRowClass = 'import-source-row';

const edgePadding = 24;
const settledAfterMs = 1000;
const giveUpAfterMs = 15_000;

type Box = { top: number; bottom: number; left: number; right: number };

type Hold = { fontsPending?: () => boolean; clock?: Clock };

type Clock = {
  frame: (callback: () => void) => number;
  cancel: (handle: number) => void;
  now: () => number;
};

const browserClock: Clock = {
  frame: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
  now: () => performance.now(),
};

const contains = (rect: DOMRect, x: number, y: number) =>
  x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

// The editor paints a table row as positioned boxes and draws the highlights in an overlay above
// the pages, so the row a mark sits in is found by where it is, not by the DOM it is in.
export function markPassageRows(viewport: HTMLElement) {
  const marks = [...viewport.querySelectorAll<HTMLElement>(passageMarks)].map((mark) =>
    mark.getBoundingClientRect()
  );
  const rows = [...viewport.querySelectorAll<HTMLElement>('.docx-table-row')].map((row) => ({
    row,
    rect: row.getBoundingClientRect(),
  }));
  const marked = new Set<HTMLElement>();
  for (const mark of marks) {
    const x = mark.left + mark.width / 2;
    const y = mark.top + mark.height / 2;
    const innermost = rows
      .filter(({ rect }) => contains(rect, x, y))
      .sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height)[0];
    if (innermost) marked.add(innermost.row);
  }
  for (const { row } of rows) {
    if (marked.has(row) !== row.classList.contains(passageRowClass)) {
      row.classList.toggle(passageRowClass, marked.has(row));
    }
  }
}

const union = (a: Box | null, b: Box): Box =>
  a
    ? {
        top: Math.min(a.top, b.top),
        bottom: Math.max(a.bottom, b.bottom),
        left: Math.min(a.left, b.left),
        right: Math.max(a.right, b.right),
      }
    : b;

type Passage = { marks: Box; whole: Box };

function passageBox(viewport: HTMLElement): Passage | null {
  const frame = viewport.getBoundingClientRect();
  const x = frame.left - viewport.scrollLeft;
  const y = frame.top - viewport.scrollTop;
  const boxOf = (part: HTMLElement) => {
    const rect = part.getBoundingClientRect();
    return {
      top: rect.top - y,
      bottom: rect.bottom - y,
      left: rect.left - x,
      right: rect.right - x,
    };
  };
  let marks: Box | null = null;
  for (const mark of viewport.querySelectorAll<HTMLElement>(passageMarks)) {
    marks = union(marks, boxOf(mark));
  }
  if (!marks) return null;
  let whole = marks;
  for (const row of viewport.querySelectorAll<HTMLElement>(`.${passageRowClass}`)) {
    whole = union(whole, boxOf(row));
  }
  return { marks, whole };
}

const samePlace = (a: Box, b: Box) =>
  Math.abs(a.top - b.top) <= 1 &&
  Math.abs(a.bottom - b.bottom) <= 1 &&
  Math.abs(a.left - b.left) <= 1 &&
  Math.abs(a.right - b.right) <= 1;

const clamp = (value: number, max: number) => Math.round(Math.max(0, Math.min(value, max)));

// Centred top to bottom; across, moved only as far as it takes to show the passage, which on a
// phone is wider than the screen as often as not. The row is shown with the highlight only where
// it fits, since a row's edge taken past the screen would leave the highlight off it.
export function passageScroll({ marks, whole }: Passage, viewport: HTMLElement) {
  const height = viewport.clientHeight;
  const width = viewport.clientWidth;
  const forTop = whole.bottom - whole.top <= height - 2 * edgePadding ? whole : marks;
  const top =
    forTop.bottom - forTop.top > height - 2 * edgePadding
      ? forTop.top - edgePadding
      : (forTop.top + forTop.bottom) / 2 - height / 2;
  const forLeft = whole.right - whole.left <= width - 2 * edgePadding ? whole : marks;
  let left = viewport.scrollLeft;
  if (forLeft.right - forLeft.left > width - 2 * edgePadding || forLeft.left < left + edgePadding) {
    left = forLeft.left - edgePadding;
  } else if (forLeft.right > left + width - edgePadding) {
    left = forLeft.right + edgePadding - width;
  }
  return {
    top: clamp(top, viewport.scrollHeight - height),
    left: clamp(left, viewport.scrollWidth - width),
  };
}

// The editor lays the document out first with estimated text widths and again once the fonts it
// fetched arrive, which can move a passage by most of a page without any scroll, so the passage
// is held in the middle until the fonts are in and it has not moved for a while, or until the
// reader scrolls. On a slow link the fonts can land long after the cap, so the cap counts from
// the last moment they were still loading.
export function holdPassage(
  viewport: HTMLElement,
  { fontsPending = () => false, clock = browserClock }: Hold = {}
) {
  let armed = clock.now();
  let still = armed;
  let held: { top: number; left: number; marks: Box } | null = null;
  let holding = true;
  let frame = 0;
  let pending = 0;
  const userScrolls = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

  const release = () => {
    if (!holding) return;
    holding = false;
    clock.cancel(frame);
    for (const type of userScrolls) viewport.removeEventListener(type, release);
  };

  const step = () => {
    markPassageRows(viewport);
    const passage = passageBox(viewport);
    const now = clock.now();
    // Dragging the scrollbar fires none of the reader's events above, only the scroll itself.
    if (
      passage &&
      held &&
      samePlace(passage.marks, held.marks) &&
      (Math.abs(viewport.scrollTop - held.top) > 1 || Math.abs(viewport.scrollLeft - held.left) > 1)
    ) {
      release();
      return;
    }
    if (passage) {
      const { top, left } = passageScroll(passage, viewport);
      if (Math.abs(viewport.scrollTop - top) > 1 || Math.abs(viewport.scrollLeft - left) > 1) {
        viewport.scrollTop = top;
        viewport.scrollLeft = left;
        still = now;
      }
      held = { top: viewport.scrollTop, left: viewport.scrollLeft, marks: passage.marks };
    }
    const loading = fontsPending();
    if (loading) armed = now;
    if (!passage || loading) still = now;
    if (now - still >= settledAfterMs || now - armed >= giveUpAfterMs) {
      release();
      return;
    }
    frame = clock.frame(step);
  };

  for (const type of userScrolls) viewport.addEventListener(type, release, { passive: true });

  // Pages leave the DOM as they scroll out of view and come back new, without the row's class.
  const remark = () => {
    if (pending) return;
    pending = clock.frame(() => {
      pending = 0;
      markPassageRows(viewport);
    });
  };
  const observer = new MutationObserver(remark);
  observer.observe(viewport, { childList: true, subtree: true });
  viewport.addEventListener('scroll', remark, { passive: true });

  frame = clock.frame(step);
  return () => {
    release();
    clock.cancel(pending);
    observer.disconnect();
    viewport.removeEventListener('scroll', remark);
  };
}
