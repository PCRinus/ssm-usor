import { describe, expect, it } from 'vitest';

import { groupUnder, ownGroups } from './factor-groups';

describe('groupUnder', () => {
  it('keeps a method group the new component also has', () => {
    expect(groupUnder('work_environment', 'Factori de risc chimic')).toBe('Factori de risc chimic');
  });

  it('drops a method group of another component', () => {
    expect(groupUnder('executant', 'Factori de risc mecanic')).toBe('');
  });

  it('keeps a group the user wrote', () => {
    expect(groupUnder('executant', 'Alte riscuri')).toBe('Alte riscuri');
  });
});

describe('ownGroups', () => {
  it('leaves out the groups of the method, whatever their case or diacritics', () => {
    expect(
      ownGroups(['Alte riscuri', 'factori de risc FIZIC', 'Actiuni gresite', 'Zgomot de fond'])
    ).toEqual(['Alte riscuri', 'Zgomot de fond']);
  });
});
