import { useLingui } from '@lingui/react/macro';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useId, useState } from 'react';

// Counted rather than measured on the clamped text: two lines hold about this much on a phone.
const clampedLength = 120;

export function TrainingMaterial({ text }: { text: string }) {
  const { t } = useLingui();
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const long = text.length > clampedLength || text.includes('\n');
  return (
    <div>
      <p
        id={id}
        data-testid="training-material-text"
        className={cn(
          'text-sm leading-relaxed break-words whitespace-pre-line text-foreground/80',
          long && !expanded && 'line-clamp-2'
        )}
      >
        {text}
      </p>
      {long && (
        <Button
          type="button"
          variant="link"
          className="h-auto justify-start px-0 py-1 text-sm"
          aria-expanded={expanded}
          aria-controls={id}
          data-testid="training-material-toggle"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? t`Mai puțin` : t`Tot textul`}
        </Button>
      )}
    </div>
  );
}
