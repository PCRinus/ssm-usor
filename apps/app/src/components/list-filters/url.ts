import { z } from 'zod';

import type { ListFilterFacet, ListFilterValues } from './types';

// A value no option knows, from an old or edited link, drops alone, not the whole filter.
export function filterSearchSchema<const Value extends string>(values: readonly Value[]) {
  return z
    .array(z.unknown())
    .optional()
    .catch(undefined)
    .transform((list) => {
      const kept = (list ?? []).filter((value): value is Value =>
        (values as readonly unknown[]).includes(value)
      );
      return kept.length > 0 ? kept : undefined;
    });
}

/**
 * What a list's filters read from its search params and write back. `keys` names every filter
 * the URL may hold, a facet the caller does not show included, so that clearing removes it too;
 * a facet not shown is never read.
 */
export function listFilterSearch<Key extends string>({
  keys,
  facets,
  search,
}: {
  keys: readonly Key[];
  facets: readonly ListFilterFacet<Key>[];
  search: Partial<Record<Key, readonly string[]>>;
}) {
  const shown = new Set<Key>(facets.map((facet) => facet.key));
  const searchOf = (values: ListFilterValues<Key>) =>
    Object.fromEntries(
      keys.map((key) => {
        const selected = values[key];
        return [key, shown.has(key) && selected?.length ? [...selected] : undefined];
      })
    ) as Record<Key, string[] | undefined>;
  const values = searchOf(search) as ListFilterValues<Key>;
  return {
    values,
    applied: facets.some((facet) => (values[facet.key]?.length ?? 0) > 0),
    // For the URL and for the request alike: every key, undefined where nothing is chosen.
    searchOf,
  };
}
