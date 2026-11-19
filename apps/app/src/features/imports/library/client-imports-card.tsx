import { capitalized } from '@ssm-usor/contracts';
import { Link } from '@tanstack/react-router';
import { Check, ChevronRight } from 'lucide-react';
import { useId } from 'react';

import type { ImportListResponseItemsItem } from '@/api/generated/api';
import { openedHere } from '@/app/opener';
import { HelpLink } from '@/components/help-link';
import { Masked } from '@/components/replay';

import { filesLabel } from '../import-format';
import { importOutcome } from './next-steps-model';

const dayFormat = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function ClientImportsCard({
  items,
  now,
}: {
  items: readonly ImportListResponseItemsItem[];
  now: number;
}) {
  const headingId = useId();
  if (items.length === 0) return null;
  return (
    <section
      data-testid="client-imports-card"
      aria-labelledby={headingId}
      className="px-1 pt-2 sm:px-2"
    >
      <div className="flex min-h-8 items-center">
        <h2 id={headingId} className="text-sm font-semibold">
          Importuri din documente
        </h2>
        <HelpLink
          topic="detalii.importuri"
          label="Ajutor: Importuri din documente"
          className="ml-1"
        />
      </div>
      <ul className="divide-y">
        {items.map((item) => (
          <ImportRow key={item.id} item={item} now={now} />
        ))}
      </ul>
    </section>
  );
}

function ImportRow({ item, now }: { item: ImportListResponseItemsItem; now: number }) {
  const outcome = importOutcome(item.libraryParts, now);
  const who = item.createdBy?.fullName ?? null;
  const how = item.intoExistingClient
    ? 'client completat din documente'
    : 'client creat din documente';
  const files = item.fileCount === 1 ? '1 fișier' : filesLabel(item.fileCount);
  return (
    <li data-testid="client-import-row" data-outcome={outcome.kind}>
      <Link
        to="/clienti/import/$importId"
        state={openedHere}
        params={{ importId: item.id }}
        className="-mx-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2.5 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:flex-nowrap"
      >
        <span className="font-medium text-foreground" data-testid="client-import-date">
          {dayFormat.format(new Date(item.confirmedAt ?? item.createdAt))}
        </span>
        <span className="order-last basis-full sm:order-none sm:basis-auto">
          {who ? (
            <>
              <Masked>{who}</Masked> · {how}
            </>
          ) : (
            capitalized(how)
          )}
          {` · ${files}`}
        </span>
        <span
          className="ml-auto inline-flex items-center gap-1 whitespace-nowrap"
          data-testid="client-import-status"
        >
          {outcome.kind === 'done' && <Check aria-hidden="true" className="size-3.5" />}
          {outcome.label}
        </span>
        <ChevronRight aria-hidden="true" className="size-4" />
      </Link>
    </li>
  );
}
