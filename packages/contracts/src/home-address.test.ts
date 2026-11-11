import { describe, expect, it } from 'vitest';

import { homeAddressDetail, sameHomeAddress } from './home-address';

const full = 'Mun. Cluj-Napoca, jud. Cluj, str. Horea, nr. 12';

describe('sameHomeAddress', () => {
  it.each([
    ['a county on one reading only', full, 'Cluj-Napoca, str. Horea nr. 12'],
    [
      'the same parts in another order',
      'Loc. Dumbrăvița, jud. Timiș, str. Florilor, nr. 12, bl. 3, ap. 5',
      'Str. Florilor, nr. 12, bl. 3, ap. 5, Dumbrăvița, Timis',
    ],
    [
      'labels written out or left out',
      'Municipiul Cluj-Napoca, Județul Cluj, Strada Horea, Număr 12, Bloc A3, Scara 2, Etaj 4, Apartament 17',
      'Cluj Napoca, Horea, nr.12, bl. A3, sc. 2, et. 4, ap. 17',
    ],
    ['an unlabelled county name', 'Str. Horea nr. 12, Cluj-Napoca, Cluj', 'Cluj-Napoca, Horea 12'],
    ['no commas at all', 'Mun Cluj-Napoca str Horea nr 12', 'cluj-napoca, STR. HOREA, NR. 12'],
    ['a letter after the number', 'Str. Horea nr. 12 A, Cluj-Napoca', 'Cluj-Napoca, Horea 12A'],
    [
      'a town that shares its county’s name',
      'Mun. Buzău, jud. Buzău, str. Unirii, nr. 4',
      'Buzău, str. Unirii nr. 4',
    ],
    [
      'a boulevard abbreviated',
      'Bd. Eroilor nr. 8, Oraș Florești',
      'B-dul Eroilor, nr. 8, Florești, jud. Cluj',
    ],
  ])('takes %s for the same address', (_, a, b) => {
    expect(sameHomeAddress(a, b)).toBe(true);
    expect(sameHomeAddress(b, a)).toBe(true);
  });

  it.each([
    ['another street', full, 'Cluj-Napoca, str. Dorobanților nr. 12'],
    ['another house number', full, 'Cluj-Napoca, str. Horea nr. 14'],
    ['another locality', full, 'Florești, str. Horea nr. 12'],
    ['another county', full, 'Mun. Cluj-Napoca, jud. Alba, str. Horea, nr. 12'],
    ['a county name against a labelled other one', full, 'Cluj-Napoca, str. Horea nr. 12, Alba'],
    ['a flat on one reading only', `${full}, ap. 3`, 'Cluj-Napoca, str. Horea nr. 12'],
    ['a block on one reading only', `${full}, bl. B2`, full],
    [
      'another flat',
      'Cluj-Napoca, str. Horea nr. 12, bl. 3, ap. 5',
      'Cluj-Napoca, str. Horea nr. 12, bl. 5, ap. 3',
    ],
    [
      'another floor and staircase',
      'Cluj-Napoca, str. Horea nr. 12, bl. 3, sc. A, et. 1, ap. 5',
      'Cluj-Napoca, str. Horea nr. 12, bl. 3, sc. B, et. 2, ap. 5',
    ],
    ['a number on one reading only', full, 'Cluj-Napoca, str. Horea'],
    ['a locality on one reading only', full, 'jud. Cluj, str. Horea, nr. 12'],
    [
      'a street type against another',
      'Calea Turzii nr. 5, Cluj-Napoca',
      'Str. Turzii nr. 5, Cluj-Napoca',
    ],
    [
      'a locality and a street swapped',
      'Loc. Horea, str. Avram Iancu, nr. 1',
      'Loc. Avram Iancu, str. Horea, nr. 1',
    ],
  ])('keeps %s apart', (_, a, b) => {
    expect(sameHomeAddress(a, b)).toBe(false);
    expect(sameHomeAddress(b, a)).toBe(false);
  });
});

describe('homeAddressDetail', () => {
  it('counts the county as detail', () => {
    expect(homeAddressDetail(full)).toBeGreaterThan(
      homeAddressDetail('Cluj-Napoca, str. Horea nr. 12')
    );
  });
});
