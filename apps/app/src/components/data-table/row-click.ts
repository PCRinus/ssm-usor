import type { MouseEvent } from 'react';

const interactive = 'a, button, input, select, textarea, label, [role="button"]';

// The row is a larger target for the mouse only. The link or the menu in the row stays the
// way in for the keyboard and for screen readers, so the row gets no role and no tab stop.
export function rowClickProps(onActivate: (() => void) | undefined) {
  if (!onActivate) return {};
  return {
    className: 'cursor-pointer',
    onClick: (event: MouseEvent<HTMLTableRowElement>) => {
      const target = event.target as HTMLElement;
      // React bubbles events out of portals: a click in the row's menu or dialog lands here too.
      if (!event.currentTarget.contains(target)) return;
      if (target.closest(interactive)) return;
      if (window.getSelection()?.toString()) return;
      onActivate();
    },
  };
}
