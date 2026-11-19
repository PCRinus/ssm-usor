import { type SortOrder, sortOrderSchema } from '@ssm-usor/contracts';
import type { HistoryState, ParsedLocation } from '@tanstack/react-router';
import { z } from 'zod';

import type { DataTableSort } from '@/components/data-table/columns';

import type { ListFilterValues } from './types';
import { listQuerySearchSchema } from './url';

export function listPageSearchSchema<const SortKeys extends readonly [string, ...string[]]>(
  sortKeys: SortKeys
) {
  return z.object({
    page: z.number().int().min(1).optional().catch(undefined),
    sort: z.enum(sortKeys).optional().catch(undefined),
    order: sortOrderSchema.optional().catch(undefined),
    q: listQuerySearchSchema,
  });
}

interface ListSearch {
  page?: number;
  sort?: string;
  order?: SortOrder;
  q?: string;
}

type HistoryStateUpdate = (current: ParsedLocation['state']) => HistoryState;

type ListNavigate<Search> = (options: {
  search: (prev: Search) => Search;
  replace?: boolean;
  resetScroll?: boolean;
  state?: HistoryStateUpdate;
}) => Promise<void>;

/**
 * Searching, filtering and sorting replace the history entry, so that back leaves the list
 * rather than undo them one by one; turning a page adds one. `reset` names what any of them
 * clears beside the page.
 */
export function useListSearch<Search extends ListSearch, Key extends string = never>({
  navigate,
  defaultSort,
  searchOf,
  reset,
  state,
}: {
  // Read only for its type: the route's own search, which `navigate` then writes.
  search: Search;
  navigate: ListNavigate<Search>;
  defaultSort: DataTableSort;
  searchOf?: (values: ListFilterValues<Key>) => Partial<Search>;
  reset?: Partial<Search>;
  state?: HistoryStateUpdate;
}) {
  const changeSearch = (next: Partial<Search>) =>
    navigate({
      ...(state ? { state } : {}),
      replace: true,
      resetScroll: false,
      search: (prev) => ({ ...prev, ...next, page: undefined, ...reset }),
    });
  const changeQuery = (q: string | undefined) => {
    void changeSearch({ q: q || undefined } as Partial<Search>);
  };
  return {
    changeSearch,
    changeQuery,
    changeFilters: (values: ListFilterValues<Key>) => {
      void changeSearch(searchOf ? searchOf(values) : {});
    },
    // A default sort leaves the address, to keep links short.
    onSortChange: (next: DataTableSort) => {
      void changeSearch({
        sort: next.sort === defaultSort.sort ? undefined : next.sort,
        order: next.order === defaultSort.order ? undefined : next.order,
      } as Partial<Search>);
    },
    onPageChange: (next: number) => {
      void navigate({
        ...(state ? { state } : {}),
        search: (prev) => ({ ...prev, page: next > 1 ? next : undefined, ...reset }),
      });
    },
  };
}
