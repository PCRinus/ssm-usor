import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useId, useState } from 'react';

// Counted rather than measured on the clamped text: two lines hold about this much at the usual
// widths.
const clampedLength = 160;

export function TrainingMaterial({ text, className }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
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
