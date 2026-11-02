import { riskLevel } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import { originSummary } from './factor-origin';
import { type RiskFactor, sheetCountLabel } from './risk-evaluation-schema';

let nextId = 0;

const office = { id: 'office', name: 'Lucrător de birou' };
const driver = { id: 'driver', name: 'Șofer' };
const welder = { id: 'welder', name: 'Sudor' };

function factor(sourceProfile: RiskFactor['sourceProfile']): RiskFactor {
  return {
    id: String(++nextId),
    component: 'means_of_production',
    group: 'Factori de risc mecanic',
    description: 'Factor',
    measures: [],
    actions: null,
    deadline: null,
    responsiblePerson: null,
    observations: null,
    sourceProfile,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    gravityClass: 2,
    probabilityClass: 2,
    riskLevel: riskLevel(2, 2),
  };
}

const many = (count: number, sourceProfile: RiskFactor['sourceProfile']) =>
  Array.from({ length: count }, () => factor(sourceProfile));

const sentence = (factors: RiskFactor[]) =>
  originSummary(factors)
    ?.map((part) => (typeof part === 'string' ? part : part.name))
    .join('') ?? null;

describe('the origin summary of an evaluation', () => {
  it('says nothing while no factor is in the library', () => {
    expect(sentence(many(3, null))).toBeNull();
    expect(sentence([])).toBeNull();
  });

  it('names the one profile all the factors are in', () => {
    expect(sentence(many(1, office))).toBe(
      'Factorul este în evaluarea Lucrător de birou din bibliotecă.'
    );
    expect(sentence(many(2, office))).toBe(
      'Ambii factori sunt în evaluarea Lucrător de birou din bibliotecă.'
    );
    expect(sentence(many(12, office))).toBe(
      'Toți cei 12 factori sunt în evaluarea Lucrător de birou din bibliotecă.'
    );
    expect(sentence(many(20, office))).toBe(
      'Toți cei 20 de factori sunt în evaluarea Lucrător de birou din bibliotecă.'
    );
  });

  it('counts the factors that are in no profile', () => {
    expect(sentence([factor(office), factor(null)])).toBe(
      'Un factor este în evaluarea Lucrător de birou; celălalt nu este în bibliotecă.'
    );
    expect(sentence([...many(5, office), factor(null)])).toBe(
      '5 factori sunt în evaluarea Lucrător de birou; unul nu este în bibliotecă.'
    );
    expect(sentence([...many(5, office), ...many(7, null)])).toBe(
      '5 factori sunt în evaluarea Lucrător de birou; ceilalți 7 nu sunt în bibliotecă.'
    );
  });

  it('names several profiles, the most used first', () => {
    expect(sentence([factor(driver), ...many(3, office)])).toBe(
      '3 factori sunt în evaluarea Lucrător de birou și unul în evaluarea Șofer din bibliotecă.'
    );
    expect(
      sentence([...many(2, welder), ...many(8, office), ...many(2, driver), ...many(4, null)])
    ).toBe(
      '8 factori sunt în evaluarea Lucrător de birou, 2 în evaluarea Sudor și 2 în evaluarea Șofer; ceilalți 4 nu sunt în bibliotecă.'
    );
  });
});

describe('sheetCountLabel', () => {
  it('counts sheets the Romanian way', () => {
    expect([0, 1, 2, 19, 20, 101, 120].map(sheetCountLabel)).toEqual([
      'Nicio fișă',
      'O fișă',
      '2 fișe',
      '19 fișe',
      '20 de fișe',
      '101 fișe',
      '120 de fișe',
    ]);
  });
});
