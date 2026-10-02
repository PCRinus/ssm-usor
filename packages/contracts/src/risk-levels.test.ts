import { describe, expect, it } from 'vitest';

import type { WorkSystemComponent } from './risk-evaluations';
import {
  componentShares,
  evaluationGlobalRiskLevel,
  globalRiskLevel,
  gravityConsequence,
  isOverAcceptableLimit,
  isUnacceptableRiskLevel,
  probabilityFrequency,
  riskLevel,
  unacceptableFactors,
} from './risk-levels';

// The pairs as the risk assessment template lists them under "Nivelul de risc N – cuplurile g-p".
const pairsByLevel: Record<number, [number, number][]> = {
  1: [
    [1, 1],
    [1, 2],
    [1, 3],
    [1, 4],
    [1, 5],
    [1, 6],
    [2, 1],
  ],
  2: [
    [2, 2],
    [2, 3],
    [2, 4],
    [3, 1],
    [3, 2],
    [4, 1],
  ],
  3: [
    [2, 5],
    [2, 6],
    [3, 3],
    [3, 4],
    [4, 2],
    [5, 1],
    [6, 1],
    [7, 1],
  ],
  4: [
    [3, 5],
    [3, 6],
    [4, 3],
    [4, 4],
    [5, 2],
    [5, 3],
    [6, 2],
    [7, 2],
  ],
  5: [
    [4, 5],
    [4, 6],
    [5, 4],
    [5, 5],
    [6, 3],
    [7, 3],
  ],
  6: [
    [5, 6],
    [6, 4],
    [6, 5],
    [7, 4],
  ],
  7: [
    [6, 6],
    [7, 5],
    [7, 6],
  ],
};

// The first post of the template's sample assessment, "Manager magazin": code, component,
// gravity, probability and the level its sheet prints.
const managerSheet: [string, WorkSystemComponent, number, number, number][] = [
  ['F1', 'means_of_production', 1, 5, 1],
  ['F2', 'means_of_production', 1, 4, 1],
  ['F3', 'means_of_production', 2, 3, 2],
  ['F4', 'means_of_production', 7, 2, 3],
  ['F5', 'means_of_production', 3, 2, 2],
  ['F6', 'means_of_production', 7, 1, 3],
  ['F7', 'means_of_production', 2, 4, 2],
  ['F8', 'means_of_production', 7, 1, 3],
  ['F9', 'means_of_production', 5, 2, 4],
  ['F10', 'work_environment', 1, 3, 1],
  ['F11', 'work_environment', 1, 3, 1],
  ['F12', 'work_environment', 1, 3, 1],
  ['F13', 'work_environment', 2, 2, 2],
  ['F14', 'work_environment', 1, 3, 1],
  ['F15', 'work_environment', 2, 3, 2],
  ['F16', 'work_environment', 7, 1, 3],
  ['F17', 'work_environment', 2, 5, 3],
  ['F18', 'work_environment', 2, 5, 3],
  ['F19', 'executant', 3, 4, 2],
  ['F20', 'executant', 2, 3, 2],
  ['F21', 'executant', 1, 5, 1],
  ['F22', 'executant', 2, 3, 2],
  ['F23', 'executant', 2, 4, 2],
  ['F24', 'executant', 7, 2, 4],
  ['F25', 'executant', 2, 1, 1],
  ['F26', 'executant', 2, 4, 2],
  ['F27', 'executant', 2, 3, 2],
  ['F28', 'executant', 7, 1, 3],
  ['F29', 'executant', 2, 3, 2],
  ['F30', 'executant', 2, 4, 2],
  ['F31', 'executant', 2, 4, 2],
  ['F32', 'work_task', 2, 3, 2],
  ['F33', 'work_task', 2, 3, 2],
  ['F34', 'work_task', 2, 4, 2],
  ['F35', 'work_task', 1, 5, 1],
  ['F36', 'work_task', 2, 4, 2],
  ['F37', 'work_task', 3, 3, 3],
];

const managerFactors = managerSheet.map(([code, component, gravityClass, probabilityClass]) => ({
  code,
  component,
  gravityClass,
  probabilityClass,
}));

