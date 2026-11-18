import { describe, expect, it } from 'vitest';

import { definiteRole, listed, runOn, withoutFinalStop } from './romanian';

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
