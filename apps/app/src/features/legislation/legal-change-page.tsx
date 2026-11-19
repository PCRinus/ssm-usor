import { countOf, documentSetOf } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { type ErrorComponentProps, Link } from '@tanstack/react-router';
import { ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react';
import { Fragment, type ReactNode, useState } from 'react';

import {
  getGetDashboardSummaryQueryKey,
  getGetLegalChangeQueryKey,
  getListDocumentsBehindQueryKey,
  type LegalChangeDetailResponseChange as Change,
  useGetLegalChange,
  useListDocumentsBehind,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { NotFound, RouteError } from '@/app/route-states';
import { TitleWithBack } from '@/components/back-link';
import { LoadFailed } from '@/components/load-failed';
import { Notice } from '@/components/notice';
import { formatRoDate } from '@/lib/dates';

import { LegalChangeBack } from './legal-change-back';
import { appliedSentence, behindText, reachOf, underReviewSentence } from './legal-change-copy';
import { AmendedUnits, ChangedPassages } from './legal-change-details';
import { LegalChangePending } from './legal-change-pending';
import { formatDayOf, portalPage } from './legislation-labels';
import { documentsTabOf } from './legislation-sections';
import { RegenerateConfirmDialog } from './regenerate-confirm-dialog';
import {
  type BehindType,
  confirmTypesCopy,
  regenerable,
  regenerationFailure,
} from './regeneration-copy';
import { useRegenerations } from './regenerations-context';
import { behindSummaryQueryKey, useBehindSummary } from './use-behind-summary';

const textLink =
  'font-medium underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground';

export function LegalChangePage({ changeId }: { changeId: string }) {
  const { request, key } = useApi();
  const query = useGetLegalChange(changeId, {
    request,
    query: { queryKey: key(getGetLegalChangeQueryKey(changeId)) },
  });
  const change = query.data?.change;
  if (change) return <ChangeView change={change} />;
  if (!query.isError) return <LegalChangePending />;
  if (query.error instanceof ApiHttpError && query.error.status === 404) {
    return <LegalChangeNotFound />;
  }
  return (
    <div className="grid gap-5">
      <div className="flex">
        <LegalChangeBack />
      </div>
      <LoadFailed
        error={query.error}
        testId="legal-change-load-error"
        busy={query.isFetching}
        onRetry={() => void query.refetch()}
      >
        Nu am putut încărca modificarea.
      </LoadFailed>
    </div>
  );
}

function stateOf(change: Change) {
  if (change.resolution === 'open') return 'În analiză';
  if (change.resolution === 'no_impact') return 'Fără impact asupra documentelor';
  return change.resolvedAt
    ? `Aplicată în documente pe ${formatDayOf(change.resolvedAt)}`
    : 'Aplicată în documente';
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-1.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ChangeView({ change }: { change: Change }) {
  return (
    <div data-testid="legal-change-page" className="grid gap-5">
      <TitleWithBack back={<LegalChangeBack />} className="mb-1 sm:gap-x-4">
        <h1 className="text-3xl font-semibold tracking-tight">{change.act.name}</h1>
        {change.act.subject && (
          <p data-testid="legal-change-subject" className="mt-1 text-sm text-muted-foreground">
            {change.act.subject}
          </p>
        )}
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
          <Fact label="Stare">
            <span
              data-testid="legal-change-state"
              className={cn(change.resolution === 'open' && 'font-medium text-warning-foreground')}
            >
              {stateOf(change)}
            </span>
          </Fact>
          <Fact label="Forma">
            <span className="tabular-nums">{formatRoDate(change.consolidatedOn)}</span>
          </Fact>
        </dl>
      </TitleWithBack>
      <Summary change={change} />
      <section
        aria-label="Detalii"
        className="grid gap-10 rounded-xl border bg-card p-8 shadow-sm max-sm:gap-8 max-sm:p-5"
      >
        {change.amendedUnits.length > 0 && (
          <Section title="Ce s-a schimbat în lege">
            <AmendedUnits units={change.amendedUnits} />
          </Section>
        )}
        {change.passages.length > 0 && (
          <Section title="În documente">
            <ChangedPassages passages={change.passages} />
          </Section>
        )}
        <Section title="Despre forma consolidată">
          <AboutForm change={change} />
        </Section>
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="grid gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Summary({ change }: { change: Change }) {
  const sentence =
    change.resolution === 'open'
      ? underReviewSentence(change.outcome, [...new Set(change.passages.map((p) => p.unit))])
      : change.resolution === 'no_impact'
        ? change.resolvedByNote
        : appliedSentence({
            note: change.resolvedByNote,
            updatedDocuments: change.updatedDocuments,
          });
  const touched = [
    ...new Map(
      change.passages.flatMap(({ document }) =>
        document ? [[document.typeKey, { ...document, set: documentSetOf(document.typeKey) }]] : []
      )
    ).values(),
  ];
  const reach = change.resolution === 'open' ? reachOf(touched, change.citedBy) : null;
  const behindKeys = new Set(change.behind.types.map((type) => type.typeKey));
  const behind = change.resolution === 'template_version' && change.behind.documents > 0;
  if (!sentence && !reach && change.updatedDocuments.length === 0 && !behind) return null;

  return (
    <section
      aria-label="Pe scurt"
      data-testid="legal-change-summary"
      className="grid gap-3.5 rounded-xl border bg-card px-8 py-7 shadow-sm max-sm:p-5"
    >
      {sentence && (
        <p
          data-testid="legal-change-sentence"
          className="max-w-[62ch] text-lg leading-relaxed font-medium"
        >
          {sentence}
        </p>
      )}
      {reach && (
        <p data-testid="legal-change-reach" className="text-sm">
          <span className="mr-1.5 text-muted-foreground">{reach.label}:</span>
          {reach.text}
        </p>
      )}
      {change.updatedDocuments.length > 0 && (
        <p data-testid="legal-change-updated" className="text-sm leading-relaxed">
          <span className="mr-1.5 text-muted-foreground">A actualizat:</span>
          {change.updatedDocuments.map((document, index) => (
            <Fragment key={document.typeKey}>
              {index > 0 && '; '}
              {behindKeys.has(document.typeKey) ? (
                <Link to={documentsTabOf(document.set)} className={textLink}>
                  {document.title}
                </Link>
              ) : (
                document.title
              )}
              , versiunea {document.version} a șablonului
            </Fragment>
          ))}
        </p>
      )}
      {behind && <Regenerate change={change} />}
    </section>
  );
}

function Regenerate({ change }: { change: Change }) {
  const { request, key } = useApi();
  const regenerations = useRegenerations();
  const summary = useBehindSummary();
  const behind = useListDocumentsBehind({
    request,
    query: { queryKey: key(getListDocumentsBehindQueryKey()) },
  });
  const [confirming, setConfirming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [notStarted, setNotStarted] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const keys = new Set(change.behind.types.map((type) => type.typeKey));
  const types: BehindType[] = (behind.data?.items ?? []).filter((type) => keys.has(type.typeKey));
  const startable = types.filter((type) => regenerable(type).length > 0);
  const running =
    types.some((type) => type.runningJobId !== null) ||
    (summary.data?.running ?? []).some((job) => keys.has(job.typeKey));

  async function regenerate() {
    setStarting(true);
    setFailure(null);
    setNotStarted([]);
    try {
      const refused = new Set(await regenerations.startTypes(startable));
      setNotStarted(startable.filter((type) => refused.has(type.typeKey)).map((t) => t.title));
    } catch (cause) {
      setFailure(regenerationFailure(cause));
    } finally {
      setConfirming(false);
      setStarting(false);
      void queryClient.invalidateQueries({ queryKey: getListDocumentsBehindQueryKey() });
      void queryClient.invalidateQueries({ queryKey: behindSummaryQueryKey() });
      void queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
    }
  }

  return (
    <div className="grid gap-3 border-t pt-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <p
          data-testid="legal-change-behind"
          className="text-sm font-medium text-warning-foreground"
        >
          {behindText(change.behind.documents)}, la{' '}
          {countOf(change.behind.clients, 'client', 'clienți')}
        </p>
        {running ? (
          <p
            data-testid="legal-change-regenerating"
            role="status"
            className="ml-auto flex items-center gap-2 text-sm font-medium max-sm:ml-0"
          >
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Se regenerează…
          </p>
        ) : (
          startable.length > 0 && (
            <Button
              data-testid="legal-change-regenerate"
              className="ml-auto max-sm:ml-0 max-sm:h-11 max-sm:w-full"
              disabled={starting}
              onClick={() => {
                setFailure(null);
                setConfirming(true);
              }}
            >
              <RefreshCw aria-hidden="true" />
              Regenerează documentele
            </Button>
          )
        )}
      </div>
      {notStarted.length > 0 && (
        <p data-testid="behind-not-started" className="text-sm text-warning-foreground">
          Nu au pornit: {notStarted.join(', ')}. Regenerează-le din nou.
        </p>
      )}
      {failure && (
        <Notice variant="destructive" data-testid="behind-regenerate-error">
          {failure}
        </Notice>
      )}
      <RegenerateConfirmDialog
        copy={confirming && startable.length > 0 ? confirmTypesCopy(startable) : null}
        starting={starting}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void regenerate()}
      />
    </div>
  );
}

function ExternalPortalLink({ portalId, children }: { portalId: number; children: ReactNode }) {
  return (
    <a
      href={portalPage(portalId)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-baseline gap-1 font-medium text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
    >
      {children}
      <ExternalLink className="size-3 shrink-0 self-center" aria-hidden="true" />
    </a>
  );
}

function AboutForm({ change }: { change: Change }) {
  const amendedBy =
    change.amendingActs.length > 0
      ? change.amendingActs.map((act) =>
          act.portalId ? (
            <ExternalPortalLink key={act.name} portalId={act.portalId}>
              {act.name}
            </ExternalPortalLink>
          ) : (
            act.name
          )
        )
      : change.amendingAct
        ? [change.amendingAct]
        : [];
  const closed =
    change.resolution === 'template_version' && change.resolvedAt
      ? ` Șablonul a fost actualizat pe ${formatDayOf(change.resolvedAt)}.`
      : change.resolution === 'no_impact' && change.resolvedAt
        ? ` Închisă fără impact asupra documentelor pe ${formatDayOf(change.resolvedAt)}.`
        : '';
  return (
    <div
      data-testid="legal-change-about"
      className="grid max-w-[80ch] gap-1 text-[13px] leading-relaxed text-muted-foreground"
    >
      <p>
        Forma din {formatRoDate(change.consolidatedOn)}
        {amendedBy.length > 0 && (
          <>
            , după <JoinedList items={amendedBy} />
          </>
        )}
        .
      </p>
      <p>
        Găsită de verificarea zilnică pe {formatDayOf(change.seenAt)}.{closed}
      </p>
      {change.act.portalId && (
        <p>
          <ExternalPortalLink portalId={change.act.portalId}>
            {change.act.name} pe Portalul Legislativ
          </ExternalPortalLink>
        </p>
      )}
    </div>
  );
}

function JoinedList({ items }: { items: ReactNode[] }) {
  return items.map((item, index) => (
    <Fragment key={index}>
      {index > 0 && (index === items.length - 1 ? ' și ' : ', ')}
      {item}
    </Fragment>
  ));
}

export function LegalChangeNotFound() {
  return (
    <NotFound
      testId="legal-change-not-found"
      title="Modificarea nu a fost găsită"
      description="Nu există nicio modificare legislativă cu acest identificator."
      action={
        <Button size="lg" asChild>
          <Link to="/legislatie/modificari">Înapoi la Modificări</Link>
        </Button>
      }
    />
  );
}

export function LegalChangeError({ error }: ErrorComponentProps) {
  return (
    <RouteError
      error={error}
      testId="legal-change-error"
      title="Modificarea nu a putut fi încărcată"
      back={<LegalChangeBack />}
    />
  );
}
