import { cn } from '@ssm-usor/ui/lib/utils';
import { use } from 'react';

import type { FieldName, SheetPage } from './employee-review-model';
import { pageIndex } from './person-sections';
import { ShowPageContext, ViewedPhotoContext } from './show-page';

const chip =
  'relative inline-grid h-6 min-w-6 shrink-0 cursor-pointer place-items-center rounded-[7px] border bg-card px-1.5 text-xs font-semibold text-foreground tabular-nums outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/50 after:absolute after:-inset-2.5 after:content-[""] sm:after:-inset-1';

export function PhotoNumber({
  pages,
  pageId,
  about,
  choice,
  tabIndex,
}: {
  pages: SheetPage[];
  pageId: string;
  about: string;
  choice?: FieldName;
  tabIndex?: number;
}) {
  const show = use(ShowPageContext);
  const viewed = use(ViewedPhotoContext);
  const index = pages.findIndex((page) => page.id === pageId);
  if (index === -1) return null;
  return (
    <button
      type="button"
      tabIndex={tabIndex}
      onClick={() => show(pageId, choice)}
      aria-label={`Fotografia ${index + 1}, ${about}`}
      aria-current={viewed === pageId || undefined}
      data-testid="person-page-button"
      className={cn(chip, viewed === pageId && 'border-foreground ring-1 ring-foreground')}
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
  choice,
  tabIndex,
  className,
}: {
  pages: SheetPage[];
  pageIds: string[];
  about: string;
  shown?: number;
  choice?: FieldName;
  tabIndex?: number;
  className?: string;
}) {
  const show = use(ShowPageContext);
  const viewed = use(ViewedPhotoContext);
  const known = pageIds
    .filter((pageId) => pages.some((page) => page.id === pageId))
    .sort((a, b) => pageIndex(pages, a) - pageIndex(pages, b));
  if (known.length === 0) return null;
  const rest = known.slice(shown);
  const after = viewed === null ? -1 : rest.indexOf(viewed);
  const more = rest[after + 1] ?? rest[0];
  return (
    <span className={cn('flex items-center gap-1', className)}>
      {known.slice(0, shown).map((pageId) => (
        <PhotoNumber
          key={pageId}
          pages={pages}
          pageId={pageId}
          about={about}
          choice={choice}
          tabIndex={tabIndex}
        />
      ))}
      {rest.length > 0 && (
        <button
          type="button"
          tabIndex={tabIndex}
          onClick={() => more && show(more, choice)}
          aria-label={`${rest.length === 1 ? 'Încă o fotografie' : `Încă ${rest.length} fotografii`}, ${about}: ${rest.map((pageId) => pageIndex(pages, pageId) + 1).join(', ')}`}
          data-testid="person-page-more"
          className={cn(
            chip,
            viewed && rest.includes(viewed) && 'border-foreground ring-1 ring-foreground'
          )}
        >
          +{rest.length}
        </button>
      )}
    </span>
  );
}
