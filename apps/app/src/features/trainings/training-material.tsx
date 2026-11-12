import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useId, useState } from 'react';

import { NotOnSheet } from './not-on-sheet';
import { notOnSheet } from './training-format';

// Counted rather than measured on the clamped text: two lines hold about this much at the usual
// widths.
const clampedLength = 160;

// `named` where no column heading says what the text is.
export function TrainingMaterial({
  text,
  className,
  named,
}: {
  text: string | null;
  className?: string;
  named?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  if (text === null) {
    return (
      <p className={cn('text-sm', className)} data-testid="training-material-text">
        {named && 'Material '}
        <NotOnSheet>{notOnSheet.material}</NotOnSheet>
      </p>
    );
  }
  const long = text.length > clampedLength || text.includes('\n');
  return (
    <div className={className}>
      <p
        id={id}
        data-testid="training-material-text"
        className={cn(
          'text-sm break-words whitespace-pre-line',
          long && !expanded && 'line-clamp-2'
        )}
      >
        {text}
      </p>
      {long && (
        <Button
          type="button"
          variant="link"
          size="xs"
          className="h-auto px-0"
          aria-expanded={expanded}
          aria-controls={id}
          data-testid="training-material-toggle"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? 'mai puțin' : 'mai mult'}
        </Button>
      )}
    </div>
  );
}
