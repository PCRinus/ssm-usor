import { maxPageSize } from '@ssm-usor/contracts';
import { useRouteContext } from '@tanstack/react-router';

import { getListClientsQueryKey, useListClients } from '@/api/generated/api';
import { type ComboboxItem, SearchCombobox } from '@/components/search-combobox';
import { normalizeSearch } from '@/lib/normalize-search';

function clientFilter(value: string, search: string) {
  const query = normalizeSearch(search).trim();
  if (!query) return 1;
  const name = normalizeSearch(value);
  if (name.startsWith(query)) return 1;
  return name.includes(query) ? 0.8 : 0;
}

const listParams = { page: 1, pageSize: maxPageSize, sort: 'legalName', order: 'asc' } as const;

// The first hundred active clients by name; an organization with more types the name into the
// search box, which matches the client too.
export function ClientFilter({
  userId,
  value,
  onChange,
}: {
  userId: string | undefined;
  value: string | undefined;
  onChange: (clientId: string | undefined) => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const clients = useListClients(listParams, {
    request: apiRequest,
    query: {
      queryKey: [...getListClientsQueryKey(listParams), userId],
      enabled: Boolean(userId && apiRequest.baseUrl),
    },
  });
  const items: ComboboxItem[] = (clients.data?.items ?? []).map((client) => ({
    value: client.id,
    label: client.legalName,
    search: client.legalName,
  }));

  return (
    <SearchCombobox
      id="organization-employees-client"
      testId="organization-employees-client-filter"
      items={items}
      value={value ?? ''}
      onChange={(clientId) => onChange(clientId || undefined)}
      filter={clientFilter}
      placeholder={clients.isPending ? 'Se încarcă clienții…' : 'Toți clienții'}
      searchPlaceholder="Numele clientului"
      emptyMessage="Niciun client cu acest nume."
      clearLabel="Toți clienții"
      disabled={clients.isPending}
    />
  );
}
