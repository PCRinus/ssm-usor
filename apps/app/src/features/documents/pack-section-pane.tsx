import type { DocumentSet } from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { SectionNumber } from './pack-contents';
import { contentsLabel, nextSection, sectionLabel, sectionLink } from './pack-labels';
import { PackBar, SectionCaption } from './pack-progress';
import type { Pack, PackSection } from './pack-status';

export function PackSectionPane({
  set,
  clientId,
  pack,
  section,
  layout,
  children,
}: {
  set: DocumentSet;
  clientId: string;
  pack: Pack;
  section: PackSection;
  layout: 'pane' | 'page';
  children: ReactNode;
}) {
  const next = nextSection(pack, section);
  const page = layout === 'page';
  return (
    <section
      aria-labelledby={`pack-section-${section.id}`}
      data-testid="pack-section"
      className={cn('flex min-w-0 flex-col', !page && 'px-7 pt-6 pb-2')}
    >
      {page && (
        <div className="px-2 pt-2">
          <Link
            {...sectionLink(set, clientId)}
            data-testid="pack-back"
            className="inline-flex h-11 items-center gap-1.5 rounded-lg pr-3 pl-2 font-medium outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            {contentsLabel}
          </Link>
        </div>
      )}
      <div
        className={cn(
          'flex gap-3.5',
          page ? 'items-start px-4 pt-2 pb-4' : 'items-center px-3 pb-4.5'
        )}
      >
        <SectionNumber
          number={section.number}
          size="lg"
          className="bg-primary text-primary-foreground"
        />
        <div className={cn('grid min-w-0 flex-1', page ? 'gap-1.5' : 'gap-0.5')}>
          <h3
            id={`pack-section-${section.id}`}
            data-testid="pack-section-title"
            className="text-lg leading-snug font-semibold tracking-tight text-balance"
          >
            {section.title}
          </h3>
          {page && <PackBar counts={section.counts} size="mini" />}
          <SectionCaption section={section} className="text-[0.8125rem]" />
        </div>
      </div>
      {children}
      {next && (
        <Link
          {...sectionLink(set, clientId, next)}
          data-testid="pack-next-section"
          className={cn(
            'flex items-center justify-between gap-4 text-left outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50',
            page
              ? 'border-t bg-background/50 p-4 focus-visible:ring-inset'
              : 'mt-2 rounded-lg px-3 py-4'
          )}
        >
          <span className="grid gap-0.5">
            <span className="text-xs text-muted-foreground">Secțiunea următoare</span>
            <span className="font-medium">{sectionLabel(next)}</span>
          </span>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
        </Link>
      )}
    </section>
  );
}
