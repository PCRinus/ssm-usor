import { describe, expect, it } from 'vitest';

import { groupUnder } from './factor-groups';

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
