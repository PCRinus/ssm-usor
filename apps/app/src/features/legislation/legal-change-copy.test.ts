import { describe, expect, it } from 'vitest';

import { documentsText, titlesOf } from './legal-change-copy';

const ssmTraining = {
  typeKey: 'decision_training',
  title: 'Decizia privind responsabilii cu instruirea',
  set: 'occupational_safety',
} as const;
const suOrganization = {
  typeKey: 'fire_decision_organization',
  title: 'Decizia privind organizarea apărării împotriva incendiilor',
  set: 'fire_safety',
} as const;
const ssmThemes = {
  typeKey: 'training_themes',
  title: 'Tematica și programul de instruire',
  set: 'occupational_safety',
} as const;

describe('titlesOf', () => {
  it('numbers the titles of one set without naming it', () => {
    expect(titlesOf([ssmTraining, ssmThemes])).toEqual([
      '1.1 Decizia privind responsabilii cu instruirea',
      '4.2 Tematica și programul de instruire',
    ]);
  });

  it('names the set before each title when the list holds both', () => {
    expect(titlesOf([ssmTraining, suOrganization])).toEqual([
      'SSM 1.1 Decizia privind responsabilii cu instruirea',
      'SU 1.1 Decizia privind organizarea apărării împotriva incendiilor',
    ]);
  });
});

describe('documentsText', () => {
  it('names the sets in a short list that holds both', () => {
    expect(documentsText([ssmTraining, suOrganization])).toBe(
      'SSM 1.1 Decizia privind responsabilii cu instruirea, SU 1.1 Decizia privind organizarea apărării împotriva incendiilor'
    );
  });
});
