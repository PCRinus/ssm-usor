import type { LegalActListResponseItemsItem } from '@/api/generated/api';
import type { DataTableSort } from '@/components/data-table/columns';

import { portalStatusLabel } from './legislation-labels';

type Act = LegalActListResponseItemsItem;

export const watchedActSortKeys = ['name', 'status', 'consolidated', 'verified', 'read'] as const;
export type WatchedActSortKey = (typeof watchedActSortKeys)[number];
export type WatchedActSort = DataTableSort & { sort: WatchedActSortKey };

export const defaultWatchedActSort: WatchedActSort = { sort: 'name', order: 'asc' };

// A date and a timestamp compare as text: the day sorts before any moment of that day.
export function lastReadOn(act: Act) {
  if (act.checkedByHandOn && (!act.lastCheckedAt || act.checkedByHandOn > act.lastCheckedAt)) {
    return act.checkedByHandOn;
  }
  return act.lastCheckedAt;
}

const collator = new Intl.Collator('ro', { numeric: true });

const sortValues: Record<WatchedActSortKey, (act: Act) => string | null> = {
  name: (act) => act.name,
  status: (act) => portalStatusLabel(act.portalStatus),
  consolidated: (act) => act.lastConsolidatedOn,
  verified: (act) => act.verifiedConsolidatedOn,
  read: lastReadOn,
};

export function sortActs(acts: readonly Act[], { sort, order }: WatchedActSort) {
  const value = sortValues[sort];
  const direction = order === 'asc' ? 1 : -1;
  return [...acts].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left === null || right === null) {
      if (left !== right) return left === null ? 1 : -1;
    } else {
      const compared = collator.compare(left, right);
      if (compared !== 0) return compared * direction;
    }
    return collator.compare(a.name, b.name);
  });
}
