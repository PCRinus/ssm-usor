import {
  keepPreviousData,
  type QueryKey,
  useQuery,
  type UseQueryOptions,
} from '@tanstack/react-query';

export function PendingCountLabel<Data extends { total: number }, Error>({
  query,
  noun,
  count = (data) => data.total,
}: {
  query: UseQueryOptions<Data, Error, Data, QueryKey>;
  noun: (count: number) => string;
  count?: (data: Data) => number;
}) {
  const data = useQuery({ ...query, placeholderData: keepPreviousData }).data;
  return data === undefined ? 'Arată rezultatele' : `Arată ${noun(count(data))}`;
}
