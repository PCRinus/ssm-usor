import { useQuery } from '@tanstack/react-query';

import { SearchCombobox } from '../components/search-combobox';
import { localityFilter } from './locality-filter';
import { type Locality, localityItems } from './locality-items';

const loaders = import.meta.glob<Locality[]>('./data/*.json', { import: 'default' });

export function LocalityCombobox({
  countyCode,
  ...props
}: {
  id: string;
  testId: string;
  countyCode: string;
  value: string;
  onChange: (locality: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const load = loaders[`./data/${countyCode}.json`];
  const localities = useQuery({
    queryKey: ['localities', countyCode],
    queryFn: async () => localityItems(await load!()),
    enabled: Boolean(load),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  return (
    <SearchCombobox
      {...props}
      items={localities.data ?? []}
      filter={localityFilter}
      placeholder={
        !load ? 'Alege întâi județul' : localities.isPending ? 'Se încarcă…' : 'Alege localitatea'
      }
      searchPlaceholder="Numele localității"
      emptyMessage="Nicio localitate cu acest nume."
      clearLabel="Șterge localitatea aleasă"
      // The register does not know every way an address names a place ("București"), and a
      // value saved before this list existed has to stay selectable.
      unknownValue={(search) => {
        const typed = search.trim();
        const listed = localities.data?.some(
          (item) => item.value.toLocaleLowerCase('ro') === typed.toLocaleLowerCase('ro')
        );
        return typed.length >= 2 && !listed ? typed : null;
      }}
      disabled={props.disabled || (!load && !props.value)}
    />
  );
}
