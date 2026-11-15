import type { LucideIcon } from 'lucide-react';

import { formatRoDate } from '@/lib/dates';

export interface ListFilterOption {
  value: string;
  label: string;
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
  // While the options load, the values the address names are kept rather than dropped.
  loading?: boolean;
  // A period instead of options: its values are the first and the last day, ISO, either one
  // empty when open-ended.
  period?: true;
}

export type ListFilterValues<Key extends string = string> = Readonly<
  Partial<Record<Key, readonly string[]>>
>;

export function appliedFacets<Key extends string>(
  facets: readonly ListFilterFacet<Key>[],
  values: ListFilterValues<Key>
) {
  return facets.filter((facet) => values[facet.key]?.some(Boolean) ?? false);
}

export function withFacet<Key extends string>(
  values: ListFilterValues<Key>,
  key: Key,
  selected: readonly string[]
): ListFilterValues<Key> {
  return { ...values, [key]: selected.some(Boolean) ? selected : undefined };
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
  if (facet.period) {
    const label = periodLabel(selected[0] ?? '', selected[1] ?? '');
    return label ? [label] : [];
  }
  return facet.options
    .filter((option) => selected.includes(option.value))
    .map((option) => option.short ?? option.label);
}

export const noFilters = <Key extends string>() => ({}) as ListFilterValues<Key>;

export function periodLabel(from: string, to: string) {
  if (from && to) return `${formatRoDate(from)} – ${formatRoDate(to)}`;
  if (from) return `din ${formatRoDate(from)}`;
  if (to) return `până la ${formatRoDate(to)}`;
  return '';
}
