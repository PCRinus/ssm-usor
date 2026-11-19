import { countOf, staffCategories, type StaffCategory } from '@ssm-usor/contracts';
import { Users } from 'lucide-react';

import type { DataTableSort } from '@/components/data-table/columns';
import type { ListFilterFacet } from '@/components/list-filters/types';
import { filterSearchSchema } from '@/components/list-filters/url';
import { listSortSearchSchema } from '@/components/list-filters/use-list-search';
import type { RiskEvaluationSummary } from '@/features/risk-evaluations/risk-evaluation-schema';

import {
  type JobPosition,
  staffCategoryLabels,
  staffCategoryShortLabels,
} from './job-position-schema';

export const jobPositionSortKeys = ['name', 'employees', 'risk'] as const;
export type JobPositionSortKey = (typeof jobPositionSortKeys)[number];

export const defaultJobPositionSort: DataTableSort & { sort: JobPositionSortKey } = {
  sort: 'name',
  order: 'asc',
};

export const jobPositionFilterKeys = ['staffCategory'] as const;
export type JobPositionFilterKey = (typeof jobPositionFilterKeys)[number];

// A client's posts are few and read whole, so they sort and filter here; the address keeps the
// choice as on every list.
export const jobPositionListSearch = {
  ...listSortSearchSchema(jobPositionSortKeys).shape,
  staffCategory: filterSearchSchema(staffCategories),
};

export type JobPositionListSearch = {
  sort?: JobPositionSortKey;
  order?: DataTableSort['order'];
  staffCategory?: StaffCategory[];
};

const categoryOrder: StaffCategory[] = ['execution', 'technical_administrative'];

export const jobPositionFacets: ListFilterFacet<JobPositionFilterKey>[] = [
  {
    key: 'staffCategory',
    label: 'Categorie de personal',
    icon: Users,
    column: 'left',
    options: categoryOrder.map((category) => ({
      value: category,
      label: staffCategoryLabels[category],
      short: staffCategoryShortLabels[category],
    })),
  },
];

export const positionNoun = (count: number) => countOf(count, 'post', 'posturi');

export type PositionEvaluation = Pick<RiskEvaluationSummary, 'factorCount' | 'globalRiskLevel'>;

export interface JobPositionRow {
  position: JobPosition;
  // Undefined while the evaluations load, null for a post not evaluated yet.
  evaluation: PositionEvaluation | null | undefined;
}

const byName = new Intl.Collator('ro', { sensitivity: 'base', numeric: true });

function riskRank(evaluation: PositionEvaluation | null | undefined) {
  if (!evaluation) return 2;
  return evaluation.factorCount === 0 || evaluation.globalRiskLevel === null ? 1 : 0;
}

export function shownJobPositions(rows: readonly JobPositionRow[], search: JobPositionListSearch) {
  const categories = search.staffCategory;
  const kept = rows.filter(
    ({ position }) => !categories || categories.includes(position.staffCategory)
  );
  const sort = search.sort ?? defaultJobPositionSort.sort;
  const direction = (search.order ?? defaultJobPositionSort.order) === 'asc' ? 1 : -1;
  const names = (a: JobPositionRow, b: JobPositionRow) =>
    byName.compare(a.position.name, b.position.name);
  return kept.sort((a, b) => {
    if (sort === 'name') return names(a, b) * direction;
    if (sort === 'employees') {
      const counted = a.position.employeeCount - b.position.employeeCount;
      return counted * direction || names(a, b);
    }
    const ranked = riskRank(a.evaluation) - riskRank(b.evaluation);
    if (ranked !== 0) return ranked;
    const levels = (a.evaluation?.globalRiskLevel ?? 0) - (b.evaluation?.globalRiskLevel ?? 0);
    return levels * direction || names(a, b);
  });
}

// A level over the limit is a finding about the post, not a decision still to take.
export function isUndecided({ position, evaluation }: JobPositionRow) {
  return (
    position.needsProtectiveEquipment === null ||
    position.instructionCount === 0 ||
    position.fireInstructionCount === 0 ||
    riskRank(evaluation) > 0
  );
}
