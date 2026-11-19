import { describe, expect, it } from 'vitest';

import { readingSchema } from './reading';
import { emptyReading } from './testing';

describe('emptyReading', () => {
  it('is a reading with every section empty, and the sections given', () => {
    const notes = ['Fără date despre client.'];

    expect(readingSchema.parse(emptyReading())).toEqual(emptyReading());
    expect(Object.values(emptyReading()).every((section) => section.length === 0)).toBe(true);
    expect(emptyReading({ notes })).toEqual({ ...emptyReading(), notes });
  });
});
