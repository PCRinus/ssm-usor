import { riskLevel } from '@ssm-usor/contracts';
import { describe, expect, it } from 'vitest';

import {
  factorTabs,
  matrixCells,
  measureCountLabel,
  nextSort,
  parseSortValue,
  sortFactors,
  sortMenu,
  sortValue,
  visibleFactors,
} from './factor-list';
import type { RiskFactor } from './risk-evaluation-schema';

let nextId = 0;

function factor(
  description: string,
  fields: Partial<RiskFactor> & Pick<RiskFactor, 'gravityClass' | 'probabilityClass'>
): RiskFactor {
  return {
    id: String(++nextId),
    component: 'means_of_production',
    group: 'Factori de risc mecanic',
    description,
    measures: [],
    actions: null,
    deadline: null,
    responsiblePerson: null,
    observations: null,
    sourceProfile: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...fields,
    riskLevel: riskLevel(fields.gravityClass, fields.probabilityClass),
  };
}

const measure = (description: string) => ({
  id: description,
  kind: 'technical' as const,
  description,
});

const lifting = factor('Ridicarea sarcinilor', {
  component: 'executant',
  group: 'Acțiuni greșite',
  gravityClass: 3,
  probabilityClass: 5,
  measures: [measure('Cărucioare'), measure('Două persoane')],
});
const noise = factor('Zgomot', {
  component: 'work_environment',
  group: 'Factori de risc fizic',
  gravityClass: 3,
  probabilityClass: 4,
});
const cuts = factor('Tăiere cu scule', { gravityClass: 2, probabilityClass: 5 });
const shock = factor('Electrocutare', {
  group: 'Factori de risc electric',
  gravityClass: 7,
  probabilityClass: 2,
  measures: [measure('Verificarea sculelor')],
});
const caught = factor('Agățare de piese în mișcare', { gravityClass: 5, probabilityClass: 3 });

const factors = [lifting, noise, cuts, shock, caught];
const names = (list: RiskFactor[]) => list.map((item) => item.description);
const sheet = [
  'Tăiere cu scule',
  'Agățare de piese în mișcare',
  'Electrocutare',
  'Zgomot',
  'Ridicarea sarcinilor',
];

describe('the sort of the factor list', () => {
  it('cycles a column from ascending to descending and back to no sort', () => {
    const asc = nextSort(null, 'gravity');
    expect(asc).toEqual({ key: 'gravity', order: 'asc' });
    const desc = nextSort(asc, 'gravity');
    expect(desc).toEqual({ key: 'gravity', order: 'desc' });
    expect(nextSort(desc, 'gravity')).toBeNull();
    expect(nextSort(desc, 'level')).toEqual({ key: 'level', order: 'asc' });
  });

  it('keeps the order of the sheet without a sort: components, then groups', () => {
    expect(names(sortFactors(factors, null))).toEqual(sheet);
  });

  it('sorts each column both ways, keeping the sheet order between equal values', () => {
    expect(names(sortFactors(factors, { key: 'level', order: 'desc' }))).toEqual([
      'Agățare de piese în mișcare',
      'Electrocutare',
      'Ridicarea sarcinilor',
      'Tăiere cu scule',
      'Zgomot',
    ]);
    expect(names(sortFactors(factors, { key: 'gravity', order: 'asc' }))).toEqual([
      'Tăiere cu scule',
      'Zgomot',
      'Ridicarea sarcinilor',
      'Agățare de piese în mișcare',
      'Electrocutare',
    ]);
    expect(names(sortFactors(factors, { key: 'probability', order: 'desc' }))).toEqual([
      'Tăiere cu scule',
      'Ridicarea sarcinilor',
      'Zgomot',
      'Agățare de piese în mișcare',
      'Electrocutare',
    ]);
    expect(names(sortFactors(factors, { key: 'measures', order: 'asc' }))).toEqual([
      'Tăiere cu scule',
      'Agățare de piese în mișcare',
      'Zgomot',
      'Electrocutare',
      'Ridicarea sarcinilor',
    ]);
  });

  it("offers the phone's sorts, and the header's sort when it is not among them", () => {
    expect(sortMenu(null).map((option) => option.label)).toEqual([
      'Ordinea din fișă',
      'Nivelul cel mai mare',
      'Gravitatea cea mai mare',
      'Probabilitatea cea mai mare',
      'Întâi cei fără măsuri',
    ]);
    expect(sortMenu({ key: 'level', order: 'asc' }).at(-1)).toEqual({
      value: 'level:asc',
      label: 'Nivelul cel mai mic',
    });
    expect(parseSortValue(sortValue({ key: 'probability', order: 'desc' }))).toEqual({
      key: 'probability',
      order: 'desc',
    });
    expect(parseSortValue('sheet')).toBeNull();
  });
});

describe('the filters of the factor list', () => {
  it('has a tab for all the factors and one for each component that has any, in sheet order', () => {
    expect(factorTabs(factors)).toEqual([
      { tab: 'all', count: 5 },
      { tab: 'means_of_production', count: 3 },
      { tab: 'work_environment', count: 1 },
      { tab: 'executant', count: 1 },
    ]);
  });

  it("shows one component's factors on its tab", () => {
    expect(
      names(visibleFactors(factors, { tab: 'means_of_production', cell: null, sort: null }))
    ).toEqual(['Tăiere cu scule', 'Agățare de piese în mișcare', 'Electrocutare']);
  });

  it('shows the factors of one cell of the grid, within the tab and in the chosen order', () => {
    const cell = { gravityClass: 3, probabilityClass: 4 };
    expect(names(visibleFactors(factors, { tab: 'all', cell, sort: null }))).toEqual(['Zgomot']);
    expect(visibleFactors(factors, { tab: 'executant', cell, sort: null })).toEqual([]);
  });

  it('counts the factors in each cell of the grid, the highest gravity first', () => {
    const cells = matrixCells(factors);
    expect(cells).toHaveLength(42);
    expect(cells[0]).toEqual({ gravityClass: 7, probabilityClass: 1, level: 3, count: 0 });
    expect(cells.filter((cell) => cell.count > 0)).toEqual([
      { gravityClass: 7, probabilityClass: 2, level: 4, count: 1 },
      { gravityClass: 5, probabilityClass: 3, level: 4, count: 1 },
      { gravityClass: 3, probabilityClass: 4, level: 3, count: 1 },
      { gravityClass: 3, probabilityClass: 5, level: 4, count: 1 },
      { gravityClass: 2, probabilityClass: 5, level: 3, count: 1 },
    ]);
  });
});

describe('the measure count', () => {
  it('reads the count in Romanian', () => {
    expect([0, 1, 2, 19, 20, 101].map(measureCountLabel)).toEqual([
      'Fără măsuri',
      'o măsură',
      '2 măsuri',
      '19 măsuri',
      '20 de măsuri',
      '101 măsuri',
    ]);
  });
});
