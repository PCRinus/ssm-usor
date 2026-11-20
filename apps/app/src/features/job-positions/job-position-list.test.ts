import { describe, expect, it } from 'vitest';

import { isUndecided, type JobPositionRow, shownJobPositions } from './job-position-list';
import type { JobPosition } from './job-position-schema';

const position = (name: string, overrides: Partial<JobPosition> = {}): JobPosition => ({
  id: name,
  clientId: 'client',
  name,
  staffCategory: 'execution',
  workZone: null,
  activities: null,
  trainingIntervalMonths: null,
  employeeCount: 1,
  employeesToTrainCount: 0,
  needsProtectiveEquipment: false,
  equipmentCount: 0,
  instructionCount: 1,
  fireInstructionCount: 1,
  createdAt: '2026-09-20T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z',
  ...overrides,
});

const row = (
  name: string,
  evaluation: JobPositionRow['evaluation'],
  overrides: Partial<JobPosition> = {}
): JobPositionRow => ({ position: position(name, overrides), evaluation });

const level = (globalRiskLevel: number) => ({ factorCount: 5, globalRiskLevel });
const noFactors = { factorCount: 0, globalRiskLevel: null };

const rows = [
  row('Zidar', level(2.5), { employeeCount: 4 }),
  row('Ștanțator', null, { employeeCount: 9, staffCategory: 'execution' }),
  row('Contabil', level(1.8), { employeeCount: 1, staffCategory: 'technical_administrative' }),
  row('Electrician', noFactors, { employeeCount: 4 }),
  row('Sudor', level(3.9), { employeeCount: 2 }),
  row('Agent', level(2.5), { employeeCount: 0, staffCategory: 'technical_administrative' }),
];

const names = (shown: JobPositionRow[]) => shown.map((each) => each.position.name);

describe('shownJobPositions', () => {
  it('orders by name the Romanian way by default, either direction', () => {
    expect(names(shownJobPositions(rows, {}))).toEqual([
      'Agent',
      'Contabil',
      'Electrician',
      'Sudor',
      'Ștanțator',
      'Zidar',
    ]);
    expect(names(shownJobPositions(rows, { order: 'desc' }))[0]).toBe('Zidar');
  });

  it('orders names as the documents do: diacritics after their letter, numbers by value, ties by id', () => {
    const named = [
      row('Șofer', null),
      row('Operator 10', null),
      row('Sudor', null, { id: 'b' }),
      row('Operator 2', null),
      row('Sudor', null, { id: 'a' }),
      row('Îngrijitor', null),
      row('Inginer', null),
    ];
    expect(
      shownJobPositions(named, {}).map(
        ({ position }) => `${position.name}${position.id.length === 1 ? ` ${position.id}` : ''}`
      )
    ).toEqual([
      'Inginer',
      'Îngrijitor',
      'Operator 2',
      'Operator 10',
      'Sudor a',
      'Sudor b',
      'Șofer',
    ]);
  });

  it('orders by workers, the name breaking ties', () => {
    expect(names(shownJobPositions(rows, { sort: 'employees', order: 'desc' }))).toEqual([
      'Ștanțator',
      'Electrician',
      'Zidar',
      'Sudor',
      'Contabil',
      'Agent',
    ]);
  });

  it('orders by the global level, sheets without factors and posts not evaluated last either way', () => {
    expect(names(shownJobPositions(rows, { sort: 'risk', order: 'desc' }))).toEqual([
      'Sudor',
      'Agent',
      'Zidar',
      'Contabil',
      'Electrician',
      'Ștanțator',
    ]);
    expect(names(shownJobPositions(rows, { sort: 'risk', order: 'asc' }))).toEqual([
      'Contabil',
      'Agent',
      'Zidar',
      'Sudor',
      'Electrician',
      'Ștanțator',
    ]);
  });

  it('keeps the categories chosen, any number of them', () => {
    expect(names(shownJobPositions(rows, { staffCategory: ['technical_administrative'] }))).toEqual(
      ['Agent', 'Contabil']
    );
    expect(
      shownJobPositions(rows, { staffCategory: ['technical_administrative', 'execution'] })
    ).toHaveLength(6);
  });

  it('leaves the rows it was given in their order', () => {
    const before = names(rows);
    shownJobPositions(rows, { sort: 'risk', order: 'desc' });
    expect(names(rows)).toEqual(before);
  });
});

describe('isUndecided', () => {
  it('counts a missing decision or sheet, not a level over the limit', () => {
    expect(isUndecided(row('Sudor', level(4.2)))).toBe(false);
    expect(isUndecided(row('Sudor', null))).toBe(true);
    expect(isUndecided(row('Sudor', noFactors))).toBe(true);
    expect(isUndecided(row('Sudor', level(2), { needsProtectiveEquipment: null }))).toBe(true);
    expect(isUndecided(row('Sudor', level(2), { fireInstructionCount: 0 }))).toBe(true);
  });
});
