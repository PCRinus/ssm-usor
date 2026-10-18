import { type WorkSystemComponent, workSystemComponentGroups } from '@ssm-usor/contracts';

import { type ComboboxItem, SearchCombobox } from '@/components/search-combobox';
import { normalizeSearch } from '@/lib/normalize-search';

function groupFilter(value: string, search: string) {
  const query = normalizeSearch(search).trim();
  if (!query) return 1;
  return normalizeSearch(value).includes(query) ? 1 : 0;
}

export function FactorGroupCombobox({
  component,
  ...props
}: {
  id: string;
  testId: string;
  component: WorkSystemComponent;
  value: string;
  onChange: (group: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const groups: readonly string[] = workSystemComponentGroups[component];
  const items: ComboboxItem[] = groups.map((group) => ({
    value: group,
    label: group,
    search: group,
  }));
  return (
    <SearchCombobox
      {...props}
      items={items}
      filter={groupFilter}
      placeholder="Alege sau scrie grupa"
      searchPlaceholder="Caută sau scrie grupa"
      emptyMessage="Scrie grupa factorului."
      clearLabel="Șterge grupa aleasă"
      unknownValue={(search) => {
        const typed = search.trim();
        if (!typed) return null;
        const same = normalizeSearch(typed);
        return groups.some((group) => normalizeSearch(group) === same) ? null : typed;
      }}
    />
  );
}
