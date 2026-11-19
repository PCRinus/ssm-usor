import { Button } from '@ssm-usor/ui/components/button';
import { CircleCheck, X } from 'lucide-react';

import type { FinishedNotice } from './regeneration-copy';

export function RegenerationToast({
  notice,
  onOpen,
  onClose,
}: {
  notice: FinishedNotice;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <div
      data-testid="regeneration-toast"
      className="relative flex w-full gap-3 rounded-lg border bg-popover p-4 pr-12 text-sm text-popover-foreground shadow-lg sm:w-[356px]"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-success text-success-foreground">
        <CircleCheck className="size-4" aria-hidden="true" />
      </span>
      <div className="grid min-w-0 gap-0.5">
        <p data-testid="regeneration-toast-title" className="font-semibold">
          {notice.title}
        </p>
        <p data-testid="regeneration-toast-description" className="text-muted-foreground">
          {notice.description}
        </p>
        {notice.shortfall && (
          <p data-testid="regeneration-toast-shortfall" className="text-warning-foreground">
            {notice.shortfall}
          </p>
        )}
        <Button variant="secondary" size="sm" className="mt-2 w-fit" onClick={onOpen}>
          Vezi rezultatul
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Închide notificarea"
        className="absolute top-3 right-3 max-sm:top-1.5 max-sm:right-1.5 max-sm:size-11"
        onClick={onClose}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}
