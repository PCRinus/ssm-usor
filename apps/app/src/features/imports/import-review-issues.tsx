import type { ReactNode } from 'react';

import { roCount } from '@/features/employees/employee-format';

import type { BlockerLink } from './review-model';
import { Tag } from './review-parts';

const kinds = [
  {
    codes: ['missing', 'unknown_reference'],
    tone: 'destructive' as const,
    label: (count: number) => roCount(count, 'dată lipsă', 'date lipsă'),
  },
  {
    codes: ['choice'],
    tone: 'warning' as const,
    label: (count: number) => roCount(count, 'alegere', 'alegeri'),
  },
  {
    codes: ['invalid'],
    tone: 'destructive' as const,
    label: (count: number) => roCount(count, 'valoare de corectat', 'valori de corectat'),
  },
];

export function ImportReviewIssues({
  links,
  onReveal,
}: {
  links: BlockerLink[];
  onReveal: (links: BlockerLink[]) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {kinds.map(({ codes, label, tone }) => {
        const matching = links.filter((link) => codes.includes(link.code));
        if (matching.length === 0) return null;
        return (
          <ImportIssueBadge key={codes[0]} tone={tone} onClick={() => onReveal(matching)}>
            {label(matching.length)}
          </ImportIssueBadge>
        );
      })}
    </div>
  );
}

export function ImportIssueBadge({
  tone,
  hint,
  onClick,
  children,
}: {
  tone: 'warning' | 'destructive';
  hint?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex min-h-11 cursor-pointer items-center rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
      title={hint ?? 'Mergi la primul bloc care are nevoie de atenție'}
    >
      <Tag
        tone={tone}
        className="underline-offset-2 transition-[filter] group-hover:underline group-hover:brightness-95 group-active:brightness-90"
      >
        {children}
      </Tag>
    </button>
  );
}
