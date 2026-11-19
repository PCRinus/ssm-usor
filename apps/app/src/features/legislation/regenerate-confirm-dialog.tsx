import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { RefreshCw } from 'lucide-react';

import type { ConfirmCopy } from './regeneration-copy';

export function RegenerateConfirmDialog({
  copy,
  starting,
  onCancel,
  onConfirm,
}: {
  copy: ConfirmCopy | null;
  starting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={copy !== null} onOpenChange={(next) => !next && !starting && onCancel()}>
      {copy && (
        <DialogContent data-testid="behind-confirm-dialog" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg leading-snug">{copy.title}</DialogTitle>
            <DialogDescription>{copy.lead}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 text-sm leading-relaxed">
            {copy.lines.map((line) => (
              <p key={line.lead} data-testid="behind-confirm-line">
                <b className="font-semibold">{line.lead}</b>
                {line.rest}
              </p>
            ))}
          </div>
          <DialogFooter className="mt-2">
            <Button variant="ghost" disabled={starting} onClick={onCancel}>
              Renunță
            </Button>
            <Button data-testid="behind-confirm" disabled={starting} onClick={onConfirm}>
              <RefreshCw aria-hidden="true" />
              {starting ? 'Se pornește…' : copy.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
