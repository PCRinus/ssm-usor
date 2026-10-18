import { useRouteContext } from '@tanstack/react-router';

import {
  getGetClientDocumentDetailsQueryKey,
  getListResponsiblePersonsQueryKey,
  getListRiskFactorSuggestionsQueryKey,
  useGetClientDocumentDetails,
  useListResponsiblePersons,
  useListRiskFactorSuggestions,
} from '@/api/generated/api';
import { type ComboboxItem, SearchCombobox } from '@/components/search-combobox';
import { useAuth } from '@/features/auth/auth-context';
import { normalizeSearch } from '@/lib/normalize-search';

const suggestionParams = { field: 'responsiblePerson', query: '' } as const;

function nameFilter(value: string, search: string) {
  const query = normalizeSearch(search).trim();
  if (!query) return 1;
  return normalizeSearch(value).includes(query) ? 1 : 0;
}

// The plan prints a name, and the library and the documents keep one, so a choice writes the
// plain name; the people are only suggestions and anyone else is typed in.
export function ResponsiblePersonCombobox({
  id,
  clientId,
  value,
  onChange,
  onBlur,
  disabled,
  invalid,
  describedBy,
}: {
  id: string;
  /** Without one, as in a library profile, only what the organization typed before is offered. */
  clientId?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const ofClient = clientId ?? '';
  const details = useGetClientDocumentDetails(ofClient, {
    request: apiRequest,
    query: {
      queryKey: [...getGetClientDocumentDetailsQueryKey(ofClient), userId],
      enabled: Boolean(clientId),
    },
  });
  const persons = useListResponsiblePersons(ofClient, {
    request: apiRequest,
    query: {
      queryKey: [...getListResponsiblePersonsQueryKey(ofClient), userId],
      enabled: Boolean(clientId),
    },
  });
  const typed = useListRiskFactorSuggestions(suggestionParams, {
    request: apiRequest,
    query: { queryKey: getListRiskFactorSuggestionsQueryKey(suggestionParams), staleTime: 30_000 },
  });

  const representative = details.data?.documentDetails;
  const people = [...(persons.data?.items ?? [])].sort(
    (a, b) =>
      Number(b.roles.includes('workplace_manager')) - Number(a.roles.includes('workplace_manager'))
  );
  const candidates: ComboboxItem[] = [
    ...(representative?.legalRepresentativeName?.trim()
      ? [
          {
            value: representative.legalRepresentativeName.trim(),
            label: representative.legalRepresentativeName.trim(),
            description: representative.legalRepresentativeRole?.trim() || 'Administrator',
          },
        ]
      : []),
    ...people.map((person) => ({
      value: person.fullName.trim(),
      label: person.fullName.trim(),
      description: person.jobTitle,
    })),
    ...(typed.data?.items ?? []).map((name) => ({
      value: name,
      label: name,
      description: 'Folosit anterior',
    })),
  ];
  const seen = new Set<string>();
  const items = candidates.filter((item) => {
    const key = normalizeSearch(item.value).trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <SearchCombobox
      id={id}
      testId="risk-factor-responsible"
      items={items.map((item) => ({ ...item, search: item.value }))}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      filter={nameFilter}
      placeholder="Alege sau scrie un nume"
      searchPlaceholder="Numele persoanei"
      emptyMessage="Scrie numele persoanei care răspunde."
      clearLabel="Golește câmpul"
      unknownValue={(search) => search.trim() || null}
      disabled={disabled}
      invalid={invalid}
      describedBy={describedBy}
    />
  );
}
