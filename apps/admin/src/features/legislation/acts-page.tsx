import {
  type AdminLegalAct,
  adminLegislationErrorReasons,
  type ApiErrorResponse,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ssm-usor/ui/components/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useRouteContext } from '@tanstack/react-router';
import { ArrowDown, ArrowUp, ChevronsUpDown, ExternalLink } from 'lucide-react';
import { type FormEvent, useState } from 'react';

import { ApiHttpError, isRefusedByApi } from '@/api/http';
import { AdminShell, LoadFailure } from '@/components/admin-shell';
import { ErrorNotice } from '@/components/error-notice';
import { formatDateTime } from '@/lib/format';

import { sortActs } from './act-sort';
import {
  type ActSortKey,
  type ActsSearch,
  fetchActs,
  fetchChanges,
  legislationKey,
  recordVerifiedForm,
  refreshLegislation,
} from './api';
import { formatDay, portalPage, statusLabels } from './format';
import { LegislationHeader } from './legislation-header';

const columns: { key: ActSortKey; label: string }[] = [
  { key: 'name', label: 'Act' },
  { key: 'status', label: 'Status' },
  { key: 'seen', label: 'Last form seen' },
  { key: 'verified', label: 'Verified form' },
  { key: 'checked', label: 'Last checked' },
  { key: 'byHand', label: 'Checked by hand' },
];

