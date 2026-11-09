import { TriangleAlert } from 'lucide-react';

import type { BlockerLink } from './review-model';

const kinds = [
  {
    codes: ['missing', 'unknown_reference'],
    label: (count: number) => (count === 1 ? '1 dată lipsă' : `${count} date lipsă`),
  },
  {
    codes: ['choice'],
    label: (count: number) => (count === 1 ? '1 alegere' : `${count} alegeri`),
  },
  {
    codes: ['invalid'],
    label: (count: number) =>
      count === 1 ? '1 valoare de corectat' : `${count} valori de corectat`,
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-warning-foreground">
      {links.length > 0 && <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />}
      {kinds.map(({ codes, label }) => {
        const matching = links.filter((link) => codes.includes(link.code));
        if (matching.length === 0) return null;
        return (
          <button
            key={codes[0]}
            type="button"
            onClick={() => onReveal(matching)}
            className="min-h-11 rounded-sm sm:min-h-0 text-left underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Mergi la prima secțiune care are nevoie de atenție"
          >
            {label(matching.length)}
          </button>
        );
      })}
    </div>
  );
}
