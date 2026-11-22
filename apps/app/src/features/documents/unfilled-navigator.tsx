import { countOf, unfilledMark } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { TriangleAlert } from 'lucide-react';

import type { UnfilledMarks } from './use-unfilled-marks';

export function UnfilledNavigator({ marks }: { marks: UnfilledMarks }) {
  if (marks.count === 0) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      data-testid="editor-unfilled"
      title={`Selectează următorul „${unfilledMark}”; ce scrii îl înlocuiește.`}
      className="border-warning-border bg-warning text-warning-foreground hover:bg-warning/70 hover:text-warning-foreground"
      onClick={marks.next}
    >
      <TriangleAlert aria-hidden="true" />
      {countOf(marks.count, 'loc', 'locuri')} de completat
      <span className="font-normal">
        {marks.active < 0 ? '· arată' : `· ${marks.active + 1} din ${marks.count}`}
      </span>
    </Button>
  );
}
