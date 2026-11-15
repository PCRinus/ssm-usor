import { z } from 'zod';

import type { ListFilterFacet, ListFilterValues } from './types';

// A value no option knows, from an old or edited link, drops alone, not the whole filter.
export function filterSearchSchema<const Value extends string>(values: readonly Value[]) {
  return searchListSchema((value): value is Value => (values as readonly string[]).includes(value));
}

// For options the list loads, such as a client's job positions: any id, checked by the API.
export function idFilterSearchSchema() {
  return searchListSchema((value): value is string => z.uuid().safeParse(value).success);
}

function searchListSchema<Value extends string>(known: (value: string) => value is Value) {
  return z
    .preprocess(
      // One chosen value is one key in the URL, which the parser reads as a plain value, and a
      // value that looks like a number arrives as one.
      (input) =>
        input === undefined || input === null
          ? undefined
          : (Array.isArray(input) ? input : [input]).map(String),
      z.array(z.string()).optional()
    )
    .catch(undefined)
    .transform((list) => {
      const kept = (list ?? []).filter(known);
      return kept.length > 0 ? kept : undefined;
    });
}

/**
 * What a list's filters read from its search params and write back. `keys` names every filter
 * the URL may hold, a facet the caller does not show included, so that clearing removes it too;
 * a facet not shown is never read, nor a value its options do not offer, so that no applied
 * filter goes unnamed while it narrows the list.
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
  const offered = Object.fromEntries(
    facets.map((facet) => {
      const selected = search[facet.key];
      return [
        facet.key,
        facet.loading
          ? selected
          : selected?.filter((value) => facet.options.some((option) => option.value === value)),
      ];
    })
  ) as ListFilterValues<Key>;
  const values = searchOf(offered) as ListFilterValues<Key>;
  return {
    values,
    applied: facets.some((facet) => (values[facet.key]?.length ?? 0) > 0),
    // For the URL and for the request alike: every key, undefined where nothing is chosen.
    searchOf,
  };
}
