import { pageBounds, pageCount, type PageMeta } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// The page itself lives in the route's search params; the parent turns the callback into
// navigation.
export function Pager({
  meta,
  noun,
  disabled,
  onPage,
}: {
  meta: PageMeta;
  // Singular and plural of what is counted, for example ['angajat', 'angajați'].
  noun: readonly [string, string];
  disabled?: boolean;
  onPage: (page: number) => void;
}) {
  const { first, last } = pageBounds(meta);
  const pages = pageCount(meta);
  const summary =
    meta.total === 0
      ? `0 ${noun[1]}`
      : meta.total === 1
        ? `1 ${noun[0]}`
        : `${first}–${last} din ${meta.total} ${noun[1]}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
      <p data-testid="pager-summary" className="text-sm text-muted-foreground tabular-nums">
        {summary}
      </p>
      {pages > 1 && (
        <nav aria-label="Paginare" className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            data-testid="pager-previous"
            disabled={disabled || meta.page <= 1}
            onClick={() => onPage(meta.page - 1)}
          >
            <ChevronLeft aria-hidden="true" />
            Anterioara
          </Button>
          <span className="px-2 text-sm text-muted-foreground tabular-nums">
            Pagina {meta.page} din {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            data-testid="pager-next"
            disabled={disabled || meta.page >= pages}
            onClick={() => onPage(meta.page + 1)}
          >
            Următoarea
            <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      )}
    </div>
  );
}
