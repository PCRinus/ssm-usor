import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Sun } from 'lucide-react';
import { type CSSProperties, useId } from 'react';

import type { SpotBox } from './spot-zoom';

// A located box may cut through a letter; the margin keeps the outline off the writing.
const margin = 8;
const cornerPixels = 6;

export function Spotlight({
  box,
  dimmed,
  size,
  className,
  style,
}: {
  box: SpotBox;
  dimmed: boolean;
  size?: { width: number; height: number } | null;
  className?: string;
  style?: CSSProperties;
}) {
  const mask = `spot-${useId().replace(/[^\w-]/g, '')}`;
  const left = Math.max(0, box.left - margin);
  const top = Math.max(0, box.top - margin);
  const width = Math.min(1000, box.right + margin) - left;
  const height = Math.min(1000, box.bottom + margin) - top;
  const hole = {
    x: left,
    y: top,
    width,
    height,
    rx: size?.width ? (cornerPixels * 1000) / size.width : cornerPixels,
    ry: size?.height ? (cornerPixels * 1000) / size.height : cornerPixels,
  };
  return (
    <svg
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      data-testid="spotlight"
      data-box={`${box.top} ${box.left} ${box.bottom} ${box.right}`}
      data-dimmed={dimmed}
      className={cn('pointer-events-none absolute', className)}
      style={style}
    >
      <mask id={mask}>
        <rect width="1000" height="1000" fill="white" />
        <rect {...hole} fill="black" />
      </mask>
      <rect
        width="1000"
        height="1000"
        mask={`url(#${mask})`}
        className={cn(
          'fill-(--brand-forest) transition-opacity duration-200 motion-reduce:transition-none',
          dimmed ? 'opacity-55' : 'opacity-0'
        )}
      />
      <rect
        {...hole}
        fill="none"
        className="stroke-(--brand-lime)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function SpotlightToggle({
  whole,
  onWhole,
}: {
  whole: boolean;
  onWhole: (whole: boolean) => void;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      aria-pressed={whole}
      data-testid="spotlight-whole"
      className="rounded-full bg-card shadow-sm aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90 aria-pressed:hover:text-primary-foreground"
      onClick={() => onWhole(!whole)}
    >
      <Sun aria-hidden="true" />
      Luminează tot
    </Button>
  );
}
