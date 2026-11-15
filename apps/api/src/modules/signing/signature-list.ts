import type { RouteHandler } from '@hono/zod-openapi';
import {
  pageRange,
  searchTerms,
  type SignatureListFilters,
  type SignatureListItem,
  type SignatureListSlot,
  type SignatureListSortKey,
  type SigningAgreementState,
  type SortOrder,
} from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { createDataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { collator } from '../../lib/romanian';
import type { listMySignaturesRoute } from './routes';

const listColumns =
  'id, kind, client_id, client_name, domain, phase, test, day, slots, issued_at, signature_count, workers';

type SignatureListView = Database['public']['Views']['signature_list']['Row'];

// The generated types make every column of a view nullable; these are never null by the view's
// own definition.
type RequiredListColumn =
  | 'id'
  | 'kind'
  | 'client_id'
  | 'client_name'
  | 'domain'
  | 'day'
  | 'slots'
  | 'issued_at'
  | 'signature_count'
  | 'workers';

type ListViewRow = {
  [Column in RequiredListColumn]: NonNullable<SignatureListView[Column]>;
} & Pick<SignatureListView, 'phase' | 'test'>;

type WorkerJson = {
  employeeId: string;
  lastName: string;
  firstName: string;
  agreement: {
    state: SigningAgreementState;
    employeeSignedAt: string | null;
    employerSignedAt: string | null;
  } | null;
  requests: { id: string; slot: SignatureListSlot }[];
};

const sortColumns: Record<SignatureListSortKey, string[]> = {
  issuedAt: ['issued_at'],
  day: ['day', 'issued_at'],
  client: ['client_name', 'issued_at'],
};

type ListQuery<Query> = {
  in(column: string, values: readonly string[]): Query;
  filter(column: string, operator: string, value: string): Query;
};

type OrderableQuery<Query> = {
  order(column: string, options: { ascending: boolean }): Query;
};

// The terms come lowercase and without diacritics, as the view holds the names, and hold only
// letters and digits, which keeps PostgREST's and the regular expression's syntax out of them.
// Every term must be in one worker's name. Only names are searched: the search sits in the
// address, which reaches the history and the analytics.
function matching<Query extends ListQuery<Query>>(
  query: Query,
  filters: SignatureListFilters,
  q: string | undefined
) {
  let filtered = query;
  if (filters.client) filtered = filtered.in('client_id', filters.client);
  if (filters.domain) filtered = filtered.in('domain', filters.domain);
  if (filters.kind) filtered = filtered.in('subject', filters.kind);
  const terms = searchTerms(q);
  if (terms.length > 0) {
    const sameName = terms.map((term) => `(?=[^|]*${term})`).join('');
    filtered = filtered.filter('search_names', 'match', `(^|\\|)${sameName}`);
  }
  return filtered;
}

function ordered<Query extends OrderableQuery<Query>>(
  query: Query,
  sort: SignatureListSortKey,
  order: SortOrder
) {
  const [first, ...ties] = sortColumns[sort];
  return [...ties, 'id'].reduce(
    (each, column) => each.order(column, { ascending: true }),
    query.order(first!, { ascending: order === 'asc' })
  );
}

const toIso = (value: string) => new Date(value).toISOString();
const toIsoOrNull = (value: string | null) => (value ? toIso(value) : null);

function toListItem(row: ListViewRow): SignatureListItem {
  const workers = (row.workers as WorkerJson[])
    .map((worker) => ({
      employee: { id: worker.employeeId, lastName: worker.lastName, firstName: worker.firstName },
      agreement: worker.agreement && {
        state: worker.agreement.state,
        employeeSignedAt: toIsoOrNull(worker.agreement.employeeSignedAt),
        employerSignedAt: toIsoOrNull(worker.agreement.employerSignedAt),
      },
      requests: worker.requests,
    }))
    .sort(
      (a, b) =>
        collator.compare(a.employee.lastName, b.employee.lastName) ||
        collator.compare(a.employee.firstName, b.employee.firstName)
    );
  return {
    id: row.id,
    kind: row.kind as SignatureListItem['kind'],
    client: { id: row.client_id, name: row.client_name },
    domain: row.domain,
    phase: row.phase,
    test: row.test,
    day: row.day,
    slots: row.slots as SignatureListSlot[],
    issuedAt: toIso(row.issued_at),
    signatures: row.signature_count,
    workers,
  };
}

// PostgREST caps a response at its max rows and has no aggregates here, so the rows and their
// signatures are counted from the rows themselves, a thousand at a time.
const countBatch = 1000;

export const listMySignatures: RouteHandler<typeof listMySignaturesRoute, ApiEnv> = async (c) => {
  const { page, pageSize, sort, order, q, ...filters } = c.req.valid('query');
  const db = createDataClient(c);
  // The member's own, in the membership's organization: the policies let a member read every
  // request of the organization, and a signer their own in any.
  const mine = (columns: string) =>
    db
      .from('signature_list')
      .select(columns)
      .eq('signer_account_id', c.get('user').id)
      .eq('organization_id', c.get('membership').organizationId);
  const filtered = (columns: string) => matching(mine(columns), filters, q);
  const countOf = async (rows: typeof mine) => {
    let total = 0;
    let signatures = 0;
    for (let from = 0; ; from += countBatch) {
      const { data, error } = await rows('signature_count')
        .order('id')
        .range(from, from + countBatch - 1)
        .returns<{ signature_count: number }[]>();
      if (error) throw fromDatabaseError(error, 'count my signatures');
      total += data.length;
      signatures += data.reduce((sum, row) => sum + row.signature_count, 0);
      if (data.length < countBatch) return { total, signatures };
    }
  };
  const narrowed =
    Boolean(filters.client || filters.domain || filters.kind) || searchTerms(q).length > 0;

  const { from, to } = pageRange(page, pageSize);
  const [listed, counts, everything] = await Promise.all([
    ordered(filtered(listColumns), sort, order).range(from, to).returns<ListViewRow[]>(),
    countOf(filtered),
    narrowed ? countOf(mine) : null,
  ]);
  if (listed.error) throw fromDatabaseError(listed.error, 'list my signatures');
  const unfiltered = everything ?? counts;
  return c.json(
    {
      items: listed.data.map(toListItem),
      page,
      pageSize,
      total: counts.total,
      unfilteredTotal: unfiltered.total,
      signatures: counts.signatures,
      unfilteredSignatures: unfiltered.signatures,
    },
    200
  );
};
