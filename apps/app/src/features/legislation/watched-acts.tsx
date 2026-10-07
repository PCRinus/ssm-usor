import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ssm-usor/ui/components/table';
import type { UseQueryResult } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';

import type { LegalActListResponse, LegalActListResponseItemsItem } from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { formatRoDate } from '@/lib/dates';

import { formatMoment, portalPage, portalStatusLabel } from './legislation-labels';

const columns = [
  { id: 'name', header: 'Act normativ', title: undefined },
  { id: 'status', header: 'Stare', title: undefined },
  {
    id: 'consolidated',
    header: 'Ultima formă consolidată',
    title: 'Cea mai nouă formă consolidată găsită pe Portalul Legislativ.',
  },
  {
    id: 'verified',
    header: 'Șabloane verificate pe forma din',
    title: 'Forma consolidată față de care au fost verificate șabloanele.',
  },
  { id: 'checked', header: 'Citit ultima dată', title: undefined },
] as const;

const dateOrDash = (value: string | null) => (value ? formatRoDate(value) : '—');

function lastRead(act: LegalActListResponseItemsItem) {
  if (act.checkedByHandOn && (!act.lastCheckedAt || act.checkedByHandOn > act.lastCheckedAt)) {
    return `${formatRoDate(act.checkedByHandOn)}, de mână`;
  }
  return act.lastCheckedAt ? formatMoment(act.lastCheckedAt) : '—';
}

export function WatchedActs({ acts }: { acts: UseQueryResult<LegalActListResponse> }) {
  const items = [...(acts.data?.items ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, 'ro', { numeric: true })
  );
  return (
    <section aria-labelledby="watched-acts-heading" className="grid gap-4">
      <div>
        <h2 id="watched-acts-heading" className="text-lg font-semibold">
          Acte urmărite
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Actele normative pe care le citează șabloanele, citite zilnic pe Portalul Legislativ.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        {acts.isError ? (
          <div className="p-5">
            <Notice
              variant="destructive"
              action={
                <Button
                  variant="outline"
                  disabled={acts.isFetching}
                  onClick={() => void acts.refetch()}
                >
                  Încearcă din nou
                </Button>
              }
            >
              Nu am putut încărca actele urmărite.
            </Notice>
          </div>
        ) : (
          <Table data-testid="watched-acts" aria-labelledby="watched-acts-heading">
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    key={column.id}
                    title={column.title}
                    className={column.id === 'name' ? 'pl-5' : undefined}
                  >
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {acts.isPending
                ? Array.from({ length: 3 }, (_, index) => (
                    <TableRow key={index} className="hover:bg-transparent">
                      {columns.map((column) => (
                        <TableCell key={column.id} className={column.id === 'name' ? 'pl-5' : ''}>
                          <Skeleton className="h-4 w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : items.map((act) => (
                    <TableRow key={act.id} data-testid="watched-act">
                      <TableCell className="pl-5 font-medium">
                        {act.portalId ? (
                          <a
                            href={portalPage(act.portalId)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
                          >
                            {act.name}
                            <ExternalLink
                              className="size-3.5 text-muted-foreground"
                              aria-label="(se deschide pe Portalul Legislativ)"
                            />
                          </a>
                        ) : (
                          act.name
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          data-testid="watched-act-status"
                          variant={
                            act.portalStatus === 'repealed'
                              ? 'destructive'
                              : act.portalStatus === 'in_force'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {portalStatusLabel(act.portalStatus)}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {dateOrDash(act.lastConsolidatedOn)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {dateOrDash(act.verifiedConsolidatedOn)}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {lastRead(act)}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}
