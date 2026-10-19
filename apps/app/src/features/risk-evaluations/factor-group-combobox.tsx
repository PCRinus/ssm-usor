import { type WorkSystemComponent, workSystemComponentGroups } from '@ssm-usor/contracts';
import { useRouteContext } from '@tanstack/react-router';

import {
  getListRiskFactorSuggestionsQueryKey,
  useListRiskFactorSuggestions,
} from '@/api/generated/api';
import { type ComboboxItem, SearchCombobox } from '@/components/search-combobox';
import { normalizeSearch } from '@/lib/normalize-search';

import { ownGroups } from './factor-groups';

const asItem = (group: string): ComboboxItem => ({ value: group, label: group, search: group });

const typedGroupsParams = { field: 'group', query: '' } as const;

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
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const typed = useListRiskFactorSuggestions(typedGroupsParams, {
    request: apiRequest,
    query: { queryKey: getListRiskFactorSuggestionsQueryKey(typedGroupsParams), staleTime: 30_000 },
  });
  const own = ownGroups(typed.data?.items ?? []);
  const groups: readonly string[] = workSystemComponentGroups[component];
  const known = [...groups, ...own].map(normalizeSearch);
  return (
    <SearchCombobox
      {...props}
      items={groups.map(asItem)}
      section={{ heading: 'Folosite de tine', items: own.map(asItem) }}
      filter={groupFilter}
      placeholder="Alege sau scrie grupa"
      searchPlaceholder="Caută sau scrie grupa"
      emptyMessage="Scrie grupa factorului."
      clearLabel="Șterge grupa aleasă"
      unknownValue={(search) => {
        const text = search.trim();
        if (!text) return null;
        return known.includes(normalizeSearch(text)) ? null : text;
      }}
    />
  );
}
