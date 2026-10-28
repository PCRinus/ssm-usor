import { Button } from '@ssm-usor/ui/components/button';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useState } from 'react';

import type { ImportDetail } from '@/api/generated/api';
import { useScrollToHash } from '@/app/use-scroll-to-hash';

import { endSentence } from './import-format';
import { type FieldContext, FieldsSection } from './review-fields';
import { ConflictNotice } from './review-hub';
import {
  EquipmentSection,
  FireMeansSection,
  JobPositionsSection,
  ResponsibleSection,
  WorkplacesSection,
} from './review-items';
import { type Blocker, type SectionId, sectionIds, sectionLabels } from './review-model';
import { SavingNote } from './review-parts';
import { fieldStates, reviewName } from './review-summary';
import { SourceDialog, type SourceRequest } from './source-dialog';
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
  useScrollToHash(existing.ready);
  const states = fieldStates(proposal, review.changes, existing.valueAt);
  const registered = detail.registeredCompany;
  const context: FieldContext & { blockers: Blocker[] } = {
    proposal,
    changes: review.changes,
    review,
    states,
    vatPayer: registered?.vatPayer ?? false,
    registered,
    existingClient: detail.intoExistingClient,
    openSource: (title, sources, otherCompanyName) =>
      setSource({ title, sources, otherCompanyName }),
    blockers: detail.blockers as Blocker[],
  };
  const position = sectionIds.indexOf(section);
  const next = sectionIds[position + 1];
  const name = reviewName(detail, proposal, review.changes);

  return (
    <div data-testid="import-review-section" data-section={section} className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid max-w-3xl gap-1">
          <h1 className="text-3xl font-semibold tracking-tight">{sectionLabels[section]}</h1>
          <p className="text-sm text-muted-foreground">
            {detail.intoExistingClient
              ? `Completezi clientul existent ${endSentence(name)} Ce are deja în aplicație nu se schimbă fără alegerea ta.`
              : `${endSentence(name)} Valorile se preiau așa cum sunt, dacă nu le schimbi.`}
          </p>
        </div>
        <div className="grid justify-items-end gap-1">
          <span className="text-sm text-muted-foreground tabular-nums">
            Secțiunea {position + 1} din {sectionIds.length}
          </span>
          <SavingNote saving={review.saving} />
        </div>
      </div>
      <ConflictNotice review={review} />
      {(section === 'identity' || section === 'training') && (
        <FieldsSection section={section} context={context} />
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
          <Link to="/clients/import/$importId" params={{ importId: detail.id }}>
            <ArrowLeft aria-hidden="true" />
            Înapoi la listă
          </Link>
        </Button>
        {next && (
          <Button asChild>
            <Link
              to="/clients/import/$importId/$section"
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
  );
}
