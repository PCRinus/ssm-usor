import { describe, expect, it } from 'vitest';

import { groupHeldTrainings, type HeldRow } from './held-trainings';

const row = (parts: Partial<HeldRow>): HeldRow => ({
  rowId: 'row-1',
  personId: 'person-1',
  domain: 'ssm',
  phase: 'periodic',
  heldOn: '2026-07-01',
  durationMinutes: 120,
  trainerName: 'Barbu Ionuț',
  trainerJobTitle: null,
  verifierName: null,
  verifierJobTitle: null,
  material: 'Instrucțiuni proprii cuptor gaz',
  supplementaryReason: null,
  ...parts,
});

describe('groupHeldTrainings', () => {
  it('makes one training held of rows that agree in domain, phase, day, trainer, duration and material', () => {
    const held = groupHeldTrainings([
      row({}),
      row({
        rowId: 'row-2',
        personId: 'person-2',
        trainerName: 'BARBU IONUT',
        trainerJobTitle: 'Inspector SSM',
      }),
      row({ rowId: 'row-3', personId: 'person-3', material: 'instrucțiuni proprii, cuptor gaz' }),
    ]);

    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ key: 'row-1', trainerJobTitle: 'Inspector SSM' });
    expect(held[0]!.rows.map((each) => each.personId)).toEqual([
      'person-1',
      'person-2',
      'person-3',
    ]);
  });

  it.each([
    ['duration', { durationMinutes: 90 }],
    ['material', { material: 'Prim ajutor' }],
    ['trainer', { trainerName: 'Matei Sorin' }],
    ['day', { heldOn: '2026-07-02' }],
    ['phase', { phase: 'supplementary' as const, supplementaryReason: 'new_equipment' as const }],
    ['domain', { domain: 'psi' as const }],
  ])('keeps apart rows of another %s', (_, parts) => {
    const held = groupHeldTrainings([
      row({}),
      row({ rowId: 'row-2', personId: 'person-2', ...parts }),
    ]);

    expect(held).toHaveLength(2);
  });

  it('counts a person once in a training held', () => {
    const held = groupHeldTrainings([row({}), row({ rowId: 'row-2' })]);

    expect(held[0]!.rows).toEqual([{ rowId: 'row-1', personId: 'person-1' }]);
  });
});
