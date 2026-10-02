import { riskLevel, sheetComponents, type WorkSystemComponent } from '@ssm-usor/contracts';

import { type RiskFactor, sectionsOf } from './risk-evaluation-schema';

export type FactorSortKey = 'level' | 'description' | 'gravity' | 'probability' | 'measures';

export type FactorSort = { key: FactorSortKey; order: 'asc' | 'desc' } | null;

export interface MatrixCell {
  gravityClass: number;
  probabilityClass: number;
}

export type FactorTab = WorkSystemComponent | 'all';

const collator = new Intl.Collator('ro');

const comparators: Record<FactorSortKey, (a: RiskFactor, b: RiskFactor) => number> = {
  level: (a, b) => a.riskLevel - b.riskLevel,
  description: (a, b) => collator.compare(a.description, b.description),
  gravity: (a, b) => a.gravityClass - b.gravityClass,
  probability: (a, b) => a.probabilityClass - b.probabilityClass,
  measures: (a, b) => a.measures.length - b.measures.length,
};

export function nextSort(current: FactorSort, key: FactorSortKey): FactorSort {
  if (current?.key !== key) return { key, order: 'asc' };
  return current.order === 'asc' ? { key, order: 'desc' } : null;
}

export function sheetOrder(factors: readonly RiskFactor[]): RiskFactor[] {
  return sectionsOf(factors).flatMap((section) => section.groups.flatMap((group) => group.factors));
}

export function sortFactors(factors: readonly RiskFactor[], sort: FactorSort): RiskFactor[] {
  const sheet = sheetOrder(factors);
  if (!sort) return sheet;
  const compare = comparators[sort.key];
  const sign = sort.order === 'asc' ? 1 : -1;
  return sheet
    .map((factor, index) => ({ factor, index }))
    .sort((a, b) => sign * compare(a.factor, b.factor) || a.index - b.index)
    .map(({ factor }) => factor);
}

export function isInCell(factor: RiskFactor, cell: MatrixCell) {
  return (
    factor.gravityClass === cell.gravityClass && factor.probabilityClass === cell.probabilityClass
  );
}

export function sameCell(a: MatrixCell | null, b: MatrixCell | null) {
  return (
    a !== null &&
    b !== null &&
    a.gravityClass === b.gravityClass &&
    a.probabilityClass === b.probabilityClass
  );
}

export function factorTabs(factors: readonly RiskFactor[]) {
  return [
    { tab: 'all' as FactorTab, count: factors.length },
    ...sheetComponents.flatMap((component) => {
      const count = factors.filter((factor) => factor.component === component).length;
      return count > 0 ? [{ tab: component as FactorTab, count }] : [];
    }),
  ];
}

export function visibleFactors(
  factors: readonly RiskFactor[],
  { tab, cell, sort }: { tab: FactorTab; cell: MatrixCell | null; sort: FactorSort }
): RiskFactor[] {
  return sortFactors(factors, sort).filter(
    (factor) =>
      (tab === 'all' || factor.component === tab) && (cell === null || isInCell(factor, cell))
  );
}

export const gravityRows = [7, 6, 5, 4, 3, 2, 1] as const;
export const probabilityColumns = [1, 2, 3, 4, 5, 6] as const;

export function matrixCells(factors: readonly RiskFactor[]) {
  return gravityRows.flatMap((gravityClass) =>
    probabilityColumns.map((probabilityClass) => ({
      gravityClass,
      probabilityClass,
      level: riskLevel(gravityClass, probabilityClass),
      count: factors.filter((factor) => isInCell(factor, { gravityClass, probabilityClass }))
        .length,
    }))
  );
}

export function cellCountLabel(count: number) {
  if (count === 1) return '1 factor';
  const tens = count % 100;
  return tens === 0 || tens >= 20 ? `${count} de factori` : `${count} factori`;
}

export function measureCountLabel(count: number) {
  if (count === 0) return 'Fără măsuri';
  if (count === 1) return 'o măsură';
  const tens = count % 100;
  return tens === 0 || tens >= 20 ? `${count} de măsuri` : `${count} măsuri`;
}

const sortLabels: Record<FactorSortKey, Record<'asc' | 'desc', string>> = {
  level: { asc: 'Nivelul cel mai mic', desc: 'Nivelul cel mai mare' },
  gravity: { asc: 'Gravitatea cea mai mică', desc: 'Gravitatea cea mai mare' },
  probability: { asc: 'Probabilitatea cea mai mică', desc: 'Probabilitatea cea mai mare' },
  measures: { asc: 'Întâi cei fără măsuri', desc: 'Întâi cei cu cele mai multe măsuri' },
  description: { asc: 'Alfabetic', desc: 'Alfabetic, invers' },
};

const menuSorts: FactorSort[] = [
  null,
  { key: 'level', order: 'desc' },
  { key: 'gravity', order: 'desc' },
  { key: 'probability', order: 'desc' },
  { key: 'measures', order: 'asc' },
  { key: 'description', order: 'asc' },
];

export const sortValue = (sort: FactorSort) => (sort ? `${sort.key}:${sort.order}` : 'sheet');

export function parseSortValue(value: string): FactorSort {
  if (value === 'sheet') return null;
  const [key, order] = value.split(':') as [FactorSortKey, 'asc' | 'desc'];
  return { key, order };
}

// A sort picked from the column headers on a wider screen joins the list, so the menu can show it.
export function sortMenu(current: FactorSort) {
  const sorts = menuSorts.some((sort) => sortValue(sort) === sortValue(current))
    ? menuSorts
    : [...menuSorts, current];
  return sorts.map((sort) => ({
    value: sortValue(sort),
    label: sort ? sortLabels[sort.key][sort.order] : 'Ordinea din fișă',
  }));
}
