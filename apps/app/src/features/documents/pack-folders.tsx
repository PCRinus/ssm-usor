import type { DocumentSet } from '@ssm-usor/contracts';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { ChevronRight, FileText, Folder } from 'lucide-react';

import { folderContentsLabel, foldersLabel, sectionLink } from './pack-labels';
import { PackBar, SectionCaption } from './pack-progress';
import type { Pack } from './pack-status';

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
      data-testid="section-number"
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

// One link restyled from a row on phones to a tile from sm up, not a list and a grid side by side,
// which would name every section twice to a screen reader.
const folderLink = cn(
  'relative grid flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
  'max-sm:min-h-17 max-sm:border-t max-sm:px-4 max-sm:py-3.5 max-sm:hover:bg-muted/60 max-sm:focus-visible:ring-inset',
  'sm:min-h-37.5 sm:grid-cols-[auto_minmax(0,1fr)] sm:grid-rows-[auto_1fr_auto_auto] sm:items-start sm:gap-y-2 sm:rounded-xl sm:rounded-tl-none sm:border sm:bg-card sm:px-4 sm:pt-3.5 sm:pb-4 sm:hover:border-info-border',
  "sm:before:absolute sm:before:-top-[11px] sm:before:-left-px sm:before:h-[11px] sm:before:w-26 sm:before:rounded-t-lg sm:before:border sm:before:border-b-0 sm:before:bg-section-tab sm:before:content-['']"
);

export function PackFolders({
  set,
  clientId,
  pack,
}: {
  set: DocumentSet;
  clientId: string;
  pack: Pack;
}) {
  return (
    <div className="@container">
      <ol
        aria-label={foldersLabel}
        data-testid="pack-folders"
        className="grid sm:grid-cols-2 sm:gap-x-3 sm:gap-y-5.5 sm:px-6 sm:pt-3 sm:pb-6 @3xl:grid-cols-3 @5xl:grid-cols-4"
      >
        {pack.sections.map((section) => (
          <li key={section.id} className="flex flex-col">
            <Link
              {...sectionLink(set, clientId, section)}
              data-testid="pack-folder"
              data-section={section.id}
              className={folderLink}
            >
              <SectionNumber
                number={section.number}
                size="sm"
                className="row-span-3 bg-muted max-sm:size-8 max-sm:rounded-lg max-sm:text-sm sm:row-span-1"
              />
              <span className="col-start-2 row-start-1 grid min-w-0 gap-0.5">
                <span className="leading-snug font-medium sm:text-[0.9375rem] sm:leading-5 sm:font-semibold sm:tracking-[-0.01em]">
                  {section.title}
                </span>
                <span
                  data-testid="pack-folder-contents"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground max-sm:hidden"
                >
                  <Folder aria-hidden="true" className="size-3.5 shrink-0" />
                  {folderContentsLabel(section)}
                </span>
              </span>
              <PackBar
                counts={section.counts}
                size="mini"
                className="col-start-2 row-start-2 sm:col-span-2 sm:col-start-1 sm:row-start-3 sm:mt-1"
              />
              <SectionCaption
                section={section}
                className="col-start-2 row-start-3 sm:col-span-2 sm:col-start-1 sm:row-start-4"
              />
              <ChevronRight
                aria-hidden="true"
                className="col-start-3 row-span-3 row-start-1 size-4 text-muted-foreground sm:hidden"
              />
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
