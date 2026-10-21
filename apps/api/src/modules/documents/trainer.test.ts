import { describe, expect, it } from 'vitest';

import { resolveTrainer } from './trainer';

const owner = { employeeId: 'e-owner', fullName: 'Maria POPESCU' };
const head = { employeeId: 'e-head', fullName: 'Ion POP' };
const worker = { employeeId: 'e-worker', fullName: 'Dan RUS' };
const specialist = { employeeId: null, fullName: 'Dan MARIN' };
const unlinked = { employeeId: null, fullName: null };

describe('who trains', () => {
  it('is the head of the workplace for someone else', () => {
    expect(
      resolveTrainer(
        [worker],
        { managers: [head], legalRepresentative: owner, specialist },
        unlinked
      )
    ).toEqual({ kind: 'managers', managers: [head] });
  });

  it('is every head when nobody is to be trained, as the themes name them before anyone is hired', () => {
    expect(
      resolveTrainer(
        [],
        { managers: [head, owner], legalRepresentative: owner, specialist },
        unlinked
      )
    ).toEqual({ kind: 'managers', managers: [head, owner] });
  });

  it('leaves out a head who would train only themself, and keeps the others', () => {
    expect(
      resolveTrainer(
        [head],
        { managers: [head, owner], legalRepresentative: owner, specialist },
        unlinked
      )
    ).toEqual({ kind: 'managers', managers: [owner] });
  });

  it('falls back to the legal representative when the only head is the trainee', () => {
    expect(
      resolveTrainer([head], { managers: [head], legalRepresentative: owner, specialist }, unlinked)
    ).toEqual({ kind: 'legal_representative' });
  });

  it('falls back to the specialist in a one-person firm whose owner is linked as the administrator', () => {
    const linked = { employeeId: 'e-owner', fullName: 'Maria Popescu' };
    const administrator = { employeeId: null, fullName: 'Maria Popescu' };
    expect(
      resolveTrainer(
        [owner],
        { managers: [administrator], legalRepresentative: administrator, specialist },
        linked
      )
    ).toEqual({ kind: 'specialist' });
  });

  it('tells a namesake head apart from the owner by the link', () => {
    const linked = { employeeId: 'e-owner', fullName: 'Maria Popescu' };
    const namesake = { employeeId: 'e-namesake', fullName: 'Maria Popescu' };
    expect(
      resolveTrainer(
        [owner],
        { managers: [namesake], legalRepresentative: owner, specialist },
        linked
      )
    ).toEqual({ kind: 'managers', managers: [namesake] });
  });

  it('goes by the name for a client without the link, however it is typed', () => {
    const administrator = { employeeId: null, fullName: 'popescu maria' };
    expect(
      resolveTrainer(
        [owner],
        { managers: [administrator], legalRepresentative: administrator, specialist },
        unlinked
      )
    ).toEqual({ kind: 'specialist' });
  });

  it('keeps a head who trains a group they belong to', () => {
    expect(
      resolveTrainer(
        [head, worker],
        { managers: [head], legalRepresentative: owner, specialist },
        unlinked
      )
    ).toEqual({ kind: 'managers', managers: [head] });
  });

  it('names nobody when every candidate is the trainee or missing', () => {
    expect(
      resolveTrainer(
        [owner],
        { managers: [], legalRepresentative: owner, specialist: null },
        unlinked
      )
    ).toBeNull();
  });
});
