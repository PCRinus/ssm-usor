import type { LucideIcon } from 'lucide-react';

export interface ListFilterOption {
  value: string;
  label: string;
  // What the applied filters and the phone sheet's summary say, when the label explains more.
  short?: string;
  // Offered only once chosen, as a link sets it: the facet's other options say the same.
  onlyWhenChosen?: boolean;
}

export interface ListFilterFacet<Key extends string = string> {
  key: Key;
  label: string;
  icon: LucideIcon;
  options: readonly ListFilterOption[];
  // Where the desktop panel puts it; the phone sheet lists every facet in the array's order.
  column: 'left' | 'right';
  // A long list, such as the counties: picked from a list with its own search box.
  search?: { placeholder: string; addLabel: string };
}

export type ListFilterValues<Key extends string = string> = Readonly<
  Partial<Record<Key, readonly string[]>>
>;

export function appliedFacets<Key extends string>(
  facets: readonly ListFilterFacet<Key>[],
  values: ListFilterValues<Key>
) {
  return facets.filter((facet) => (values[facet.key]?.length ?? 0) > 0);
}

export function withFacet<Key extends string>(
  values: ListFilterValues<Key>,
  key: Key,
  selected: readonly string[]
): ListFilterValues<Key> {
  return { ...values, [key]: selected.length > 0 ? selected : undefined };
}

export function toggled(selected: readonly string[] | undefined, value: string) {
  const current = selected ?? [];
  return current.includes(value) ? current.filter((each) => each !== value) : [...current, value];
}

export function selectedLabels<Key extends string>(
  facet: ListFilterFacet<Key>,
  values: ListFilterValues<Key>
) {
  const selected = values[facet.key] ?? [];
  return facet.options
    .filter((option) => selected.includes(option.value))
    .map((option) => option.short ?? option.label);
}

export const noFilters = <Key extends string>() => ({}) as ListFilterValues<Key>;
