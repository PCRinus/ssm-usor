import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import { useId } from 'react';

import type { MissingGroup, MissingRow } from './missing-rows';

const rowClass = 'flex min-h-12 items-center gap-3 px-4 py-2.5';

function RowText({ row }: { row: MissingRow }) {
  return (
    <span className="grid min-w-0 flex-1 gap-0.5">
      <span className="text-sm font-medium wrap-anywhere">{row.label}</span>
      {row.detail && (
        <span className="text-sm leading-snug text-muted-foreground">{row.detail}</span>
      )}
    </span>
  );
}

export function MissingDataList({
  groups,
  testId,
  onFollow,
}: {
  groups: readonly MissingGroup[];
  testId: string;
  onFollow?: (row: MissingRow) => void;
}) {
  // Unique per list: a page can show one list per client.
  const id = useId();
  return (
    <div className="grid gap-5">
      {groups.map((group) => {
        const headingId = `${id}-${group.place}`;
        return (
          <section
            key={group.place}
            data-testid={`${testId}-place`}
            data-place={group.place}
            aria-labelledby={headingId}
            className="grid gap-2"
          >
            <div className="grid gap-0.5">
              <h3 id={headingId} className="text-sm font-medium text-muted-foreground">
                {group.heading}
              </h3>
              {group.hint && <p className="text-xs text-muted-foreground">{group.hint}</p>}
            </div>
            <ul className="divide-y overflow-hidden rounded-lg border">
              {group.rows.map((row) => (
                <li key={row.key}>
                  {row.target ? (
                    <Link
                      {...row.target}
                      data-testid={`${testId}-row`}
                      onClick={() => onFollow?.(row)}
                      className={`${rowClass} outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset`}
                    >
                      <RowText row={row} />
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                    </Link>
                  ) : (
                    <div data-testid={`${testId}-row`} className={rowClass}>
                      <RowText row={row} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
