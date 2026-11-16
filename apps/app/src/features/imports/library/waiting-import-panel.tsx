import type { ImportLibraryPart } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Link } from '@tanstack/react-router';
import { TriangleAlert } from 'lucide-react';
import { useId } from 'react';

import type { ImportListResponseItemsItem } from '@/api/generated/api';
import { openedHere } from '@/app/opener';
import { Masked } from '@/components/replay';
import { roCount } from '@/features/employees/employee-format';

import { filesLabel } from '../import-format';
import { libraryDay, partLabels, partOrder, statusLabels } from './library-model';
import { earliestExpiry } from './next-steps-model';

const order: readonly ImportLibraryPart[] = [...partOrder, 'risk_evaluations'];

const labelOf = (part: ImportLibraryPart) =>
  part === 'risk_evaluations' ? 'Evaluări de risc' : partLabels[part];

const dayFormat = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

type OpenPart = ImportListResponseItemsItem['libraryParts'][number];

export function WaitingImportPanel({
  item,
  open,
}: {
  item: ImportListResponseItemsItem;
  open: readonly OpenPart[];
}) {
  const headingId = useId();
  const until = earliestExpiry(open);
  const parts = [...open].sort((a, b) => order.indexOf(a.part) - order.indexOf(b.part));
  const who = item.createdBy?.fullName ?? null;
  const files = item.fileCount === 1 ? '1 fișier' : filesLabel(item.fileCount);
  return (
    <section
      data-testid="client-library-tasks-notice"
      data-sheet-panel
      aria-labelledby={headingId}
      className="flex flex-wrap items-start gap-x-4 gap-y-3.5 rounded-xl border bg-card p-4 sm:p-6"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-warning text-warning-foreground">
        <TriangleAlert aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id={headingId} className="text-xl leading-7 font-semibold tracking-[-0.01em]">
          {roCount(parts.length, 'parte', 'părți')} de verificat
          {until && ` până pe ${libraryDay(until)}`}
        </h2>
        <p className="mt-0.5 text-[0.8125rem] leading-5 text-muted-foreground">
          Din importul de pe {dayFormat.format(new Date(item.confirmedAt ?? item.createdAt))}
          {who && (
            <>
              {' · '}
              <Masked>{who}</Masked>
            </>
          )}
          {` · ${files}`}
        </p>
        <ul className="mt-3.5 grid gap-1.5 text-sm" data-testid="client-library-tasks-parts">
          {parts.map((part) => (
            <li key={part.part} className="flex items-baseline gap-2.5">
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 -translate-y-0.5 rounded-full bg-warning-border"
              />
              <span>
                {labelOf(part.part)}{' '}
                <span className="text-muted-foreground">
                  · {statusLabels[part.status].toLowerCase()}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Button asChild size="sm" className="max-sm:h-9 max-sm:w-full">
        <Link
          to="/clienti/import/$importId"
          state={openedHere}
          params={{ importId: item.id }}
          data-testid="client-library-tasks-open"
        >
          Verifică importul
        </Link>
      </Button>
    </section>
  );
}