describe('riskLevel', () => {
  it('reads every pair of classes as the method lists them', () => {
    const pairs = Object.entries(pairsByLevel).flatMap(([level, list]) =>
      list.map(([g, p]) => [g, p, Number(level)] as const)
    );
    expect(pairs).toHaveLength(42);
    for (const [g, p, level] of pairs) expect(riskLevel(g, p)).toBe(level);
  });

  it('refuses a class outside the method', () => {
    expect(() => riskLevel(0, 1)).toThrow(RangeError);
    expect(() => riskLevel(8, 1)).toThrow(RangeError);
    expect(() => riskLevel(1, 7)).toThrow(RangeError);
    expect(() => riskLevel(2.5, 1)).toThrow(RangeError);
  });
});

describe('globalRiskLevel', () => {
  it('gives the published sample its 2.79', () => {
    const levels = [
      ...Array(3).fill(1),
      ...Array(11).fill(2),
      ...Array(13).fill(3),
      ...Array(3).fill(4),
    ];
    expect(globalRiskLevel(levels)).toBe(2.79);
  });

  it('gives the template’s first post the 2,40 it prints, from the levels it prints', () => {
    expect(globalRiskLevel(managerSheet.map(([, , , , level]) => level))).toBe(2.4);
  });

  it('is null without factors', () => {
    expect(globalRiskLevel([])).toBeNull();
    expect(evaluationGlobalRiskLevel([])).toBeNull();
  });

  it('rounds a half hundredth up, where dividing first would fall short', () => {
    const levels = [1, ...Array<number>(32).fill(2), ...Array<number>(5).fill(3)];
    expect(globalRiskLevel(levels)).toBe(2.18);
  });
});

describe('the template’s first post, recomputed from its classes', () => {
  it('reads two levels differently from the sheet, which misprints F4 and F19', () => {
    const differing = managerSheet
      .filter(([, , g, p, printed]) => riskLevel(g, p) !== printed)
      .map(([code, , g, p, printed]) => [code, printed, riskLevel(g, p)]);
    expect(differing).toEqual([
      ['F4', 3, 4],
      ['F19', 2, 3],
    ]);
    expect(evaluationGlobalRiskLevel(managerFactors)).toBe(2.49);
    expect(isOverAcceptableLimit(evaluationGlobalRiskLevel(managerFactors))).toBe(false);
  });

  it('finds the unacceptable factors, the highest first', () => {
    expect(unacceptableFactors(managerFactors).map((f) => f.code)).toEqual(['F4', 'F9', 'F24']);
  });

  it('shares the factors between the components as the interpretation prints them', () => {
    expect(componentShares(managerFactors)).toEqual({
      means_of_production: 24.32,
      work_environment: 24.32,
      work_task: 16.22,
      executant: 35.14,
    });
  });
});

describe('limits', () => {
  it('accepts a level up to 3 and a global level up to 3.5', () => {
    expect(isUnacceptableRiskLevel(3)).toBe(false);
    expect(isUnacceptableRiskLevel(4)).toBe(true);
    expect(isOverAcceptableLimit(3.5)).toBe(false);
    expect(isOverAcceptableLimit(3.51)).toBe(true);
    expect(isOverAcceptableLimit(null)).toBe(false);
  });
});

describe('componentShares', () => {
  it('is zero for every component without factors', () => {
    expect(componentShares([])).toEqual({
      executant: 0,
      work_task: 0,
      means_of_production: 0,
      work_environment: 0,
    });
  });
});

describe('gravityConsequence', () => {
  it('words each gravity class as the evaluation sheet does', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(gravityConsequence)).toEqual([
      'Minore reversibile',
      'ITM 3–45 zile',
      'ITM 45–180 zile',
      'Invaliditate gradul III',
      'Invaliditate gradul II',
      'Invaliditate gradul I',
      'Deces',
    ]);
    expect(() => gravityConsequence(8)).toThrow(RangeError);
  });
});

describe('probabilityFrequency', () => {
  it('words each probability class as annex 3 of the method does, with its period', () => {
    expect([1, 2, 3, 4, 5, 6].map(probabilityFrequency)).toEqual([
      { label: 'Extrem de rare', period: 'o dată la peste 10 ani' },
      { label: 'Foarte rare', period: 'o dată la 5–10 ani' },
      { label: 'Rare', period: 'o dată la 2–5 ani' },
      { label: 'Puțin frecvente', period: 'o dată la 1–2 ani' },
      { label: 'Frecvente', period: 'o dată la 1 lună – 1 an' },
      { label: 'Foarte frecvente', period: 'mai des de o dată pe lună' },
    ]);
    expect(() => probabilityFrequency(0)).toThrow(RangeError);
    expect(() => probabilityFrequency(7)).toThrow(RangeError);
  });
});
