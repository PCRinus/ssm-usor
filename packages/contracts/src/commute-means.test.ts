import { describe, expect, it } from 'vitest';

import {
  commuteMeansKey,
  commuteMeansLabels,
  orderedCommuteMeans,
  parseCommuteMeansKey,
} from './commute-means';

describe('commute means', () => {
  it('keeps each code once, in the list’s order, and drops what is no code', () => {
    expect(
      orderedCommuteMeans(['public_transport', 'ferry', 'on_foot', 'public_transport'])
    ).toEqual(['on_foot', 'public_transport']);
  });

  it('names the codes, then the means typed apart', () => {
    expect(
      commuteMeansLabels({ means: ['public_transport', 'bicycle'], other: ' Motocicletă ' })
    ).toEqual(['Bicicletă sau trotinetă', 'Transport public', 'Motocicletă']);
  });

  it('writes one key for the same means in any order, and none for no means', () => {
    const key = commuteMeansKey({ means: ['public_transport', 'on_foot'], other: null });
    expect(key).toBe(commuteMeansKey({ means: ['on_foot', 'public_transport'], other: '  ' }));
    expect(parseCommuteMeansKey(key!)).toEqual({
      means: ['on_foot', 'public_transport'],
      other: null,
    });
    expect(commuteMeansKey({ means: [], other: ' ' })).toBeNull();
  });

  it('reads no means from a text it did not write', () => {
    expect(parseCommuteMeansKey('pe jos')).toBeNull();
    expect(parseCommuteMeansKey('{"means":["ferry"],"other":null}')).toBeNull();
    expect(parseCommuteMeansKey(JSON.stringify({ means: [], other: 'x'.repeat(121) }))).toBeNull();
  });
});
