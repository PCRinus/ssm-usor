import { describe, expect, it } from 'vitest';

import { formatPhone, phoneDiff } from './phone-diff';
import type { DiffRun } from './spelling-diff';

const marked = (runs: DiffRun[]) => runs.filter((run) => run.changed).map((run) => run.text);
const joined = (runs: DiffRun[]) => runs.map((run) => run.text).join('');

describe('one format for a phone number', () => {
  it('groups a Romanian mobile however it was written', () => {
    expect(formatPhone('0722351408')).toBe('0722 351 408');
    expect(formatPhone('0722 351408')).toBe('0722 351 408');
    expect(formatPhone('0722.315.408')).toBe('0722 315 408');
    expect(formatPhone('+40 722 315 408')).toBe('0722 315 408');
    expect(formatPhone('0040722315408')).toBe('0722 315 408');
  });

  it('groups a landline by its area code', () => {
    expect(formatPhone('0256123456')).toBe('0256 123 456');
    expect(formatPhone('021 123 45 67')).toBe('021 123 4567');
  });

  it('keeps a foreign number after its country code', () => {
    expect(formatPhone('+49 30 12345678')).toBe('+49 30 12345678');
    expect(formatPhone('0044 20 7946 0958')).toBe('+44 20 7946 0958');
  });

  it('groups a mistyped Romanian number of ten digits all the same', () => {
    expect(formatPhone('0700000000')).toBe('0700 000 000');
  });

  it('leaves text that is not a number as written', () => {
    expect(formatPhone('  0722 31540 ')).toBe('0722 31540');
    expect(formatPhone('tel. 0722 315 408, int. 12')).toBe('tel. 0722 315 408, int. 12');
  });
});

describe('the digits that tell numbers apart', () => {
  it('marks two swapped digits in both numbers, in one format', () => {
    const [first, second] = phoneDiff(['0722 315 408', '0722 351408']);
    expect(joined(first!)).toBe('0722 315 408');
    expect(joined(second!)).toBe('0722 351 408');
    expect(marked(first!)).toEqual(['15']);
    expect(marked(second!)).toEqual(['51']);
  });

  it('marks across a space only between two marked digits', () => {
    const [first, second] = phoneDiff(['0722 315 408', '0722 316 508']);
    expect(marked(first!)).toEqual(['5 4']);
    expect(marked(second!)).toEqual(['6 5']);
  });

  it('marks the digit one number has more than the other', () => {
    const [longer, shorter] = phoneDiff(['0722 315 408', '0722 31540']);
    expect(marked(longer!)).toEqual(['8']);
    expect(marked(shorter!)).toEqual([]);
  });

  it('compares a number written with the country code as its national form', () => {
    const [first, second] = phoneDiff(['+40 722 315 408', '0722 315 407']);
    expect(joined(first!)).toBe('0722 315 408');
    expect(marked(first!)).toEqual(['8']);
    expect(marked(second!)).toEqual(['7']);
  });

  it('marks a digit that differs from any of the other numbers', () => {
    const runs = phoneDiff(['0722 315 408', '0722 315 407', '0722 315 408 ']);
    expect(marked(runs[0]!)).toEqual(['8']);
    expect(marked(runs[1]!)).toEqual(['7']);
  });
});