function SortHeader({
  column,
  search,
}: {
  column: (typeof columns)[number];
  search: Required<ActsSearch>;
}) {
  const active = search.sort === column.key;
  const Icon = !active ? ChevronsUpDown : search.order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <TableHead aria-sort={active ? (search.order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <Link
        from="/legislation/acts"
        search={{
          sort: column.key === 'name' && active && search.order === 'desc' ? undefined : column.key,
          order: active && search.order === 'asc' ? 'desc' : undefined,
        }}
        data-testid={`sort-${column.key}`}
        className="hover:text-foreground -mx-1 inline-flex items-center gap-1 rounded px-1"
      >
        {column.label}
        <Icon aria-hidden="true" className="size-3.5 opacity-60" />
      </Link>
    </TableHead>
  );
}

function refusalOf(error: Error) {
  if (isRefusedByApi(error)) return 'This session may not change the legislation. Sign in again.';
  const body = error instanceof ApiHttpError ? (error.body as ApiErrorResponse | undefined) : null;
  if (body?.reason === adminLegislationErrorReasons.formNotSeen) {
    return 'The check has not seen a form of that date or later. Choose a date no later than the last form seen.';
  }
  if (body?.reason === adminLegislationErrorReasons.openChangesAtOrBefore) {
    return 'A change of this act at or before that date is still open. Resolve it first.';
  }
  if (body?.error === 'validation_error') return 'Choose a date.';
  return 'The form could not be recorded. Check the connection and try again.';
}

function VerifiedFormDialog({ act, onClose }: { act: AdminLegalAct | null; onClose: () => void }) {
  return (
    <Dialog open={act !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-testid="verified-form-dialog">
        {act && <VerifiedForm key={act.id} act={act} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function VerifiedForm({ act, onClose }: { act: AdminLegalAct; onClose: () => void }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const [date, setDate] = useState(act.lastConsolidatedOn ?? '');
  const saving = useMutation({
    mutationFn: () => recordVerifiedForm(act.id, date, apiRequest),
    onSuccess: () => {
      void refreshLegislation(queryClient);
      onClose();
    },
  });
  const openChanges = useQuery({
    queryKey: [...legislationKey, 'changes', { status: 'open' }],
    queryFn: ({ signal }) => fetchChanges({ status: 'open' }, { ...apiRequest, signal }),
    enabled: act.openChanges > 0,
    select: (data) => data.items.filter((change) => change.act.id === act.id),
  });
  const last = act.lastConsolidatedOn;
  const outOfRange = Boolean(date && last && date > last);
  const movesBack = Boolean(
    date && act.verifiedConsolidatedOn && date < act.verifiedConsolidatedOn
  );
  const blocking = date
    ? (openChanges.data ?? []).filter((change) => change.consolidatedOn <= date)
    : [];
  const unknown = act.openChanges > 0 && !openChanges.data;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (date && !outOfRange && blocking.length === 0 && !unknown) saving.mutate();
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Record the verified form</DialogTitle>
        <DialogDescription>
          The consolidated form of {act.name} the templates were checked against. The daily check
          compares the next form with it.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="mt-4 space-y-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Last form seen</dt>
          <dd>{formatDay(last)}</dd>
          <dt className="text-muted-foreground">Verified now</dt>
          <dd>{formatDay(act.verifiedConsolidatedOn)}</dd>
        </dl>
        {last ? (
          <div className="space-y-1.5">
            <Label htmlFor="verified-form-date">Verified form of</Label>
            <Input
              id="verified-form-date"
              data-testid="verified-form-date"
              type="date"
              value={date}
              max={last}
              required
              aria-invalid={outOfRange ? true : undefined}
              aria-describedby="verified-form-help"
              onChange={(event) => setDate(event.target.value)}
            />
            <p
              id="verified-form-help"
              className={outOfRange ? 'text-destructive text-sm' : 'text-muted-foreground text-sm'}
            >
              {outOfRange
                ? `No later than ${formatDay(last)}, the last form the check has seen.`
                : 'A form the portal lists for this act, no later than the last one seen.'}
            </p>
            {movesBack && !outOfRange && (
              <p data-testid="verified-form-moves-back" className="text-sm">
                This is before the form verified now, {formatDay(act.verifiedConsolidatedOn)}: use
                it to correct a wrong verified form. The next new form is compared with it.
              </p>
            )}
          </div>
        ) : (
          <ErrorNotice testId="verified-form-unseen">
            The check has not read a consolidated form of this act yet, so there is none to record.
          </ErrorNotice>
        )}
        {blocking.length > 0 && (
          <div data-testid="verified-form-open-changes" className="space-y-1 text-sm">
            <p>
              Resolve {blocking.length === 1 ? 'this open change' : 'these open changes'} of the act
              first: the daily check never looks again at a change at or before the verified form.
            </p>
            <ul className="list-disc pl-5">
              {blocking.map((change) => (
                <li key={change.id}>
                  <Link
                    to="/legislation/changes/$id"
                    params={{ id: change.id }}
                    className="underline underline-offset-4"
                  >
                    Form of {formatDay(change.consolidatedOn)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {openChanges.isError && (
          <ErrorNotice testId="verified-form-changes-error">
            The act’s open changes could not be read. Close this and try again.
          </ErrorNotice>
        )}
        {saving.error && (
          <ErrorNotice testId="verified-form-error">{refusalOf(saving.error)}</ErrorNotice>
        )}
      </DialogBody>
      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" disabled={saving.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          data-testid="verified-form-submit"
          disabled={
            saving.isPending || !last || !date || outOfRange || unknown || blocking.length > 0
          }
        >
          {saving.isPending ? 'Saving…' : 'Record'}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ActsPage({ search }: { search: ActsSearch }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const [recording, setRecording] = useState<AdminLegalAct | null>(null);
  const acts = useQuery({
    queryKey: [...legislationKey, 'acts'],
    queryFn: ({ signal }) => fetchActs({ ...apiRequest, signal }),
  });
  const sort = { sort: search.sort ?? 'name', order: search.order ?? 'asc' } as const;
  const items = acts.data ? sortActs(acts.data.items, sort.sort, sort.order) : [];

  return (
    <AdminShell testId="legislation-acts-page" wide>
      <LegislationHeader />
      {acts.isError ? (
        <LoadFailure error={acts.error} onRetry={() => void acts.refetch()} />
      ) : (
        <div className="bg-background overflow-hidden rounded-xl border">
          <Table data-testid="legal-acts-table" aria-label="Watched acts">
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <SortHeader key={column.key} column={column} search={sort} />
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {acts.isPending
                ? Array.from({ length: 4 }, (_, index) => (
                    <TableRow key={index} className="hover:bg-transparent">
                      {columns.map((column) => (
                        <TableCell key={column.key}>
                          <Skeleton className="h-4 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : items.map((act) => (
                    <TableRow key={act.id} data-testid="legal-act-row" className="align-top">
                      <TableCell>
                        {act.portalId ? (
                          <a
                            href={portalPage(act.portalId)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                          >
                            {act.name}
                            <ExternalLink aria-hidden="true" className="size-3.5" />
                          </a>
                        ) : (
                          <span className="font-medium">{act.name}</span>
                        )}
                        <div className="text-muted-foreground font-mono text-xs">{act.id}</div>
                        {act.openChanges > 0 && (
                          <Link
                            to="/legislation"
                            search={{ status: 'open' }}
                            className="mt-1 inline-block"
                          >
                            <Badge>
                              {act.openChanges} open change{act.openChanges === 1 ? '' : 's'}
                            </Badge>
                          </Link>
                        )}
                      </TableCell>
                      <TableCell>
                        {act.portalStatus ? (
                          <Badge
                            variant={act.portalStatus === 'repealed' ? 'destructive' : 'outline'}
                          >
                            {statusLabels[act.portalStatus]}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">
                            {act.portalId ? 'Not read yet' : 'No portal page'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatDay(act.lastConsolidatedOn)}
                        {act.lastAmendingAct && (
                          <div className="text-muted-foreground max-w-48 text-xs whitespace-normal">
                            {act.lastAmendingAct}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={
                              act.verifiedConsolidatedOn &&
                              act.lastConsolidatedOn &&
                              act.verifiedConsolidatedOn < act.lastConsolidatedOn
                                ? 'font-medium text-amber-700 dark:text-amber-400'
                                : undefined
                            }
                          >
                            {formatDay(act.verifiedConsolidatedOn)}
                          </span>
                          <Button
                            variant="outline"
                            size="xs"
                            data-testid="record-verified-form"
                            disabled={!act.lastConsolidatedOn}
                            onClick={() => setRecording(act)}
                          >
                            Record
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatDateTime(act.lastCheckedAt)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatDay(act.checkedByHandOn)}
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      )}
      <VerifiedFormDialog act={recording} onClose={() => setRecording(null)} />
    </AdminShell>
  );
}
