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
  size: 'tile' | 'heading';
  className?: string;
}) {
  return (
    <span
      data-testid="section-number"
      className={cn(
        'flex shrink-0 items-center justify-center font-semibold tabular-nums',
        size === 'tile' &&
          'size-8 rounded-lg text-sm sm:size-7 sm:rounded-[7px] sm:text-[0.8125rem]',
        size === 'heading' && 'size-11 rounded-[10px] text-lg font-bold',
        className
      )}
    >
      {number ?? (
        <FileText aria-hidden="true" className={size === 'heading' ? 'size-5' : 'size-4'} />
      )}
    </span>
  );
}

// One link restyled from a row on phones to a tile from sm up, not a list and a grid side by side,
// which would name every section twice to a screen reader. The tab's fill layer also covers the
// body's top border under it so the outline runs on unbroken, and its corner radius is the
// outline's less its 1px inset, or the fill shows past the outline at the corner. Forced colours
// repaint both layers as background, which would cut the outline, so the tile is a plain box there.
const folderLink = cn(
  'relative grid flex-1 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 outline-none',
  'max-sm:min-h-17 max-sm:border-t max-sm:px-4 max-sm:py-3.5 max-sm:hover:bg-muted/60 max-sm:focus-visible:ring-[3px] max-sm:focus-visible:ring-ring/50 max-sm:focus-visible:ring-inset',
  'sm:min-h-37.5 sm:grid-cols-[auto_minmax(0,1fr)] sm:grid-rows-[auto_1fr_auto_auto] sm:items-start sm:gap-y-2 sm:rounded-xl sm:rounded-tl-none sm:border sm:border-folder-border sm:bg-folder sm:px-4 sm:pt-3.5 sm:pb-4 sm:hover:border-folder-border-hover',
  "sm:before:absolute sm:before:-top-3.5 sm:before:-left-px sm:before:h-3.5 sm:before:w-32 sm:before:rounded-tl-lg sm:before:bg-folder-border sm:before:[clip-path:polygon(0_0,104px_0,126.4px_100%,0_100%)] sm:before:content-[''] sm:hover:before:bg-folder-border-hover",
  "sm:after:absolute sm:after:-top-[13px] sm:after:left-0 sm:after:h-[15px] sm:after:w-[127px] sm:after:rounded-tl-[calc(var(--radius-lg)-1px)] sm:after:bg-folder sm:after:[clip-path:polygon(0_0,102.7px_0,126.7px_100%,0_100%)] sm:after:content-['']",
  // A box-shadow ring would miss the tab; a drop shadow follows the whole shape.
  'sm:[--halo:color-mix(in_srgb,var(--ring)_50%,var(--card))] sm:focus-visible:border-ring sm:focus-visible:before:bg-ring sm:focus-visible:[filter:drop-shadow(3px_0_0_var(--halo))_drop-shadow(-3px_0_0_var(--halo))_drop-shadow(0_3px_0_var(--halo))_drop-shadow(0_-3px_0_var(--halo))]',
  'sm:[&_[data-status=missing]]:bg-card',
  'forced-colors:before:hidden forced-colors:after:hidden sm:forced-colors:rounded-tl-xl',
  'forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-solid max-sm:forced-colors:focus-visible:-outline-offset-2'
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
        className="grid sm:grid-cols-2 sm:gap-x-3 sm:gap-y-5.5 sm:px-6 sm:pt-4 sm:pb-6 @3xl:grid-cols-3 @5xl:grid-cols-4"
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
                size="tile"
                className="row-span-3 bg-muted sm:row-span-1 sm:bg-card"
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
