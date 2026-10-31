import { describe, expect, it } from 'vitest';

import type { SheetPage } from './employee-review-model';
import { pagesPhotosLabel, peopleLabel, trainingsLabel } from './review-format';

const page = (fileId: string, number: number | null) =>
  ({ id: `${fileId}-${number}`, fileId, page: number }) as SheetPage;

describe('review counts', () => {
  it('counts the photographs, or the pages once a PDF is among them', () => {
    expect(pagesPhotosLabel([page('a', null)])).toBe('o fotografie');
    expect(pagesPhotosLabel([page('a', null), page('b', null)])).toBe('2 fotografii');
    expect(pagesPhotosLabel([page('scan', 2)])).toBe('o pagină');
    expect(pagesPhotosLabel([page('a', null), page('scan', 1)])).toBe('2 pagini');
  });

  it('puts "de" before the noun from twenty up', () => {
    expect(peopleLabel(1)).toBe('o persoană');
    expect(peopleLabel(19)).toBe('19 persoane');
    expect(peopleLabel(20)).toBe('20 de persoane');
    expect(trainingsLabel(1)).toBe('o instruire');
    expect(trainingsLabel(120)).toBe('120 de instruiri');
  });
});
