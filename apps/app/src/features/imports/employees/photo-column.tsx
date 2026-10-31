import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Image as ImageIcon, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { use } from 'react';

import type { ImportDetail } from '@/api/generated/api';

import type { SheetPage } from './employee-review-model';
import { PageThumb } from './page-thumb';
import { pageFileName, pageKindLabel } from './review-format';
import { SheetPageView } from './sheet-page-view';
import { ShowPageContext } from './show-page';

export function PageButton({ pages, pageId }: { pages: SheetPage[]; pageId: string }) {
  const show = use(ShowPageContext);
  const index = pages.findIndex((page) => page.id === pageId);
  if (index === -1) return null;
  return (
    <button
      type="button"
      onClick={() => show(pageId)}
      aria-label={`Arată fotografia ${index + 1}`}
      data-testid="person-page-button"
      className="grid size-6 place-items-center rounded-md border bg-card text-xs font-semibold tabular-nums hover:bg-muted"
    >
      {index + 1}
    </button>
  );
}

export function PhotoColumn({
  detail,
  pages,
  current,
  open,
  name,
  onCurrent,
  onOpen,
}: {
  detail: ImportDetail;
  pages: SheetPage[];
  current: string | null;
  open: boolean;
  name: string;
  onCurrent: (pageId: string) => void;
  onOpen: (open: boolean) => void;
}) {
  const index = Math.max(
    0,
    pages.findIndex((page) => page.id === current)
  );
  const page = pages[index];
  if (!open) {
    return (
      <section
        aria-label="Fotografiile fișei"
        className="hidden lg:sticky lg:top-20 lg:block lg:self-start"
        data-testid="person-photos-collapsed"
      >
        <div className="grid justify-items-center gap-2 rounded-xl border bg-card p-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Arată fotografia"
            aria-expanded="false"
            onClick={() => onOpen(true)}
          >
            <PanelLeftOpen aria-hidden="true" />
          </Button>
          {pages.map((each, position) => (
            <button
              key={each.id}
              type="button"
              aria-label={`Arată fotografia ${position + 1}`}
              onClick={() => {
                onCurrent(each.id);
                onOpen(true);
              }}
            >
              <PageThumb detail={detail} page={each} className="h-10 w-8" />
            </button>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section
      id="person-photos"
      aria-label="Fotografiile fișei"
      className="hidden gap-3 lg:sticky lg:top-20 lg:grid lg:self-start"
      data-testid="person-photos"
    >
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>
          {page ? (
            <>
              <span className="font-medium tabular-nums">
                Fotografia {index + 1} din {pages.length}
              </span>{' '}
              <span className="text-muted-foreground">{pageKindLabel(page)}</span>
            </>
          ) : (
            'Fără fotografii'
          )}
        </span>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded="true"
          aria-controls="person-photos"
          onClick={() => onOpen(false)}
        >
          <PanelLeftClose aria-hidden="true" />
          Ascunde fotografia
        </Button>
      </div>
      {page ? (
        <SheetPageView
          key={page.id}
          importId={detail.id}
          page={page}
          className="h-[min(62svh,34rem)]"
        />
      ) : (
        <div className="grid h-48 place-items-center rounded-lg bg-muted/60">
          <ImageIcon className="size-6 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
      {pages.length > 0 && (
        <div className="grid gap-2">
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={`Fotografiile lui ${name}`}
          >
            {pages.map((each, position) => (
              <button
                key={each.id}
                type="button"
                aria-pressed={each.id === page?.id}
                onClick={() => onCurrent(each.id)}
                className={cn(
                  'grid justify-items-center gap-1 rounded-md p-1 text-[11.5px]',
                  each.id === page?.id ? 'bg-secondary font-medium' : 'text-muted-foreground'
                )}
              >
                <PageThumb detail={detail} page={each} className="h-14 w-11" />
                {position + 1}. {pageKindLabel(each).replace(/^Fișa /, '')}
              </button>
            ))}
          </div>
          {page && <span className="text-[13px] text-muted-foreground">{pageFileName(page)}</span>}
        </div>
      )}
    </section>
  );
}

export function PhotoThumbs({
  detail,
  pages,
  name,
  onShow,
}: {
  detail: ImportDetail;
  pages: SheetPage[];
  name: string;
  onShow: (pageId: string) => void;
}) {
  if (pages.length === 0) return null;
  return (
    <section
      aria-labelledby="person-thumbs"
      className="grid gap-2 rounded-xl border bg-card p-4 lg:hidden"
      data-testid="person-thumbs"
    >
      <h2 id="person-thumbs" className="font-semibold">
        Fotografiile fișei
      </h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label={`Fotografiile lui ${name}`}>
        {pages.map((page, position) => (
          <button
            key={page.id}
            type="button"
            aria-label={`Deschide fotografia ${position + 1}, ${pageKindLabel(page).toLowerCase()}`}
            onClick={() => onShow(page.id)}
            className="grid justify-items-center gap-1 text-[11.5px] text-muted-foreground"
          >
            <PageThumb detail={detail} page={page} className="h-16 w-12" />
            {position + 1}. {pageKindLabel(page).replace(/^Fișa /, '')}
          </button>
        ))}
      </div>
      <p className="text-[13px] text-muted-foreground">
        Atinge o fotografie ca s-o vezi pe tot ecranul. Cifrele de lângă rânduri o deschid la rândul
        acela.
      </p>
    </section>
  );
}
