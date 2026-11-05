import { Link } from '@tanstack/react-router';
import { Check, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import type { ImportListResponseItemsItem } from '@/api/generated/api';
import { SectionCard } from '@/components/section-card';

import { filesLabel } from '../import-format';
import { Tag } from '../review-parts';
import { importOutcome } from './next-steps-model';
import { useConfirmedClientImports } from './use-confirmed-client-imports';

const dayFormat = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const capitalized = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

export function ClientImportsCard({ clientId }: { clientId: string }) {
  const confirmed = useConfirmedClientImports(clientId);
  const [now] = useState(() => Date.now());
  const items = confirmed.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <SectionCard
      data-testid="client-imports-card"
      title="Importuri din documente"
      description="Fiecare import își păstrează fișierele și ce ai preluat din ele."
      className="overflow-hidden pb-0"
    >
      <ul className="@container -mx-6 divide-y border-t">
        {items.map((item) => (
          <ImportRow key={item.id} item={item} now={now} />
        ))}
      </ul>
    </SectionCard>
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
        params={{ importId: item.id }}
        className="grid grid-cols-[minmax(0,1fr)_1rem] items-center gap-x-3 gap-y-1 px-6 py-3.5 transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset @2xl:grid-cols-[9.5rem_minmax(0,1fr)_8.75rem_16rem_1rem] @2xl:gap-x-4"
      >
        <span className="font-medium" data-testid="client-import-date">
          {dayFormat.format(new Date(item.confirmedAt ?? item.createdAt))}
        </span>
        <ChevronRight
          className="row-span-3 size-4 text-muted-foreground @2xl:order-last @2xl:row-span-1"
          aria-hidden="true"
        />
        <span className="text-sm text-muted-foreground">
          <span className="@2xl:hidden">{[who, files].filter(Boolean).join(' · ')}</span>
          <span className="hidden @2xl:inline">{who ? `${who} · ${how}` : capitalized(how)}</span>
        </span>
        <span className="hidden text-sm text-muted-foreground tabular-nums @2xl:inline">
          {capitalized(files)}
        </span>
        <span>
          <Tag
            tone={
              outcome.kind === 'open' ? 'warning' : outcome.kind === 'done' ? 'success' : 'muted'
            }
            icon={outcome.kind === 'done' ? <Check aria-hidden="true" /> : undefined}
            testId="client-import-status"
          >
            {outcome.label}
          </Tag>
        </span>
      </Link>
    </li>
  );
}
