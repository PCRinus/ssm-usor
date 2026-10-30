import type { DocumentSet } from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';
import { createLink } from '@tanstack/react-router';
import { ChevronRight, FileText } from 'lucide-react';
import type { ComponentProps } from 'react';

import { contentsLabel, sectionLink } from './pack-labels';
import { PackBar, SectionCaption } from './pack-progress';
import type { Pack, PackSection } from './pack-status';

export function SectionNumber({
  number,
  size,
  className,
}: {
  number: string | null;
  size: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center font-semibold tabular-nums',
        size === 'sm' && 'size-7 rounded-[7px] text-[0.8125rem]',
        size === 'md' && 'size-8 rounded-lg text-sm',
        size === 'lg' && 'size-11 rounded-[10px] text-lg font-bold',
        className
      )}
    >
      {number ?? <FileText aria-hidden="true" className={size === 'lg' ? 'size-5' : 'size-4'} />}
    </span>
  );
}

// The router marks a link to the current URL as aria-current="page"; an entry is current when it
// is the section on show, which is the first one while the URL names none.
function ContentsAnchor({ current, ...props }: ComponentProps<'a'> & { current?: boolean }) {
  return <a {...props} aria-current={current ? 'true' : undefined} />;
}

const ContentsLink = createLink(ContentsAnchor);

export function PackContents({
  set,
  clientId,
  pack,
  selected,
  layout,
}: {
  set: DocumentSet;
  clientId: string;
  pack: Pack;
  selected?: PackSection;
  layout: 'pane' | 'list';
}) {
  return (
    <nav
      aria-label={contentsLabel}
      data-testid="pack-contents"
      className={cn(
        layout === 'pane' && 'grid content-start gap-0.5 border-r bg-background/50 p-3'
      )}
    >
      {pack.sections.map((section) => {
        const current = section.id === selected?.id;
        return layout === 'pane' ? (
          <ContentsLink
            key={section.id}
            {...sectionLink(set, clientId, section)}
            resetScroll={false}
            current={current}
            data-testid="pack-contents-entry"
            className={cn(
              'flex w-full items-start gap-3 rounded-lg border border-transparent p-2.5 text-left outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50',
              current && 'border-success-border bg-success hover:bg-success'
            )}
          >
            <SectionNumber
              number={section.number}
              size="sm"
              className={current ? 'bg-brand-lime' : 'bg-muted'}
            />
            <span className="grid min-w-0 flex-1 gap-1.5">
              <span className={cn('leading-snug', current ? 'font-semibold' : 'font-medium')}>
                {section.title}
              </span>
              <PackBar counts={section.counts} size="mini" />
              <SectionCaption section={section} />
            </span>
          </ContentsLink>
        ) : (
          <ContentsLink
            key={section.id}
            {...sectionLink(set, clientId, section)}
            data-testid="pack-contents-entry"
            className="flex min-h-17 items-center gap-3 border-t px-4 py-3.5 outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
          >
            <SectionNumber number={section.number} size="md" className="bg-muted" />
            <span className="grid min-w-0 flex-1 gap-1.5">
              <span className="leading-snug font-medium">{section.title}</span>
              <PackBar counts={section.counts} size="mini" />
              <SectionCaption section={section} />
            </span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          </ContentsLink>
        );
      })}
    </nav>
  );
}
