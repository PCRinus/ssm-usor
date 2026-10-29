export const passageMarks = '[data-highlight-set="import-quote"] .docx-text-highlight';
export const passageRowClass = 'import-source-row';

const edgePadding = 24;
const settledAfterMs = 1000;
const giveUpAfterMs = 15_000;

type Box = { top: number; bottom: number; left: number; right: number };

// showEnd: a passage taller than the view is shown at its end, as a heading and the row it leads
// up to are, rather than at its start.
type Hold = { fontsPending?: () => boolean; clock?: Clock; showEnd?: boolean };

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

function passageBox(viewport: HTMLElement): Box | null {
  const parts = viewport.querySelectorAll<HTMLElement>(`${passageMarks}, .${passageRowClass}`);
  if (parts.length === 0) return null;
  const frame = viewport.getBoundingClientRect();
  const x = frame.left - viewport.scrollLeft;
  const y = frame.top - viewport.scrollTop;
  let box: Box | null = null;
  for (const part of parts) {
    const rect = part.getBoundingClientRect();
    const each = {
      top: rect.top - y,
      bottom: rect.bottom - y,
      left: rect.left - x,
      right: rect.right - x,
    };
    box = box
      ? {
          top: Math.min(box.top, each.top),
          bottom: Math.max(box.bottom, each.bottom),
          left: Math.min(box.left, each.left),
          right: Math.max(box.right, each.right),
        }
      : each;
  }
  return box;
}

const clamp = (value: number, max: number) => Math.round(Math.max(0, Math.min(value, max)));

// Centred top to bottom; across, moved only as far as it takes to show the passage, which on a
// phone is wider than the screen as often as not.
export function passageScroll(box: Box, viewport: HTMLElement, showEnd = false) {
  const height = viewport.clientHeight;
  const width = viewport.clientWidth;
  let top = (box.top + box.bottom) / 2 - height / 2;
  if (box.bottom - box.top > height - 2 * edgePadding) {
    top = showEnd ? box.bottom + edgePadding - height : box.top - edgePadding;
  }
  let left = viewport.scrollLeft;
  if (box.right - box.left > width - 2 * edgePadding || box.left < left + edgePadding) {
    left = box.left - edgePadding;
  } else if (box.right > left + width - edgePadding) {
    left = box.right + edgePadding - width;
  }
  return {
    top: clamp(top, viewport.scrollHeight - height),
    left: clamp(left, viewport.scrollWidth - width),
  };
}

// The editor lays the document out first with estimated text widths and again once the fonts it
// fetched arrive, which can move a passage by most of a page without any scroll, so the passage
// is held in the middle until the fonts are in and it has not moved for a while, or until the
// reader scrolls.
export function holdPassage(
  viewport: HTMLElement,
  { fontsPending = () => false, clock = browserClock, showEnd = false }: Hold = {}
) {
  const started = clock.now();
  let still = started;
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
    const box = passageBox(viewport);
    const now = clock.now();
    if (box) {
      const { top, left } = passageScroll(box, viewport, showEnd);
      if (Math.abs(viewport.scrollTop - top) > 1 || Math.abs(viewport.scrollLeft - left) > 1) {
        viewport.scrollTop = top;
        viewport.scrollLeft = left;
        still = now;
      }
    }
    if (!box || fontsPending()) still = now;
    if (now - still >= settledAfterMs || now - started >= giveUpAfterMs) {
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
