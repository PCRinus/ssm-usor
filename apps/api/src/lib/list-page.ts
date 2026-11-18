import { pageRange, type SortOrder } from '@ssm-usor/contracts';

import { fromDatabaseError } from './db';

type DatabaseFailure = Parameters<typeof fromDatabaseError>[0];
type Counted = PromiseLike<{ count: number | null; error: DatabaseFailure | null }>;
type Listed<Row> = PromiseLike<{
  data: Row[] | null;
  count: number | null;
  error: DatabaseFailure | null;
}>;

export type SortColumn = {
  column: string;
  // Sorted the other way from the order asked for, or ascending whatever it is.
  reversed?: boolean;
  alwaysAscending?: boolean;
  nullsLast?: boolean;
};

type Orderable<Query> = {
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): Query;
};

export function orderedBy<Query extends Orderable<Query>>(
  query: Query,
  columns: readonly SortColumn[],
  order: SortOrder
) {
  return columns.reduce(
    (each, { column, reversed, alwaysAscending, nullsLast }) =>
      each.order(column, {
        ascending: alwaysAscending || (reversed ? order === 'desc' : order === 'asc'),
        ...(nullsLast ? { nullsFirst: false } : {}),
      }),
    query
  );
}

// The terms are normalised by the list, as its search column holds them; they must keep
// PostgREST's filter syntax out.
export function matchingEveryTerm<Query extends { ilike(column: string, pattern: string): Query }>(
  query: Query,
  column: string,
  terms: readonly string[]
) {
  return terms.reduce((each, term) => each.ilike(column, `*${term}*`), query);
}

// `rows` asks for `count: 'exact'`. `unfiltered` is left out while nothing narrows the list,
// whose total is then its unfiltered total too.
export async function listPage<Row>({
  page,
  pageSize,
  rows,
  recount,
  unfiltered,
  what,
}: {
  page: number;
  pageSize: number;
  rows: (from: number, to: number) => Listed<Row>;
  recount: () => Counted;
  unfiltered?: () => Counted;
  what: string;
}) {
  const { from, to } = pageRange(page, pageSize);
  const [listed, all] = await Promise.all([rows(from, to), unfiltered?.()]);
  if (all?.error) throw fromDatabaseError(all.error, `count ${what}`);
  const unfilteredTotal = (total: number) => (all ? (all.count ?? 0) : total);
  // PostgREST refuses a range past the end, which a page left open while rows went reaches:
  // it comes back empty, with the real totals.
  if (listed.error?.code === 'PGRST103') {
    const counted = await recount();
    if (counted.error) throw fromDatabaseError(counted.error, `count ${what}`);
    const total = counted.count ?? 0;
    return { rows: [] as Row[], total, unfilteredTotal: unfilteredTotal(total) };
  }
  if (listed.error) throw fromDatabaseError(listed.error, `list ${what}`);
  const total = listed.count ?? 0;
  return { rows: listed.data ?? [], total, unfilteredTotal: unfilteredTotal(total) };
}
