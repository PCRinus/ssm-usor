export const zoomSteps = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];

const maxZoom = zoomSteps.at(-1)!;

/** Thousandths of a page image's height (top, bottom) and width (left, right). */
export type SpotBox = { top: number; left: number; bottom: number; right: number };

type Size = { width: number; height: number };

// Handwriting reads at about this many pixels across a date; a box already wider at zoom 1 keeps
// its size, so a table row or a name keeps the page around it.
const readableWidth = 280;
const roomShare = { width: 0.85, height: 0.6 };

// `unit` is the page's width at zoom 1 and `fitWidth` its width when fitted. Null when the
// fitted page already shows the box as large.
export function spotZoom({
  box,
  page,
  room,
  unit,
  fitWidth,
}: {
  box: SpotBox;
  page: Size;
  room: Size;
  unit: number;
  fitWidth: number;
}): number | null {
  if (unit <= 0 || room.width <= 0 || page.width <= 0) return null;
  const across = Math.max(box.right - box.left, 1) / 1000;
  const down = Math.max(box.bottom - box.top, 1) / 1000;
  const aspect = page.height / page.width;
  const boxWidth = Math.min(roomShare.width * room.width, Math.max(readableWidth, across * unit));
  const width = Math.min(
    boxWidth / across,
    (roomShare.height * room.height) / (aspect * down),
    maxZoom * unit
  );
  const zoom = Math.floor((width / unit) * 4) / 4;
  return zoom * unit > fitWidth ? zoom : null;
}

// Where an element lies in its scroller's content, untransformed: the dialog opens with a scale
// animation, which client rects include and the layout does not.
export function placeIn(scroller: HTMLElement, element: HTMLElement) {
  const room = scroller.getBoundingClientRect();
  const shown = element.getBoundingClientRect();
  const scale = scroller.offsetWidth > 0 ? room.width / scroller.offsetWidth : 1;
  return {
    left: (shown.left - room.left) / scale + scroller.scrollLeft,
    top: (shown.top - room.top) / scale + scroller.scrollTop,
    width: shown.width / scale,
    height: shown.height / scale,
  };
}

export function centreOn(scroller: HTMLElement, page: HTMLElement, box: SpotBox) {
  const shown = placeIn(scroller, page);
  const x = shown.left + ((box.left + box.right) / 2000) * shown.width;
  const y = shown.top + ((box.top + box.bottom) / 2000) * shown.height;
  scroller.scrollLeft = x - scroller.clientWidth / 2;
  scroller.scrollTop = y - scroller.clientHeight / 2;
}
