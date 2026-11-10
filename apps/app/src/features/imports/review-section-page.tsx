import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useState } from 'react';

import type { ImportDetail } from '@/api/generated/api';
import { Notice } from '@/components/notice';

import { ImportActionBar } from './import-action-bar';
import { endSentence } from './import-format';
import { ImportReviewIssues } from './import-review-issues';
import { type FieldContext, FieldsSection } from './review-fields';
import {
  EquipmentSection,
  FireMeansSection,
  JobPositionsSection,
  ResponsibleSection,
  WorkplacesSection,
} from './review-items';
import {
  type Blocker,
  type SectionId,
  sectionIds,
  sectionLabels,
  type SectionStatus,
  vatPayerInForce,
} from './review-model';
import { LinkButton, StatusTag } from './review-parts';
import {
  blockerLinks,
  fieldStates,
  reviewName,
  sectionReviewHints,
  sectionStatuses,
} from './review-summary';
import { SourceDialog, type SourceRequest } from './source-dialog';
import { SourcePrefetchContext, useSourcePrefetch } from './source-query';
import { keptPosts, withoutAbsentCategories } from './training-category';
import { useImportAttention } from './use-import-attention';
import { useExistingValues, useImportReview } from './use-import-review';

export function ReviewSectionPage({
  detail,
  section,
}: {
  detail: ImportDetail;
  section: SectionId;
}) {
  const proposal = detail.proposal!;
  const review = useImportReview(detail);
  const existing = useExistingValues(detail);
  const [source, setSource] = useState<SourceRequest | null>(null);
  const prefetchSource = useSourcePrefetch(detail.id);
  const reveal = useImportAttention(existing.ready, section);
  const registered = detail.registeredCompany;
  const states = fieldStates(
    proposal,
    review.changes,
    existing.valueAt,
    detail.intoExistingClient ? null : registered
  );
  const context: FieldContext = {
    proposal,
    changes: review.changes,
    review,
    states,
    vatPayer: vatPayerInForce(proposal, review.changes, registered),
    registered,
    existingClient: detail.intoExistingClient,
    existingPositions: existing.positions,
    importId: detail.id,
    openSource: (title, sources, otherCompanyName) =>
      setSource({ title, sources, otherCompanyName }),
    blockers: detail.blockers as Blocker[],
  };
  const statuses = sectionStatuses(
    proposal,
    review.changes,
    detail.blockers as Blocker[],
    withoutAbsentCategories(states, keptPosts(proposal, review.changes, existing.positions)),
    registered
  );
  const links = blockerLinks(proposal, review.changes, detail.blockers as Blocker[]).filter(
    (link) => link.section === section
  );
  const hints =
    statuses[section].kind === 'check' ? sectionReviewHints(section, proposal, review.changes) : [];
  const position = sectionIds.indexOf(section);
  const previous = sectionIds[position - 1];
  const next = sectionIds[position + 1];
  const name = reviewName(detail, proposal, review.changes);

  return (
    <SourcePrefetchContext value={prefetchSource}>
      <div data-testid="import-review-section" data-section={section} className="grid gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid max-w-3xl gap-1">
            <h1 className="text-3xl font-semibold tracking-tight">{sectionLabels[section]}</h1>
            <p className="text-sm text-muted-foreground">
              {detail.intoExistingClient
                ? `Completezi clientul existent ${endSentence(name)} Ce are deja în aplicație nu se schimbă fără alegerea ta.`
                : section === 'identity'
                  ? `${endSentence(name)} Valorile se preiau cum sunt, dacă nu le schimbi.`
                  : name}
            </p>
          </div>
          <div className="grid w-full gap-1 sm:w-60">
            <SectionSteps importId={detail.id} section={section} statuses={statuses} />
          </div>
        </div>
        {hints.length > 0 && (
          <Notice
            variant="info"
            title="De verificat în această secțiune"
            data-testid="import-section-advisories"
          >
            <ul className="grid gap-1">
              {hints.map((hint, index) => (
                <li key={`${hint.anchor}-${index}`}>
                  <LinkButton className="text-left underline" onClick={() => reveal([hint.anchor])}>
                    {hint.text}
                  </LinkButton>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Aceste verificări nu împiedică confirmarea importului.
            </p>
          </Notice>
        )}
        {section === 'training' && existing.positionsFailed ? (
          <Notice
            variant="destructive"
            data-testid="import-review-positions-error"
            action={
              <Button
                variant="outline"
                size="sm"
                disabled={existing.positionsRetrying}
                onClick={existing.retryPositions}
              >
                Încearcă din nou
              </Button>
            }
          >
            Nu am putut încărca posturile clientului, de care depind intervalele instruirii.
          </Notice>
        ) : (
          (section === 'identity' || section === 'training') && (
            <FieldsSection section={section} context={context} />
          )
        )}
        {section === 'fire-safety' && (
          <>
            <FieldsSection section={section} context={context} />
            <FireMeansSection context={context} />
          </>
        )}
        {section === 'workplaces' && <WorkplacesSection context={context} />}
        {section === 'job-positions' && <JobPositionsSection context={context} />}
        {section === 'responsible' && <ResponsibleSection context={context} />}
        {section === 'equipment' && <EquipmentSection context={context} />}
        <ImportActionBar
          label="Navigarea prin propunere"
          save={review}
          summary={
            links.length > 0 ? (
              <ImportReviewIssues
                links={links}
                onReveal={(matching) => reveal(matching.map((link) => link.anchor))}
              />
            ) : statuses[section].kind === 'done' ? (
              <StatusTag status={statuses[section]} />
            ) : null
          }
          note={next ? `Urmează: ${sectionLabels[next]}` : 'Ultima secțiune a propunerii'}
        >
          {previous && (
            <Button asChild variant="outline" size="icon">
              <Link
                to="/clienti/import/$importId/$section"
                params={{ importId: detail.id, section: previous }}
                aria-label={`Înapoi la ${sectionLabels[previous]}`}
                title={`Înapoi la ${sectionLabels[previous]}`}
              >
                <ArrowLeft aria-hidden="true" />
              </Link>
            </Button>
          )}
          {next && (
            <Button asChild variant="outline">
              <Link to="/clienti/import/$importId" params={{ importId: detail.id }}>
                Înapoi la propunere
              </Link>
            </Button>
          )}
          <Button asChild>
            {next ? (
              <Link
                to="/clienti/import/$importId/$section"
                params={{ importId: detail.id, section: next }}
                data-testid="import-next-section"
                aria-label={`Continuă: ${sectionLabels[next]}`}
              >
                Continuă
                <ArrowRight aria-hidden="true" />
              </Link>
            ) : (
              <Link
                to="/clienti/import/$importId"
                params={{ importId: detail.id }}
                data-testid="import-review-overview"
              >
                Revizuiește importul
                <ArrowRight aria-hidden="true" />
              </Link>
            )}
          </Button>
        </ImportActionBar>
        <SourceDialog importId={detail.id} request={source} onClose={() => setSource(null)} />
      </div>
    </SourcePrefetchContext>
  );
}

function SectionSteps({
  importId,
  section,
  statuses,
}: {
  importId: string;
  section: SectionId;
  statuses: Record<SectionId, SectionStatus>;
}) {
  const position = sectionIds.indexOf(section);
  const done = sectionIds.filter((id) => statuses[id].kind === 'done').length;
  return (
    <nav
      aria-label="Secțiunile propunerii"
      className="grid gap-1.5"
      data-testid="import-section-steps"
    >
      <p className="flex items-baseline justify-between gap-3 text-sm tabular-nums">
        <span className="font-medium" data-testid="import-section-position">
          Secțiunea {position + 1} din {sectionIds.length}
        </span>
        <span className="text-muted-foreground">{done} gata</span>
      </p>
      <ol className="flex gap-1">
        {sectionIds.map((id, index) => {
          const current = id === section;
          const finished = statuses[id].kind === 'done';
          return (
            <li key={id} className="flex-1">
              <Link
                to="/clienti/import/$importId/$section"
                params={{ importId, section: id }}
                aria-label={`${index + 1}. ${sectionLabels[id]}${finished ? ', gata' : ''}`}
                title={sectionLabels[id]}
                data-testid="import-section-step"
                data-state={current ? 'current' : finished ? 'done' : 'open'}
                className="group block rounded-sm py-1.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span
                  className={cn(
                    'block h-1.5 rounded-full transition-colors',
                    current
                      ? 'bg-primary'
                      : finished
                        ? 'bg-success-border group-hover:bg-primary/60'
                        : 'bg-border group-hover:bg-primary/40'
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
