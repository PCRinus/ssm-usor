import { cn } from '@ssm-usor/ui/lib/utils';
import { use } from 'react';

import type { SheetPage } from './employee-review-model';
import { pageIndex } from './person-sections';
import { ShowPageContext } from './show-page';

const chip =
  'relative inline-grid h-6 min-w-6 shrink-0 cursor-pointer place-items-center rounded-[7px] border bg-card px-1.5 text-xs font-semibold text-foreground tabular-nums outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50 after:absolute after:-inset-2.5 after:content-[""] sm:after:-inset-1';

export function PhotoNumber({
  pages,
  pageId,
  about,
  tabIndex,
}: {
  pages: SheetPage[];
  pageId: string;
  about: string;
  tabIndex?: number;
}) {
  const show = use(ShowPageContext);
  const index = pages.findIndex((page) => page.id === pageId);
  if (index === -1) return null;
  return (
    <button
      type="button"
      tabIndex={tabIndex}
      onClick={() => show(pageId)}
      aria-label={`Fotografia ${index + 1}, ${about}`}
      data-testid="person-page-button"
      className={chip}
    >
      {index + 1}
    </button>
  );
}

export function PhotoNumbers({
  pages,
  pageIds,
  about,
  shown = 2,
  tabIndex,
  className,
}: {
  pages: SheetPage[];
  pageIds: string[];
  about: string;
  shown?: number;
  tabIndex?: number;
  className?: string;
}) {
  const show = use(ShowPageContext);
  const known = pageIds
    .filter((pageId) => pages.some((page) => page.id === pageId))
    .sort((a, b) => pageIndex(pages, a) - pageIndex(pages, b));
  if (known.length === 0) return null;
  const rest = known.slice(shown);
  return (
    <span className={cn('flex items-center gap-1', className)}>
      {known.slice(0, shown).map((pageId) => (
        <PhotoNumber key={pageId} pages={pages} pageId={pageId} about={about} tabIndex={tabIndex} />
      ))}
      {rest.length > 0 && (
        <button
          type="button"
          tabIndex={tabIndex}
          onClick={() => show(rest[0]!)}
          aria-label={`${rest.length === 1 ? 'Încă o fotografie' : `Încă ${rest.length} fotografii`}, ${about}: ${rest.map((pageId) => pageIndex(pages, pageId) + 1).join(', ')}`}
          data-testid="person-page-more"
          className={chip}
        >
          +{rest.length}
        </button>
      )}
    </span>
  );
}
