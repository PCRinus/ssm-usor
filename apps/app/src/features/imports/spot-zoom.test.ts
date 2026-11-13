import { describe, expect, it } from 'vitest';

import { spotZoom } from './spot-zoom';

const photo = { width: 1500, height: 2100 };
const date = { top: 400, left: 300, bottom: 425, right: 450 };
const name = { top: 150, left: 250, bottom: 180, right: 700 };
const row = { top: 300, left: 80, bottom: 360, right: 920 };

const at = (box: typeof date, width: number, height: number) =>
  spotZoom({
    box,
    page: photo,
    room: { width, height },
    unit: width,
    fitWidth: Math.min(width, (height * photo.width) / photo.height),
  });

describe('the zoom a spotlighted value opens at', () => {
  it('enlarges a date on a phone as far as the zoom bar goes', () => {
    expect(at(date, 366, 500)).toBe(3);
  });

  it('enlarges a date on a desktop less, in quarter steps', () => {
    expect(at(date, 880, 600)).toBe(2);
  });

  it('keeps a name that already reads at its width', () => {
    expect(at(name, 880, 600)).toBe(1);
  });

  it('fits a table row that fills the phone already', () => {
    expect(at(row, 366, 700)).toBeNull();
  });
});
