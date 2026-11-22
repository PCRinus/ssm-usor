import type { DocumentSet } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Link } from '@tanstack/react-router';
import { ArrowRight, ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import type { ReactNode } from 'react';

import { SectionNumber } from './pack-folders';
import { neighbourSections, sectionLabel, sectionLink } from './pack-labels';
import { PackBar, SectionCaption } from './pack-progress';
import type { Pack, PackSection } from './pack-status';

const stepButton = 'max-sm:size-11';

function StepLink({
  set,
  clientId,
  section,
  direction,
}: {
  set: DocumentSet;
  clientId: string;
  section: PackSection | undefined;
  direction: 'previous' | 'next';
}) {
  const Icon = direction === 'previous' ? ChevronLeft : ChevronRight;
  const label = direction === 'previous' ? 'Secțiunea anterioară' : 'Secțiunea următoare';
  if (!section) {
    return (
      <Button variant="secondary" size="icon-sm" className={stepButton} disabled aria-label={label}>
        <Icon aria-hidden="true" />
      </Button>
    );
  }
  return (
    <Button asChild variant="secondary" size="icon-sm" className={stepButton}>
      <Link
        {...sectionLink(set, clientId, section)}
        data-testid={`pack-step-${direction}`}
        aria-label={`${label}: ${sectionLabel(section)}`}
      >
        <Icon aria-hidden="true" />
      </Link>
    </Button>
  );
}

export function PackFolder({
  set,
  clientId,
  pack,
  section,
  notices,
  children,
}: {
  set: DocumentSet;
  clientId: string;
  pack: Pack;
  section: PackSection;
  notices?: ReactNode;
  children: ReactNode;
}) {
  const { position, previous, next } = neighbourSections(pack, section);
  const positionLabel = `Secțiunea ${position} din ${pack.sections.length}`;
  return (
    <section
      aria-labelledby={`pack-section-${section.id}`}
      data-testid="pack-section"
      className="flex min-w-0 flex-col"
    >
      <div className="grid gap-4 px-4 pt-3 pb-4 sm:px-6 sm:pt-5 sm:pb-5">
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" size="sm" className="max-sm:h-11">
            <Link {...sectionLink(set, clientId)} data-testid="pack-all-sections">
              <LayoutGrid aria-hidden="true" />
              Toate secțiunile
            </Link>
          </Button>
          <span
            data-testid="pack-section-position"
            className="mr-1 ml-auto text-[0.8125rem] text-section-tab-foreground tabular-nums max-sm:hidden"
          >
            {positionLabel}
          </span>
          <span className="flex gap-2 max-sm:ml-auto">
            <StepLink set={set} clientId={clientId} section={previous} direction="previous" />
            <StepLink set={set} clientId={clientId} section={next} direction="next" />
          </span>
        </div>
        <div className="flex items-start gap-3.5 sm:items-center">
          <SectionNumber
            number={section.number}
            size="lg"
            className="bg-primary text-primary-foreground"
          />
          <div className="grid min-w-0 flex-1 gap-1.5 sm:gap-0.5">
            <h2
              id={`pack-section-${section.id}`}
              data-testid="pack-section-title"
              className="text-lg leading-snug font-semibold tracking-tight text-balance"
            >
              {section.title}
            </h2>
            <PackBar counts={section.counts} size="mini" className="sm:hidden" />
            <span className="flex flex-wrap gap-x-2 text-[0.8125rem] text-muted-foreground">
              <SectionCaption section={section} className="text-[0.8125rem]" />
              <span className="sm:hidden">{positionLabel}</span>
            </span>
          </div>
        </div>
        {notices}
      </div>
      {children}
      {next && (
        <div className="flex justify-end border-t p-4 max-sm:bg-background/50 sm:px-6">
          <Button
            asChild
            variant="secondary"
            className="h-auto min-h-9 py-2 text-left whitespace-normal max-sm:min-h-11 max-sm:w-full max-sm:justify-between"
          >
            <Link {...sectionLink(set, clientId, next)} data-testid="pack-next-section">
              <span>Următoarea secțiune: {sectionLabel(next)}</span>
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}
    </section>
  );
}
