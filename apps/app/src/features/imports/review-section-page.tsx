import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useState } from 'react';

import type { ImportDetail } from '@/api/generated/api';
import { useScrollToHash } from '@/app/use-scroll-to-hash';

import { endSentence } from './import-format';
import { OtherSections } from './other-sections';
import { type FieldContext, FieldsSection } from './review-fields';
import { ConflictNotice } from './review-hub';
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
import { SavingNote } from './review-parts';
import { fieldStates, reviewName, sectionStatuses } from './review-summary';
import { SourceDialog, type SourceRequest } from './source-dialog';
import { SourcePrefetchContext, useSourcePrefetch } from './source-query';
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
  useScrollToHash(existing.ready);
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
    openSource: (title, sources, otherCompanyName) =>
      setSource({ title, sources, otherCompanyName }),
    blockers: detail.blockers as Blocker[],
  };
  const statuses = sectionStatuses(
    proposal,
    review.changes,
    detail.blockers as Blocker[],
    states,
    registered
  );
  const position = sectionIds.indexOf(section);
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
                : `${endSentence(name)} Valorile se preiau așa cum sunt, dacă nu le schimbi. Unde sunt casete de ales, intră în documente cea aleasă.`}
            </p>
          </div>
          <div className="grid w-full gap-1 sm:w-60">
            <SectionSteps importId={detail.id} section={section} statuses={statuses} />
            <SavingNote saving={review.saving} />
          </div>
        </div>
        <ConflictNotice review={review} />
        {(section === 'identity' || section === 'training') && (
          <FieldsSection section={section} context={context} />
        )}
        {section === 'identity' && (
          <OtherSections
            importId={detail.id}
            proposal={proposal}
            changes={review.changes}
            states={states}
            statuses={statuses}
          />
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
        <div className="flex flex-wrap justify-between gap-2">
          <Button asChild variant="outline">
            <Link to="/clienti/import/$importId" params={{ importId: detail.id }}>
              <ArrowLeft aria-hidden="true" />
              Înapoi la listă
            </Link>
          </Button>
          {next && (
            <Button asChild>
              <Link
                to="/clienti/import/$importId/$section"
                params={{ importId: detail.id, section: next }}
                data-testid="import-next-section"
              >
                Următoarea secțiune: {sectionLabels[next]}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>
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
