import type {
  AdminLegalChangeDetail,
  AdminLegalChangePassage,
  AdminTemplateVersion,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useQuery } from '@tanstack/react-query';
import { Link, useRouteContext } from '@tanstack/react-router';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { ApiHttpError } from '@/api/http';
import { AdminShell, LoadFailure } from '@/components/admin-shell';
import { formatDateTime } from '@/lib/format';

import { fetchChange, legislationKey } from './api';
import { OutcomeBadge, ResolutionBadge } from './changes-page';
import {
  amendingActsOf,
  formatDay,
  operationLabels,
  passageStatusLabels,
  portalPage,
  versionKindLabels,
} from './format';
import { LinkVersionDialog, NoImpactDialog } from './resolve-dialogs';
import { WordDiff } from './word-diff-view';

function Section({
  title,
  description,
  children,
  testId,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section data-testid={testId} className="bg-background rounded-xl border p-4 sm:p-5">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{term}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  );
}

function PortalLink({ portalId, children }: { portalId: number | null; children: ReactNode }) {
  if (!portalId) return <>{children}</>;
  return (
    <a
      href={portalPage(portalId)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
    >
      {children}
      <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
    </a>
  );
}

function VersionLine({ version }: { version: AdminTemplateVersion }) {
  return (
    <div className="min-w-0 text-sm">
      <p className="font-medium break-words">
        {version.title} · version {version.version}
        <Badge variant="outline" className="ml-2 align-middle">
          {versionKindLabels[version.kind]}
        </Badge>
      </p>
      <p className="text-muted-foreground font-mono text-xs break-all">{version.typeKey}</p>
      <p className="text-muted-foreground text-xs">
        Registered {formatDateTime(version.createdAt)}
      </p>
      {version.note && <p className="mt-1 break-words">{version.note}</p>}
    </div>
  );
}

const blockedNotice =
  'rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200';

function Resolution({ change }: { change: AdminLegalChangeDetail }) {
  const [noImpact, setNoImpact] = useState(false);
  const [linking, setLinking] = useState<AdminTemplateVersion | null>(null);

  if (change.resolution !== 'open') {
    return (
      <Section title="Resolution" testId="change-resolution">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Fact term="Resolved">
            <ResolutionBadge resolution={change.resolution} />{' '}
            <span className="tabular-nums">{formatDateTime(change.resolvedAt)}</span>
          </Fact>
          {change.resolvingVersion && (
            <Fact term="Answered by">
              <VersionLine version={change.resolvingVersion} />
            </Fact>
          )}
        </dl>
        {change.resolvedByNote && (
          <div className="mt-4">
            <p className="text-muted-foreground text-xs">Note members read</p>
            <p
              data-testid="change-note"
              lang="ro"
              className="border-primary/50 mt-1 max-w-prose border-l-2 pl-3 text-sm leading-relaxed"
            >
              {change.resolvedByNote}
            </p>
          </div>
        )}
      </Section>
    );
  }

  const blocked = change.awaitingAssessment || change.olderOpenChanges.length > 0;

  return (
    <Section
      title="Resolve"
      testId="change-actions"
      description="Members see this change as “în verificare” until it is resolved."
    >
      <div className="space-y-4">
        {change.awaitingAssessment && (
          <p data-testid="change-awaiting-assessment" className={blockedNotice}>
            The daily check has not assessed this change yet. Resolve it once the check has compared
            it with the verified form and found its passages.
          </p>
        )}
        {change.olderOpenChanges.length > 0 && (
          <div data-testid="change-older-open" className={`space-y-1 ${blockedNotice}`}>
            <p>
              Resolve{' '}
              {change.olderOpenChanges.length === 1
                ? 'the older open change'
                : 'the older open changes'}{' '}
              of this act first: resolving this one moves the verified form to its form, and the
              daily check never looks again at a change at or before the verified form.
            </p>
            <ul className="list-disc pl-5">
              {change.olderOpenChanges.map((older) => (
                <li key={older.id}>
                  <Link
                    to="/legislation/changes/$id"
                    params={{ id: older.id }}
                    className="underline underline-offset-4"
                  >
                    Form of {formatDay(older.consolidatedOn)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            Nothing the templates cite changed in a way that matters: resolve it with a note.
          </p>
          <Button
            variant="outline"
            className="shrink-0"
            data-testid="mark-no-impact"
            disabled={blocked}
            onClick={() => setNoImpact(true)}
          >
            Mark as no impact
          </Button>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-sm">
            A template version registered after the change was seen answers it:
          </p>
          {change.candidateVersions.length === 0 ? (
            <p data-testid="no-candidates" className="text-muted-foreground mt-2 text-sm">
              No version of a template its passages name has been registered since{' '}
              {formatDateTime(change.seenAt)}.
            </p>
          ) : (
            <ul className="mt-2 divide-y">
              {change.candidateVersions.map((version) => (
                <li
                  key={version.id}
                  data-testid="candidate-version"
                  className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between"
                >
                  <VersionLine version={version} />
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={blocked}
                    onClick={() => setLinking(version)}
                  >
                    Resolve by this version
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <NoImpactDialog change={change} open={noImpact} onClose={() => setNoImpact(false)} />
      <LinkVersionDialog change={change} version={linking} onClose={() => setLinking(null)} />
    </Section>
  );
}

function PassageCard({ passage }: { passage: AdminLegalChangePassage }) {
  return (
    <article data-testid="change-passage" className="rounded-lg border p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{passage.unit}</h3>
        <Badge variant="outline">{passageStatusLabels[passage.status]}</Badge>
        <Badge variant="secondary">
          {passage.citationForm === 'quote' ? 'Quoted' : 'Referred to'}
        </Badge>
      </div>
      <dl className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-3">
        <Fact term="Template file">
          <span className="font-mono text-xs break-all">{passage.templateFile}</span>
        </Fact>
        <Fact term="Template">
          <span className="font-mono text-xs break-all">{passage.typeKey ?? '—'}</span>
        </Fact>
        <Fact term="Where in the template">
          {passage.locator ?? 'A reference, no quote'}
          <span className="text-muted-foreground block text-xs tabular-nums">
            paragraph {passage.paragraph}
          </span>
        </Fact>
      </dl>
      {passage.status === 'uncompared' ? (
        <p className="text-muted-foreground mt-3 text-sm">
          The check could not compare this unit’s text, which is empty or too long to compare. Read
          it on the portal.
        </p>
      ) : (
        <div className="bg-muted/40 mt-3 rounded-md p-3" lang="ro">
          <p className="text-muted-foreground mb-1 text-xs">The law’s text, old → new</p>
          <WordDiff before={passage.oldText} after={passage.newText} testId="passage-diff" />
        </div>
      )}
    </article>
  );
}

function DetailBody({ change }: { change: AdminLegalChangeDetail }) {
  const amendingActs = amendingActsOf(change);
  return (
    <div className="space-y-4">
      <div>
        <Link
          to="/legislation"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Changes
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 data-testid="change-title" className="text-2xl font-semibold tracking-tight">
            {change.act.name}
          </h1>
          <OutcomeBadge outcome={change.outcome} />
          <ResolutionBadge resolution={change.resolution} />
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Consolidated form of {formatDay(change.consolidatedOn)}
          {change.comparedWith
            ? `, compared with the verified form of ${formatDay(change.comparedWith)}`
            : ', with no verified form to compare'}
          .
        </p>
      </div>

      <Section title="Overview" testId="change-overview">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <Fact term="Act">
            <PortalLink portalId={change.act.portalId}>{change.act.name}</PortalLink>
            <span className="text-muted-foreground block font-mono text-xs">{change.act.id}</span>
          </Fact>
          <Fact term="Consolidated on">{formatDay(change.consolidatedOn)}</Fact>
          <Fact term="Compared with">{formatDay(change.comparedWith)}</Fact>
          <Fact term="Amended by">
            {amendingActs.length === 0
              ? '—'
              : amendingActs.map((act) => (
                  <span key={act.name} className="block">
                    <PortalLink portalId={act.portalId}>{act.name}</PortalLink>
                    {act.adoptedOn && (
                      <span className="text-muted-foreground text-xs">
                        {' '}
                        of {formatDay(act.adoptedOn)}
                      </span>
                    )}
                  </span>
                ))}
          </Fact>
          <Fact term="Seen">{formatDateTime(change.seenAt)}</Fact>
          <Fact term="Assessed">{formatDateTime(change.assessedAt)}</Fact>
        </dl>
      </Section>

      <Resolution change={change} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Amended units" testId="change-units">
          {change.amendedUnits.length === 0 ? (
            <p className="text-muted-foreground text-sm">The portal’s notes name none.</p>
          ) : (
            <ul className="divide-y text-sm">
              {change.amendedUnits.map((unit) => (
                <li
                  key={`${unit.unit}-${unit.operation}-${unit.date}`}
                  className="flex flex-wrap justify-between gap-x-4 py-1.5"
                >
                  <span className="font-medium">{unit.unit}</span>
                  <span className="text-muted-foreground">
                    {operationLabels[unit.operation]} {formatDay(unit.date)}
                    {unit.amendingAct && ` by ${unit.amendingAct}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="To review" testId="change-review">
          {change.review.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing the comparison could not read.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {change.review.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section
        title="Passages"
        testId="change-passages"
        description="The units the templates cite that this form changed, with the law’s text in the verified form and in this one."
      >
        {change.passages.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {change.outcome ? 'No cited unit changed.' : 'Not assessed yet.'}
          </p>
        ) : (
          <div className="space-y-3">
            {change.passages.map((passage) => (
              <PassageCard key={passage.id} passage={passage} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

export function ChangeDetailPage({ id }: { id: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const change = useQuery({
    queryKey: [...legislationKey, 'change', id],
    queryFn: ({ signal }) => fetchChange(id, { ...apiRequest, signal }),
  });

  return (
    <AdminShell testId="legal-change-page" wide>
      {change.isPending ? (
        <div role="status" aria-label="Loading" className="space-y-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : change.isError ? (
        change.error instanceof ApiHttpError && change.error.status === 404 ? (
          <div data-testid="change-not-found" className="space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight">No such change</h1>
            <Link to="/legislation" className="text-sm font-medium underline underline-offset-4">
              Back to the changes
            </Link>
          </div>
        ) : (
          <LoadFailure error={change.error} onRetry={() => void change.refetch()} />
        )
      ) : (
        <DetailBody change={change.data} />
      )}
    </AdminShell>
  );
}
