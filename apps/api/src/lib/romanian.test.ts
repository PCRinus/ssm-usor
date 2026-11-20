import { describe, expect, it } from 'vitest';

import {
  definiteRole,
  listed,
  printedDay,
  printedPhone,
  romanianDay,
  romanianNoon,
  runOn,
  withoutFinalStop,
} from './romanian';

describe('a list in words', () => {
  it('joins the last item with "și" and the others with commas', () => {
    expect(listed([])).toBe('');
    expect(listed(['Ion POP'])).toBe('Ion POP');
    expect(listed(['Ion POP', 'Ana RUS'])).toBe('Ion POP și Ana RUS');
    expect(listed(['Ion POP', 'Ana RUS', 'Dan MARIN'])).toBe('Ion POP, Ana RUS și Dan MARIN');
  });
});

describe('a value inside a sentence', () => {
  it('starts in lower case where it was typed with a capital to stand alone', () => {
    expect(runOn('Mecanic auto')).toBe('mecanic auto');
    expect(runOn('Întreținerea și repararea autovehiculelor')).toBe(
      'întreținerea și repararea autovehiculelor'
    );
    expect(runOn('administrator')).toBe('administrator');
  });

  it('keeps an acronym, a single letter and an empty value as they are', () => {
    expect(runOn('SU și SSM')).toBe('SU și SSM');
    expect(runOn('ISU Brașov')).toBe('ISU Brașov');
    expect(runOn('A')).toBe('A');
    expect(runOn('A. Vopsitorie')).toBe('A. Vopsitorie');
    expect(runOn('')).toBe('');
  });
});

describe('a value listed as an item', () => {
  it('drops its final full stop or semicolon, and keeps an ellipsis', () => {
    expect(withoutFinalStop('Cartoane, hârtie.')).toBe('Cartoane, hârtie');
    expect(withoutFinalStop('Cartoane, hârtie;')).toBe('Cartoane, hârtie');
    expect(withoutFinalStop('Cartoane, hârtie')).toBe('Cartoane, hârtie');
    expect(withoutFinalStop('Cartoane, hârtie etc...')).toBe('Cartoane, hârtie etc...');
  });
});

describe('a job title made definite', () => {
  it('adds "-ul" to a first word ending in a consonant, and leaves any other ending', () => {
    expect(definiteRole('Administrator')).toBe('Administratorul');
    expect(definiteRole(' Administrator unic ')).toBe('Administratorul unic');
    expect(definiteRole('Director general')).toBe('Directorul general');
    expect(definiteRole('Președinte')).toBeNull();
    expect(definiteRole('Directoare')).toBeNull();
    expect(definiteRole('')).toBeNull();
  });
});

describe('a day in Romania', () => {
  it('stands as its noon there, in summer and in winter', () => {
    expect(romanianNoon('2026-07-15').toISOString()).toBe('2026-07-15T09:00:00.000Z');
    expect(romanianNoon('2026-01-15').toISOString()).toBe('2026-01-15T10:00:00.000Z');
    expect(romanianNoon('2026-03-29').toISOString()).toBe('2026-03-29T09:00:00.000Z');
    expect(romanianNoon('2026-10-25').toISOString()).toBe('2026-10-25T10:00:00.000Z');
  });

  it('is past midnight there while it is still the day before in UTC, in summer and in winter', () => {
    expect(romanianDay('2026-10-15T21:06:12.345678+00:00')).toBe('2026-10-16');
    expect(romanianDay('2026-10-15T20:59:59+00:00')).toBe('2026-10-15');
    expect(romanianDay('2026-01-15T22:30:00+00:00')).toBe('2026-01-16');
    expect(romanianDay('2026-01-15T21:30:00+00:00')).toBe('2026-01-15');
  });

  it('is printed day first, with dots, as the Romanian locale writes it', () => {
    const romanianLocale = new Intl.DateTimeFormat('ro-RO', {
      timeZone: 'Europe/Bucharest',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const moments = [
      '2026-10-17T22:30:00Z',
      '2026-10-15T20:59:59Z',
      '2026-01-15T22:30:00Z',
      '2026-01-15T21:30:00Z',
      '2026-03-29T00:59:59Z',
      '2026-03-29T01:00:00Z',
      '2026-10-25T00:59:59Z',
      '2026-10-25T01:00:00Z',
      '2026-12-31T22:00:00Z',
    ];
    for (const moment of moments) {
      expect(printedDay(new Date(moment))).toBe(romanianLocale.format(new Date(moment)));
      expect(printedDay(moment)).toBe(romanianLocale.format(new Date(moment)));
    }
    expect(printedDay(new Date('2026-10-17T22:30:00Z'))).toBe('18.10.2026');
  });
});

describe('a phone number as printed', () => {
  const grouped = (...groups: string[]) => groups.join('\u00a0');

  it.each([
    ['0722111222', grouped('0722', '111', '222')],
    ['0722-111-222', grouped('0722', '111', '222')],
    ['0722.111.222', grouped('0722', '111', '222')],
    [' 0256 / 123 456 ', grouped('0256', '123', '456')],
    ['(0356) 123-456', grouped('0356', '123', '456')],
    ['+40722111222', grouped('+40', '722', '111', '222')],
    ['+40 (722) 111 222', grouped('+40', '722', '111', '222')],
    ['0040722111222', grouped('+40', '722', '111', '222')],
  ])('groups %s', (typed, printed) => {
    expect(printedPhone(typed)).toBe(printed);
  });

  it.each([
    '072211122',
    '07221112223',
    '0122111222',
    '+44 20 7946 0958',
    'tel. 0722111222',
    'interior 12',
  ])('leaves %s as typed', (typed) => {
    expect(printedPhone(typed)).toBe(typed);
  });
});
