import { cn } from '@ssm-usor/ui/lib/utils';
import { ExternalLink } from 'lucide-react';
import { Fragment } from 'react';

import type { BankQuestion } from './test-format';

// One run of inline text, not flex items: the separators live inside the parts, and a gap
// would drop the spaces they carry.
export function QuestionCitation({
  citation,
  parts,
  className,
}: {
  citation: string;
  parts: BankQuestion['citationParts'];
  className?: string;
}) {
  const shown = parts.length > 0 ? parts : [{ text: citation, url: null }];
  return (
    <p data-testid="test-question-citation" className={cn('text-sm leading-[22px]', className)}>
      <span className="mr-2.5 text-[13px] font-semibold">Temei</span>
      {shown.map((part, index) =>
        part.url ? (
          <a
            key={index}
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="test-question-citation-link"
            className="font-medium underline decoration-ring underline-offset-[3px] outline-none hover:decoration-foreground focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {part.text}
            <ExternalLink
              className="ml-1 inline size-3.5 align-[-2px] text-muted-foreground"
              aria-label="(se deschide pe Portalul Legislativ)"
            />
          </a>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        )
      )}
    </p>
  );
}
