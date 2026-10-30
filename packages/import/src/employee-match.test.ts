import { describe, expect, it } from 'vitest';

import { findExistingEmployee, matchJobTitle, matchWorkplace } from './employee-match';
import { cnps, existingPop, positions, workplaces } from './test/sheets';

describe('matchJobTitle', () => {
  it('assigns a post named exactly like the title, whatever its diacritics and case', () => {
    expect(matchJobTitle('BRUTAR', positions)).toEqual({
      match: 'exact',
      proposedId: positions[1]!.id,
      closestId: null,
    });
  });

  it('proposes a near post for a title in the holder’s gender', () => {
    expect(matchJobTitle('Vânzătoare', positions).match).toBe('near');
    expect(matchJobTitle('Vânzătoare', positions).proposedId).toBe(positions[2]!.id);
    expect(matchJobTitle('Patiseră', positions).proposedId).toBe(positions[0]!.id);
  });

  it('suggests the closest post when none matches, and none without posts', () => {
    expect(matchJobTitle('Contabil', positions)).toMatchObject({ match: 'none', proposedId: null });
    expect(matchJobTitle('Contabil', positions).closestId).not.toBeNull();
    expect(matchJobTitle('Contabil', [])).toEqual({
      match: 'none',
      proposedId: null,
      closestId: null,
    });
  });
});

describe('matchWorkplace', () => {
  it('matches by name or by address', () => {
    expect(matchWorkplace('sediu', workplaces).proposedId).toBe(workplaces[0]!.id);
    expect(matchWorkplace('Piata Mare 1', workplaces)).toMatchObject({
      match: 'exact',
      proposedId: workplaces[1]!.id,
    });
  });

  it('proposes a workplace whose name the text starts with', () => {
    expect(matchWorkplace('Magazinul Centru', workplaces)).toMatchObject({
      match: 'near',
      proposedId: workplaces[1]!.id,
    });
  });

  it('asks for an empty or unknown text', () => {
    expect(matchWorkplace('', workplaces).match).toBe('none');
    expect(matchWorkplace('Depozit Nord', workplaces).match).toBe('none');
  });
});

describe('findExistingEmployee', () => {
  it('finds the employee by CNP', () => {
    expect(
      findExistingEmployee(
        { cnp: cnps.pop, lastName: 'Popa', firstName: 'Elena', birthDate: null },
        [existingPop]
      )
    ).toMatchObject({ matchedBy: 'cnp', employee: { id: existingPop.id } });
  });

  it('finds the employee by name and birth date without a CNP', () => {
    expect(
      findExistingEmployee(
        { cnp: null, lastName: 'POP', firstName: 'Elena', birthDate: '1990-07-20' },
        [existingPop]
      )?.matchedBy
    ).toBe('name_birth_date');
  });

  it('takes nobody for the name alone, or for another CNP', () => {
    expect(
      findExistingEmployee({ cnp: null, lastName: 'Pop', firstName: 'Elena', birthDate: null }, [
        existingPop,
      ])
    ).toBeNull();
    expect(
      findExistingEmployee(
        { cnp: cnps.coman, lastName: 'Pop', firstName: 'Elena', birthDate: '1990-07-20' },
        [existingPop]
      )
    ).toBeNull();
  });
});
