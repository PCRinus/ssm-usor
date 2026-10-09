import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { ExternalLink, ScrollText } from 'lucide-react';

import type { LegalActListResponseItemsItem } from '@/api/generated/api';
import { createDataTableColumns } from '@/components/data-table/columns';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/empty-state';
import { formatRoDate } from '@/lib/dates';

import { formatMoment, portalPage, portalStatusLabel } from './legislation-labels';
import { useLegalActs } from './use-legal-acts';
import { lastReadOn, sortActs, type WatchedActSort } from './watched-act-sort';

type Act = LegalActListResponseItemsItem;

const dateOrDash = (value: string | null) => (value ? formatRoDate(value) : '—');

function lastRead(act: Act) {
  const on = lastReadOn(act);
  if (on === null) return '—';
  return on === act.lastCheckedAt ? formatMoment(on) : `${formatRoDate(on)}, de mână`;
}

const helper = createDataTableColumns<Act>();

const dateColumn = { cellClassName: 'tabular-nums', skeletonClassName: 'w-20' };

const columns = helper.columns([
  helper.accessor('name', {
    id: 'name',
    header: 'Act normativ',
    meta: { headerClassName: 'pl-5', cellClassName: 'pl-5 font-medium', skeletonClassName: 'w-32' },
    cell: ({ row, getValue }) =>
      row.original.portalId ? (
        <a
          href={portalPage(row.original.portalId)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
        >
          {getValue()}
          <ExternalLink
            className="size-3.5 text-muted-foreground"
            aria-label="(se deschide pe Portalul Legislativ)"
          />
        </a>
      ) : (
        getValue()
      ),
  }),
  helper.accessor('portalStatus', {
    id: 'status',
    header: 'Stare',
    meta: { skeletonClassName: 'w-20' },
    cell: ({ getValue }) => {
      const status = getValue();
      return (
        <Badge
          data-testid="watched-act-status"
          variant={
            status === 'repealed' ? 'destructive' : status === 'in_force' ? 'secondary' : 'outline'
          }
        >
          {portalStatusLabel(status)}
        </Badge>
      );
    },
  }),
  helper.accessor('lastConsolidatedOn', {
    id: 'consolidated',
    header: () => (
      <span title="Cea mai nouă formă consolidată găsită pe Portalul Legislativ.">
        Ultima formă consolidată
      </span>
    ),
    meta: dateColumn,
    cell: ({ getValue }) => dateOrDash(getValue()),
  }),
  helper.accessor('verifiedConsolidatedOn', {
    id: 'verified',
    header: () => (
      <span title="Forma consolidată față de care au fost verificate șabloanele.">
        Șabloane verificate pe forma din
      </span>
    ),
    meta: dateColumn,
    cell: ({ getValue }) => dateOrDash(getValue()),
  }),
  helper.accessor(lastReadOn, {
    id: 'read',
    header: 'Citit ultima dată',
    meta: { cellClassName: 'text-muted-foreground tabular-nums', skeletonClassName: 'w-28' },
    cell: ({ row }) => lastRead(row.original),
  }),
]);

const rowKey = (act: Act) => act.id;

export function WatchedActs({
  userId,
  sort,
  onSortChange,
}: {
  userId: string;
  sort: WatchedActSort;
  onSortChange: (sort: WatchedActSort) => void;
}) {
  const acts = useLegalActs(userId);
  const items = acts.data ? sortActs(acts.data.items, sort) : undefined;
  const total = items?.length ?? 0;

  return (
    <section aria-label="Acte urmărite" className="grid gap-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Actele normative pe care le citează șabloanele, citite zilnic pe Portalul Legislativ.
      </p>
      <div className="overflow-hidden rounded-lg border bg-card">
        <DataTable
          testId="watched-acts"
          rowTestId="watched-act"
          label="Acte urmărite"
          columns={columns}
          data={items}
          rowKey={rowKey}
          meta={{ page: 1, pageSize: Math.max(total, 1), total }}
          noun={['act', 'acte']}
          status={acts.status}
          isFetching={acts.isFetching}
          sort={sort}
          onSortChange={(next) => onSortChange(next as WatchedActSort)}
          onPageChange={() => {}}
          error={
            <>
              <p role="alert" className="text-sm">
                Nu am putut încărca actele urmărite.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                disabled={acts.isFetching}
                onClick={() => void acts.refetch()}
              >
                Încearcă din nou
              </Button>
            </>
          }
          empty={
            <EmptyState icon={ScrollText}>
              Niciun act urmărit încă. Actele apar aici după prima verificare.
            </EmptyState>
          }
        />
      </div>
    </section>
  );
}
