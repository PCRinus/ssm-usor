import { cn } from '@ssm-usor/ui/lib/utils';
import { Check, X } from 'lucide-react';
import type { ReactNode } from 'react';

export type ImportStep = { label: string; detail: ReactNode };

export function ImportSteps({
  steps,
  reached,
  failed,
}: {
  steps: readonly ImportStep[];
  reached: number;
  failed: boolean;
}) {
  return (
    <ol className="grid gap-3">
      {steps.map((step, index) => {
        const state =
          index < reached ? 'done' : index === reached ? (failed ? 'failed' : 'current') : 'next';
        return (
          <li
            key={step.label}
            data-testid="import-step"
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
            className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-x-3 sm:grid-cols-[1.75rem_minmax(0,14rem)_minmax(0,1fr)]"
          >
            <span
              className={cn(
                'grid size-7 place-items-center rounded-full text-xs font-semibold',
                state === 'done' && 'bg-primary text-primary-foreground',
                state === 'current' && 'bg-accent text-accent-foreground',
                state === 'failed' && 'bg-destructive text-white',
                state === 'next' && 'border text-muted-foreground'
              )}
              aria-hidden="true"
            >
              {state === 'done' ? (
                <Check className="size-4" />
              ) : state === 'failed' ? (
                <X className="size-4" />
              ) : (
                index + 1
              )}
            </span>
            <span
              className={cn('text-sm font-medium', state === 'next' && 'text-muted-foreground')}
            >
              {step.label}
            </span>
            {step.detail !== null && (
              <span className="col-start-2 text-sm text-muted-foreground tabular-nums sm:col-start-3">
                {step.detail}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
