import { defaultPageSize, legalActDomains, sortOrderSchema } from '@ssm-usor/contracts';
import { CircleDot, Layers } from 'lucide-react';
import { z } from 'zod';

import type { LegalActListResponseItemsItem } from '@/api/generated/api';
import type { DataTableSort } from '@/components/data-table/columns';
import type { ListFilterFacet } from '@/components/list-filters/types';
import { filterSearchSchema } from '@/components/list-filters/url';
import { roCount } from '@/features/employees/employee-format';

export type WatchedAct = LegalActListResponseItemsItem;

export const actStates = ['open', 'in_force', 'repealed', 'unchecked'] as const;
export type ActState = (typeof actStates)[number];

// A change under review outranks what the portal says of the act: the page sends the member to it.
export function actState(act: WatchedAct): ActState {
  if (act.openChange) return 'open';
  if (act.portalStatus === 'repealed') return 'repealed';
  if (act.portalStatus === null) return 'unchecked';
  return 'in_force';
}

export const actStateLabels: Record<ActState, string> = {
  open: 'În verificare',
  in_force: 'În vigoare',
  repealed: 'Abrogat',
  unchecked: 'Neverificat',
};

export const domainLabels: Record<(typeof legalActDomains)[number], string> = {
  ssm: 'SSM',
  su: 'SU',
};

export const watchedActSortKeys = ['name', 'consolidated', 'cited'] as const;
export type WatchedActSortKey = (typeof watchedActSortKeys)[number];

export const attentionSort = 'attention';

export const watchedActFilterKeys = ['domain', 'status'] as const;
export type WatchedActFilterKey = (typeof watchedActFilterKeys)[number];

export const watchedActListSearch = z.object({
  page: z.number().int().min(1).optional().catch(undefined),
  sort: z.enum(watchedActSortKeys).optional().catch(undefined),
  order: sortOrderSchema.optional().catch(undefined),
  // An act's number typed into the address, "?q=1425", arrives parsed as a number.
  q: z
    .preprocess((value) => (typeof value === 'number' ? String(value) : value), z.string().max(100))
    .optional()
    .catch(undefined),
  domain: filterSearchSchema(legalActDomains),
  status: filterSearchSchema(actStates),
});

export type WatchedActListSearch = Partial<z.output<typeof watchedActListSearch>>;

export const watchedActPageSize = defaultPageSize;

export const actNoun = (count: number) => roCount(count, 'act', 'acte');

export function watchedActFacets(
  acts: readonly WatchedAct[] | undefined
): ListFilterFacet<WatchedActFilterKey>[] {
  const occurring = new Set(acts?.map(actState));
  return [
    {
      key: 'domain',
      label: 'Domeniu',
      icon: Layers,
      column: 'left',
      options: legalActDomains.map((domain) => ({ value: domain, label: domainLabels[domain] })),
    },
    {
      key: 'status',
      label: 'Stare',
      icon: CircleDot,
      column: 'right',
      loading: !acts,
      options: actStates.map((state) => ({
        value: state,
        label: actStateLabels[state],
        onlyWhenChosen: !occurring.has(state),
      })),
    },
  ];
}

const fillerWords = new Set(['nr', 'nr.', 'din']);

// "Legea nr. 319 din 2006" and "Ordinul 163/2007" are how acts are cited in full; the list names
// them "Legea 319/2006" and "OMAI 163/2007".
export const searchable = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('ro')
    .split(/\s+/)
    .filter((word) => !fillerWords.has(word))
    .map((word) => (word === 'ordinul' ? 'ordin' : word))
    .join('')
    .replace(/[./]/g, '');

const searchedNames = (act: WatchedAct) => [
  act.name,
  ...(act.name.startsWith('OMAI ') ? [act.name.replace(/^OMAI/, 'Ordin')] : []),
  ...(act.subject === null ? [] : [act.subject]),
];

const collator = new Intl.Collator('ro', { numeric: true });
const byName = (a: WatchedAct, b: WatchedAct) => collator.compare(a.name, b.name);

const compareBy: Record<WatchedActSortKey, (a: WatchedAct, b: WatchedAct) => number> = {
  name: byName,
  consolidated: (a, b) => collator.compare(a.lastConsolidatedOn ?? '', b.lastConsolidatedOn ?? ''),
  cited: (a, b) => a.citedIn.documents - b.citedIn.documents || a.citedIn.quotes - b.citedIn.quotes,
};

export function shownWatchedActs(acts: readonly WatchedAct[], search: WatchedActListSearch) {
  const query = search.q ? searchable(search.q) : '';
  const kept = acts.filter(
    (act) =>
      (!search.domain || search.domain.some((domain) => act.domains.includes(domain))) &&
      (!search.status || search.status.includes(actState(act))) &&
      (!query || searchedNames(act).some((text) => searchable(text).includes(query)))
  );
  if (!search.sort) {
    const rank = (act: WatchedAct) => (act.openChange ? 0 : 1);
    return kept.sort((a, b) => rank(a) - rank(b) || byName(a, b));
  }
  const compare = compareBy[search.sort];
  const direction = search.order === 'desc' ? -1 : 1;
  return kept.sort((a, b) => {
    if (search.sort === 'consolidated' && !a.lastConsolidatedOn !== !b.lastConsolidatedOn) {
      return a.lastConsolidatedOn ? -1 : 1;
    }
    return compare(a, b) * direction || byName(a, b);
  });
}

export function tableSort(search: WatchedActListSearch): DataTableSort {
  return search.sort
    ? { sort: search.sort, order: search.order ?? 'asc' }
    : { sort: attentionSort, order: 'asc' };
}

export const pageOf = <T>(rows: readonly T[], page: number) =>
  rows.slice((page - 1) * watchedActPageSize, page * watchedActPageSize);
