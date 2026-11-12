import { pageBounds, pageCount } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pager({
  noun,
  testId = 'pager',
  disabled,
  onPage,
  ...meta
}: {
  noun: { one: string; many: string };
  testId?: string;
  page: number;
  pageSize: number;
  total: number;
  disabled: boolean;
  onPage: (page: number) => void;
}) {
  const { first, last } = pageBounds(meta);
  const pages = pageCount(meta);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
      <p data-testid={`${testId}-summary`} className="text-muted-foreground text-sm tabular-nums">
        {meta.total === 0
          ? `No ${noun.many}`
          : `${first}–${last} of ${meta.total} ${meta.total === 1 ? noun.one : noun.many}`}
      </p>
      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            data-testid={`${testId}-previous`}
            disabled={disabled || meta.page <= 1}
            onClick={() => onPage(meta.page - 1)}
          >
            <ChevronLeft aria-hidden="true" />
            Previous
          </Button>
          <span className="text-muted-foreground px-2 text-sm tabular-nums">
            {meta.page} / {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            data-testid={`${testId}-next`}
            disabled={disabled || meta.page >= pages}
            onClick={() => onPage(meta.page + 1)}
          >
            Next
            <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      )}
    </div>
  );
}
