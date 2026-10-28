import { Button } from '@ssm-usor/ui/components/button';
import { Maximize, Minus, Plus } from 'lucide-react';

const zoomSteps = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];

export function ZoomBar({
  zoom,
  onZoom,
  fit,
}: {
  zoom: number | 'fit';
  onZoom: (zoom: number | 'fit') => void;
  fit: boolean;
}) {
  const current = zoom === 'fit' ? 1 : zoom;
  const lower = [...zoomSteps].reverse().find((each) => each < current) ?? zoomSteps[0]!;
  const higher = zoomSteps.find((each) => each > current) ?? zoomSteps.at(-1)!;
  return (
    <div
      role="toolbar"
      aria-label="Mărire"
      className="absolute right-4 bottom-4 flex items-center gap-1 rounded-full border bg-card px-2 py-1 shadow-sm"
    >
      <Button variant="ghost" size="icon-sm" aria-label="Micșorează" onClick={() => onZoom(lower)}>
        <Minus aria-hidden="true" />
      </Button>
      <span className="min-w-14 text-center text-xs tabular-nums" data-testid="source-zoom">
        {zoom === 'fit' ? 'Potrivit' : `${Math.round(zoom * 100)}%`}
      </span>
      <Button variant="ghost" size="icon-sm" aria-label="Mărește" onClick={() => onZoom(higher)}>
        <Plus aria-hidden="true" />
      </Button>
      {fit && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Potrivește în fereastră"
          onClick={() => onZoom('fit')}
        >
          <Maximize aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
