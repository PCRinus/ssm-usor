import type { BuiltInDocumentTypeKey, DocumentSet } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Progress } from '@ssm-usor/ui/components/progress';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useRouteContext } from '@tanstack/react-router';
import { CircleCheck, FileCheck2, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  getGetDashboardSummaryQueryKey,
  getListDocumentsBehindQueryKey,
  useListDocumentsBehind,
} from '@/api/generated/api';
import { apiErrorReason } from '@/api/http';
import { openedHere } from '@/app/opener';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState, ListEmpty } from '@/components/empty-state';
import { HelpLink } from '@/components/help-link';
import { ListCardHeader } from '@/components/list-card-header';
import { Notice } from '@/components/notice';
import { DocumentMissingRows } from '@/features/documents/document-missing-rows';
import { documentsLink } from '@/features/documents/document-sets';

import { BehindClients } from './behind-clients';
import { behindColumns } from './behind-columns';
import { BehindTableContext, detailsIdOf, rowStateOf } from './behind-table-context';
import { countOf } from './legislation-labels';
import { RegenerateConfirmDialog } from './regenerate-confirm-dialog';
import {
  type BehindType,
  confirmAllCopy,
  type ConfirmCopy,
  confirmOneCopy,
  documentsSummary,
  jobCounts,
  progressLine,
  regenerable,
  regenerationFailure,
  setName,
  titleOf,
} from './regeneration-copy';
import {
  type FinishedRegeneration,
  type JobProgress,
  useRegenerations,
} from './regenerations-context';
import { behindSummaryQueryKey } from './use-behind-summary';

const rowKey = (type: BehindType) => type.typeKey;

type Confirming = { scope: 'all' } | { scope: 'one'; type: BehindType };

