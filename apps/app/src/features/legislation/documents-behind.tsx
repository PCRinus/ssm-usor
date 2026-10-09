import {
  type BuiltInDocumentTypeKey,
  type DocumentSet,
  documentSetOf,
  documentSets,
  documentTypeKeys,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { Link, useRouteContext } from '@tanstack/react-router';
import { FileCheck2, FileText, FireExtinguisher, RefreshCw } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import {
  type ApiErrorResponse,
  type DocumentsBehindResponseItemsItem,
  getListClientDocumentsQueryKey,
  getListDocumentsBehindQueryKey,
  type RegenerationJobResponseJob,
  useListDocumentsBehind,
  useStartDocumentRegeneration,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { EmptyState } from '@/components/empty-state';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import { documentRowLink, documentSetCopy } from '@/features/documents/document-sets';

import { countOf, kindLabels } from './legislation-labels';
import { RegenerationJob } from './regeneration-job';

type BehindType = DocumentsBehindResponseItemsItem;
type TrackedJob = { jobId: string; title: string; finished: boolean };
type Row =
  | { typeKey: string; type: BehindType; tracked: TrackedJob | undefined }
  | { typeKey: string; type: null; tracked: TrackedJob };

const packOrder = new Map<string, number>(
  documentTypeKeys.map((typeKey, index) => [typeKey, index])
);
const inPackOrder = (a: Row, b: Row) =>
  (packOrder.get(a.typeKey) ?? Infinity) - (packOrder.get(b.typeKey) ?? Infinity);

const setIcons = { occupational_safety: FileText, fire_safety: FireExtinguisher } as const;

export function DocumentsBehind({ userId }: { userId: string }) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const behind = useListDocumentsBehind({
    request: apiRequest,
    query: { queryKey: [...getListDocumentsBehindQueryKey(), userId] },
  });
  const start = useStartDocumentRegeneration({ request: apiRequest });
  // Kept by type after the job ends, so its result stays when nobody is behind on it any more.
  const [jobs, setJobs] = useState<Record<string, TrackedJob>>({});
  const [failures, setFailures] = useState<Record<string, string | undefined>>({});
  const [confirming, setConfirming] = useState<BehindType | null>(null);

  const refreshBehind = () =>
    queryClient.invalidateQueries({ queryKey: getListDocumentsBehindQueryKey() });

  async function regenerate(type: BehindType) {
    setFailures((current) => ({ ...current, [type.typeKey]: undefined }));
    try {
      const { job } = await start.mutateAsync({
        data: { typeKey: type.typeKey as BuiltInDocumentTypeKey },
      });
      setJobs((current) => ({
        ...current,
        [type.typeKey]: { jobId: job.id, title: type.title, finished: false },
      }));
    } catch (cause) {
      const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
      const answered =
        cause instanceof ApiHttpError && (cause.status === 409 || cause.status === 503);
      setFailures((current) => ({
        ...current,
        [type.typeKey]:
          answered && body?.message
            ? body.message
            : 'Regenerarea nu a putut porni. Verifică conexiunea și încearcă din nou.',
      }));
    }
    setConfirming(null);
    await refreshBehind();
  }

  function finished(typeKey: string, title: string, job: RegenerationJobResponseJob) {
    setJobs((current) => ({ ...current, [typeKey]: { jobId: job.id, title, finished: true } }));
    void refreshBehind();
    for (const item of job.items) {
      void queryClient.invalidateQueries({
        queryKey: getListClientDocumentsQueryKey(item.clientId),
      });
    }
  }

  const items = behind.data?.items ?? [];
  const listed = new Set(items.map((item) => item.typeKey));
  const rows: Row[] = [
    ...items.map((type) => ({ typeKey: type.typeKey, type, tracked: jobs[type.typeKey] })),
    ...Object.entries(jobs)
      .filter(([typeKey]) => !listed.has(typeKey))
      .map(([typeKey, tracked]) => ({ typeKey, type: null, tracked })),
  ].sort(inPackOrder);

  const groups = documentSets
    .map((set) => ({ set, rows: rows.filter((row) => documentSetOf(row.typeKey) === set) }))
    .filter((group) => group.rows.length > 0);

  function renderRow({ typeKey, type, tracked }: Row) {
    if (!type) {
      return (
        <SectionCard
          key={typeKey}
          data-testid="behind-type"
          headingLevel={3}
          title={<TypeTitle typeKey={typeKey} title={tracked.title} />}
          description="Niciun client nu mai are acest document în urmă."
        >
          <RegenerationJob
            key={tracked.jobId}
            jobId={tracked.jobId}
            userId={userId}
            onFinished={(job) => finished(typeKey, tracked.title, job)}
          />
        </SectionCard>
      );
    }
    const jobId = type.runningJobId ?? tracked?.jobId ?? null;
    const running = jobId !== null && !(tracked?.jobId === jobId && tracked.finished);
    return (
      <BehindTypeCard
        key={type.typeKey}
        type={type}
        action={
          running ? null : (
            <Button
              data-testid="behind-regenerate"
              disabled={start.isPending}
              onClick={() => setConfirming(type)}
            >
              <RefreshCw aria-hidden="true" />
              Regenerează pentru toți clienții ({type.clients.length})
            </Button>
          )
        }
      >
        {failures[type.typeKey] && (
          <Notice variant="destructive" data-testid="behind-regenerate-error">
            {failures[type.typeKey]}
          </Notice>
        )}
        {jobId && (
          <RegenerationJob
            key={jobId}
            jobId={jobId}
            userId={userId}
            onFinished={(job) => finished(type.typeKey, type.title, job)}
          />
        )}
      </BehindTypeCard>
    );
  }

  return (
    <section aria-label="Documente de actualizat" className="grid gap-6">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Documentele generate dintr-o versiune mai veche a șablonului, de dinaintea unei modificări
        legislative sau a unei corecturi.
      </p>
      {behind.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : behind.isError ? (
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
          Nu am putut încărca documentele în urmă.
        </Notice>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border bg-card px-5 py-12" data-testid="documents-behind-empty">
          <EmptyState icon={FileCheck2}>
            Toate documentele sunt generate din cea mai nouă versiune a șablonului lor. Când un
            șablon se schimbă, clienții care trebuie regenerați apar aici.
          </EmptyState>
        </div>
      ) : (
        groups.map(({ set, rows: setRows }) => (
          <BehindSet key={set} set={set}>
            {setRows.map(renderRow)}
          </BehindSet>
        ))
      )}
      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => !open && !start.isPending && setConfirming(null)}
      >
        {confirming && (
          <DialogContent data-testid="behind-confirm-dialog" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Regenerezi documentul pentru toți clienții?</DialogTitle>
              <DialogDescription>{confirmationText(confirming)}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-2">
              <Button
                variant="ghost"
                disabled={start.isPending}
                onClick={() => setConfirming(null)}
              >
                Renunță
              </Button>
              <Button
                data-testid="behind-confirm"
                disabled={start.isPending}
                onClick={() => void regenerate(confirming)}
              >
                {start.isPending ? 'Se pornește…' : 'Regenerează'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}

function BehindSet({ set, children }: { set: DocumentSet; children: ReactNode }) {
  const Icon = setIcons[set];
  const headingId = `behind-set-${set}`;
  return (
    <section aria-labelledby={headingId} data-testid="behind-set" className="grid gap-4">
      <h2 id={headingId} className="flex items-center gap-2 text-lg font-semibold">
        <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        {documentSetCopy[set].tab}
      </h2>
      {children}
    </section>
  );
}

function TypeTitle({ typeKey, title }: { typeKey: string; title: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <Badge variant="secondary" data-testid="behind-type-set">
        {documentSetCopy[documentSetOf(typeKey)].name}
      </Badge>
      <span>{title}</span>
    </span>
  );
}

function confirmationText(type: BehindType) {
  const edited = type.clients.filter((client) => client.editedDraft).length;
  const regenerated = type.clients.length - edited;
  const skipped =
    edited > 0
      ? ` ${countOf(edited, 'ciornă editată manual este sărită', 'ciorne editate manual sunt sărite')}, ca să nu se piardă modificările.`
      : '';
  return `„${type.title}” se generează din nou din versiunea ${type.newestVersion.version} a șablonului pentru ${countOf(regenerated, 'client', 'clienți')}, cu datele lor de acum. O ciornă este înlocuită; un document emis primește o ciornă nouă și rămâne în vigoare până o emiți de pe pagina clientului.${skipped}`;
}

function BehindTypeCard({
  type,
  action,
  children,
}: {
  type: BehindType;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <SectionCard
      data-testid="behind-type"
      headingLevel={3}
      title={<TypeTitle typeKey={type.typeKey} title={type.title} />}
      action={action}
    >
      <div className="grid gap-1.5">
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{kindLabels[type.newestVersion.kind]}</Badge>
          Versiunea {type.newestVersion.version} a șablonului
        </p>
        <p
          data-testid="behind-note"
          className="max-w-prose border-l-2 border-primary/50 pl-3 text-sm leading-relaxed"
        >
          {type.newestVersion.note ?? 'Versiunea nu are o descriere a ce s-a schimbat.'}
        </p>
      </div>
      <div className="grid gap-2">
        <h4 className="text-sm font-medium">
          {countOf(type.clients.length, 'client în urmă', 'clienți în urmă')}
        </h4>
        <ul className="divide-y rounded-md border">
          {type.clients.map((client) => (
            <li
              key={client.documentId}
              data-testid="behind-client"
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
            >
              <Link
                {...documentRowLink(client.clientId, type.typeKey)}
                className="font-medium underline-offset-4 hover:underline"
              >
                {client.clientName}
              </Link>
              <span className="text-muted-foreground">pe versiunea {client.version}</span>
              {client.editedDraft && (
                <Badge variant="outline" data-testid="behind-client-edited">
                  ciornă editată manual – va fi sărită
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </div>
      {children}
    </SectionCard>
  );
}
