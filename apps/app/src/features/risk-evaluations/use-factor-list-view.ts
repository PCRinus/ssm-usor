import { sheetComponents, sortOrderSchema } from '@ssm-usor/contracts';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { z } from 'zod';

import {
  type FactorSort,
  factorSortKeys,
  type FactorTab,
  isInCell,
  type MatrixCell,
  sameCell,
} from './factor-list';
import type { RiskFactor } from './risk-evaluation-schema';

// Without a sort the list keeps the order of the printed sheet.
export const factorListSearch = z.object({
  tab: z.enum(sheetComponents).optional().catch(undefined),
  sort: z.enum(factorSortKeys).optional().catch(undefined),
  order: sortOrderSchema.optional().catch(undefined),
  gravity: z.int().min(1).max(7).optional().catch(undefined),
  probability: z.int().min(1).max(6).optional().catch(undefined),
});

type FactorListSearch = z.infer<typeof factorListSearch>;

export interface FactorListView {
  tab: FactorTab;
  sort: FactorSort;
  cell: MatrixCell | null;
  setTab: (tab: FactorTab) => void;
  setSort: (sort: FactorSort) => void;
  toggleCell: (cell: MatrixCell) => void;
  clearCell: () => void;
}

export function useFactorListView(factors: readonly RiskFactor[], listId: string): FactorListView {
  const search = factorListSearch.parse(useSearch({ strict: false }));
  const navigate = useNavigate();

  const change = (patch: FactorListSearch) =>
    navigate({
      to: '.',
      search: (previous) => ({ ...previous, ...patch }),
      replace: true,
      resetScroll: false,
    });

  const tab =
    search.tab && factors.some((factor) => factor.component === search.tab) ? search.tab : 'all';
  const sort = search.sort ? { key: search.sort, order: search.order ?? 'asc' } : null;
  const picked =
    search.gravity && search.probability
      ? { gravityClass: search.gravity, probabilityClass: search.probability }
      : null;
  const cell = picked && factors.some((factor) => isInCell(factor, picked)) ? picked : null;
  const clearCell = () => void change({ gravity: undefined, probability: undefined });

  return {
    tab,
    sort,
    cell,
    setTab: (next) => void change({ tab: next === 'all' ? undefined : next }),
    setSort: (next) => void change({ sort: next?.key, order: next?.order }),
    toggleCell: (next) => {
      if (sameCell(cell, next)) {
        clearCell();
        return;
      }
      void change({ gravity: next.gravityClass, probability: next.probabilityClass }).then(() =>
        requestAnimationFrame(() => revealList(listId))
      );
    },
    clearCell,
  };
}

// On a phone, and on an evaluation where the work system sits between the cards, the list is
// below the fold and a click on the grid would seem to do nothing.
function revealList(listId: string) {
  const list = document.getElementById(listId);
  if (!list || list.getBoundingClientRect().top < window.innerHeight - 160) return;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  list.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}