export function DocumentsBehind({ set, userId }: { set: DocumentSet; userId: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const behind = useListDocumentsBehind({
    request: apiRequest,
    query: { queryKey: [...getListDocumentsBehindQueryKey(), userId] },
  });
  const regenerations = useRegenerations();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState<Confirming | null>(null);
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const types = useMemo(
    () => (behind.data?.items ?? []).filter((type) => type.set === set),
    [behind.data, set]
  );
  const queryClient = useQueryClient();
  const progress = regenerations.progressOf(set);
  const mine = regenerations.running.filter((batch) => batch.set === set);
  const running = progress.some((job) => !job.ended) || mine.length > 0;
  const finished = running ? undefined : regenerations.finished[set];
  const notStarted = [...mine, ...(finished ? [finished] : [])].flatMap((batch) =>
    batch.notStarted.map((typeKey) => titleOf(typeKey, batch.titles))
  );

  const stateOf = (type: BehindType) =>
    rowStateOf(progress.find((job) => job.typeKey === type.typeKey));

  const table = {
    isOpen: (type: BehindType) => open.has(type.typeKey),
    onToggle: (type: BehindType) =>
      setOpen((current) => {
        const next = new Set(current);
        if (!next.delete(type.typeKey)) next.add(type.typeKey);
        return next;
      }),
    stateOf,
    onRegenerate: (type: BehindType) => {
      setFailure(null);
      setConfirming({ scope: 'one', type });
    },
    busy: starting,
  };

  async function regenerate(target: Confirming) {
    setStarting(true);
    setFailure(null);
    try {
      if (target.scope === 'all') await regenerations.startAll(set, types);
      else await regenerations.startOne(target.type);
    } catch (cause) {
      // A start that failed part way may still have jobs running; those are followed instead.
      const following = await regenerations.followRunning(set, types).catch(() => false);
      const alreadyRunning = apiErrorReason(cause) === 'regeneration_running';
      if (!following && !alreadyRunning) setFailure(regenerationFailure(cause));
    } finally {
      setConfirming(null);
      setStarting(false);
      void queryClient.invalidateQueries({ queryKey: getListDocumentsBehindQueryKey() });
      void queryClient.invalidateQueries({ queryKey: behindSummaryQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    }
  }

  const canRegenerateAll = types.some((type) => regenerable(type).length > 0);
  const copy: ConfirmCopy | null = !confirming
    ? null
    : confirming.scope === 'all'
      ? confirmAllCopy(set, types)
      : confirmOneCopy(confirming.type);

  if (behind.isPending) {
    return (
      <div className="p-5">
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (behind.isError) {
    return (
      <div className="p-5">
        <Notice
          variant="destructive"
          action={
            <Button
              variant="outline"
              disabled={behind.isFetching}
              onClick={() => void behind.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca documentele de actualizat.
        </Notice>
      </div>
    );
  }

  return (
    <section aria-label={`Documente ${setName[set]} de actualizat`} data-testid="documents-behind">
      {types.length > 0 && (
        <ListCardHeader className="min-h-16 max-sm:px-4">
          <div className="flex min-h-9 items-center gap-1.5">
            <span data-testid="behind-summary" className="text-sm tabular-nums">
              {documentsSummary(types)}
            </span>
            <HelpLink topic="legislatie.documente" label="Ajutor: documentele de actualizat" />
          </div>
          {!running && canRegenerateAll && (
            <Button
              data-testid="behind-regenerate-all"
              className="ml-auto max-sm:w-full"
              disabled={starting}
              onClick={() => {
                setFailure(null);
                setConfirming({ scope: 'all' });
              }}
            >
              <RefreshCw aria-hidden="true" />
              Regenerează toate
            </Button>
          )}
        </ListCardHeader>
      )}
      {failure && (
        <div className="border-b px-5 py-3 max-sm:px-4">
          <Notice variant="destructive" data-testid="behind-regenerate-error">
            {failure}
          </Notice>
        </div>
      )}
      {notStarted.length > 0 && (
        <p
          data-testid="behind-not-started"
          className="border-b px-5 py-3 text-sm text-warning-foreground max-sm:px-4"
        >
          Nu au pornit: {notStarted.join(', ')}. Regenerează-le din nou.
        </p>
      )}
      {regenerations.stalled && (
        <p
          data-testid="regeneration-stalled"
          className="border-b px-5 py-3 text-sm text-warning-foreground max-sm:px-4"
        >
          Nu am putut afla cum merge regenerarea. Pagina încearcă din nou.
        </p>
      )}
      {running && <RegenerationProgress jobs={progress} />}
      {finished && (
        <RegenerationResult
          result={finished}
          userId={userId}
          onDismiss={() => regenerations.dismiss(set)}
        />
      )}
      {types.length === 0 ? (
        <ListEmpty data-testid="documents-behind-empty">
          <EmptyState icon={FileCheck2} title={`Documentele ${setName[set]} sunt la zi`}>
            Toate sunt generate din cea mai nouă versiune a șablonului și din instrucțiunile de
            acum.
          </EmptyState>
        </ListEmpty>
      ) : (
        <BehindTableContext value={table}>
          <DataTable
            testId="behind-table"
            rowTestId="behind-type"
            label={`Documente ${setName[set]} de actualizat`}
            columns={behindColumns}
            data={types}
            rowKey={rowKey}
            status="success"
            empty={null}
            expansion={{
              isOpen: (type) => open.has(type.typeKey),
              onToggle: () => undefined,
              label: (type) => `Clienții cu ${type.title}`,
              render: (type) => <BehindClients type={type} />,
              inline: { detailsId: detailsIdOf },
            }}
          />
        </BehindTableContext>
      )}
      <RegenerateConfirmDialog
        copy={copy}
        starting={starting}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && void regenerate(confirming)}
      />
    </section>
  );
}

function RegenerationProgress({ jobs }: { jobs: JobProgress[] }) {
  const { total, handled } = jobCounts(jobs);
  return (
    <div
      data-testid="regeneration-progress"
      role="status"
      className="grid gap-3 border-b px-5 py-5 max-sm:px-4"
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        {total > 0
          ? `Se regenerează: ${handled} din ${countOf(total, 'document', 'documente')}`
          : 'Se regenerează…'}
      </p>
      <Progress
        value={total > 0 ? (handled / total) * 100 : 0}
        aria-label="Documente regenerate"
        aria-valuetext={`${handled} din ${total}`}
      />
      <p data-testid="regeneration-progress-counts" className="text-sm text-muted-foreground">
        {progressLine(jobs)}
      </p>
    </div>
  );
}

function RegenerationResult({
  result,
  userId,
  onDismiss,
}: {
  result: FinishedRegeneration;
  userId: string;
  onDismiss: () => void;
}) {
  const { total, done } = jobCounts(result.jobs);
  const drafts = new Map<string, { clientName: string; titles: string[] }>();
  for (const job of result.jobs) {
    for (const item of job.items) {
      if (item.status !== 'done') continue;
      const client = drafts.get(item.clientId) ?? { clientName: item.clientName, titles: [] };
      client.titles.push(titleOf(job.typeKey, result.titles));
      drafts.set(item.clientId, client);
    }
  }
  const leftOut = result.jobs.flatMap((job) =>
    job.items
      .filter((item) => item.status === 'skipped' || item.status === 'failed')
      .map((item) => ({ job, item }))
  );
  return (
    <div className="border-b p-4 max-sm:px-3">
      <section
        data-testid="regeneration-result"
        aria-labelledby="regeneration-result-title"
        className="rounded-xl border bg-card p-5 shadow-sm max-sm:p-4"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-success text-success-foreground">
            <CircleCheck className="size-4" aria-hidden="true" />
          </span>
          <div className="grid min-w-0 flex-1 gap-0.5">
            <h2
              id="regeneration-result-title"
              data-testid="regeneration-result-counts"
              className="text-base font-semibold"
            >
              Regenerarea s-a încheiat: {done} din {countOf(total, 'document', 'documente')}
            </h2>
            {done > 0 && (
              <p className="text-sm text-muted-foreground">
                Ciornele noi se emit de pe pagina fiecărui client.
              </p>
            )}
            {result.unread > 0 && (
              <p
                data-testid="regeneration-result-unread"
                className="text-sm text-warning-foreground"
              >
                {result.unread === 1
                  ? 'Nu am putut afla rezultatul unui document; dacă e încă în urmă, apare în listă.'
                  : `Nu am putut afla rezultatul pentru ${countOf(result.unread, 'document', 'documente')}; cele încă în urmă apar în listă.`}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Închide rezultatul"
            data-testid="regeneration-result-close"
            onClick={onDismiss}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        {(drafts.size > 0 || leftOut.length > 0) && (
          <ul className="mt-4 divide-y border-t">
            {[...drafts].map(([clientId, client]) => (
              <li
                key={clientId}
                data-testid="regeneration-drafts"
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,16rem)_1fr_auto] sm:gap-x-6"
              >
                <Link
                  {...documentsLink(result.set, clientId)}
                  state={openedHere}
                  className="w-fit text-sm underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
                >
                  {client.clientName}
                </Link>
                <p className="text-sm text-muted-foreground max-sm:order-last max-sm:col-span-2">
                  {client.titles.join(', ')}
                </p>
                <Button asChild variant="secondary" size="sm" className="w-fit max-sm:h-11">
                  <Link {...documentsLink(result.set, clientId)} state={openedHere}>
                    Deschide documentele
                  </Link>
                </Button>
              </li>
            ))}
            {leftOut.map(({ job, item }) => (
              <li
                key={`${job.id}-${item.clientId}`}
                data-testid={
                  item.missing.length > 0 ? 'regeneration-lacking' : 'regeneration-left-out'
                }
                aria-label={item.clientName}
                className="grid gap-x-6 gap-y-2 py-3 sm:grid-cols-[minmax(0,16rem)_1fr]"
              >
                <Link
                  {...documentsLink(result.set, item.clientId)}
                  state={openedHere}
                  data-testid="regeneration-lacking-client"
                  className="w-fit text-sm underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
                >
                  {item.clientName}
                </Link>
                <div className="grid gap-2 text-sm">
                  <p className="font-medium text-warning-foreground">
                    {titleOf(job.typeKey, result.titles)} nu s-a regenerat
                  </p>
                  {item.missing.length > 0 ? (
                    <DocumentMissingRows
                      clientId={item.clientId}
                      userId={userId}
                      typeKey={job.typeKey as BuiltInDocumentTypeKey}
                      missing={item.missing}
                      testId="regeneration-missing"
                    />
                  ) : (
                    item.detail && <p className="text-muted-foreground">{item.detail}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
