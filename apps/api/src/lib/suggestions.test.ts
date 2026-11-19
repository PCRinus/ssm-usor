import { describe, expect, it } from 'vitest';

import { pickSuggestions } from './suggestions';

describe('suggestions from what the organization typed', () => {
  it('keeps the first spelling of a value, whatever its case, and matches anywhere in it', () => {
    expect(pickSuggestions(['Cască', 'CASCĂ', 'Mănuși', 'cască de protecție'], 'ască')).toEqual([
      'Cască',
      'cască de protecție',
    ]);
  });

  it('matches the Romanian capitals', () => {
    expect(pickSuggestions(['ȘORȚ', 'Încălțăminte'], 'șorț')).toEqual(['ȘORȚ']);
  });

  it('stops at the limit', () => {
    const values = Array.from({ length: 30 }, (_, index) => `Echipament ${index}`);
    expect(pickSuggestions(values, '')).toHaveLength(20);
    expect(pickSuggestions(values, 'echipament', 3)).toEqual([
      'Echipament 0',
      'Echipament 1',
      'Echipament 2',
    ]);
  });
});
