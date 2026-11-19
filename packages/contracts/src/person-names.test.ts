import { describe, expect, it } from 'vitest';

import { personNameKey, samePerson } from './person-names';

describe('samePerson', () => {
  it('matches a name in any order, case, hyphenation or diacritics', () => {
    expect(samePerson('Popescu Maria', 'Maria POPESCU')).toBe(true);
    expect(samePerson('Maria-Popescu', 'popescu maria')).toBe(true);
    expect(samePerson('Ștefan Țurcanu', 'TURCANU Stefan')).toBe(true);
    expect(samePerson('Florin Cristian TALOȘ', 'talos florin-cristian')).toBe(true);
    expect(samePerson('  Ana  Pop ', 'POP ANA')).toBe(true);
  });

  it('tells two people apart, and matches no empty name', () => {
    expect(samePerson('Popescu Maria', 'Popescu Ion')).toBe(false);
    expect(samePerson('Ana Pop', 'Ana Popa')).toBe(false);
    expect(samePerson('Ana Pop', 'Ana Maria Pop')).toBe(false);
    expect(samePerson('', '')).toBe(false);
    expect(samePerson('-', ' ')).toBe(false);
    expect(personNameKey('  ')).toBe('');
  });
});
