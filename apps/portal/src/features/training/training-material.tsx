import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useId, useState } from 'react';

// Counted rather than measured on the clamped text: two lines hold about this much on a phone.
const clampedLength = 120;

export function TrainingMaterial({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const long = text.length > clampedLength || text.includes('\n');
  return (
    <div>
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
          className="h-11 px-0"
          aria-expanded={expanded}
          aria-controls={id}
          data-testid="training-material-toggle"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? 'Mai puțin' : 'Tot textul'}
        </Button>
      )}
    </div>
  );
}
