import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { useId } from 'react';
import type { TooltipRenderProps } from 'react-joyride';

export function GuideTooltip({
  index,
  size,
  isLastStep,
  step,
  backProps,
  primaryProps,
  skipProps,
  tooltipProps,
}: TooltipRenderProps) {
  const id = useId();
  return (
    <Card
      {...tooltipProps}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      data-testid="guide-tooltip"
      className="w-[min(22rem,calc(100vw-2rem))] gap-4 rounded-2xl px-5 py-5 shadow-[0_18px_50px_rgb(15_36_31/0.28)]"
    >
      <div className="grid gap-1.5">
        <p
          data-testid="guide-progress"
          className="text-xs font-medium text-muted-foreground tabular-nums"
        >
          {index + 1} din {size}
        </p>
        <h2 id={`${id}-title`} className="text-lg leading-snug font-semibold tracking-[-0.01em]">
          {step.title}
        </h2>
        <p id={`${id}-body`} className="text-sm leading-relaxed text-muted-foreground">
          {step.content}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button {...skipProps} data-testid="guide-skip" variant="ghost" size="sm" className="-ml-3">
          Sari peste
        </Button>
        <div className="ml-auto flex gap-2">
          {index > 0 && (
            <Button {...backProps} data-testid="guide-back" variant="outline" size="sm">
              Înapoi
            </Button>
          )}
          <Button {...primaryProps} data-testid="guide-next" size="sm">
            {isLastStep ? 'Gata' : 'Următorul'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
