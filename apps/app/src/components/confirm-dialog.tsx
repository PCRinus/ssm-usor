import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { type ReactNode, useState } from 'react';

import { Notice } from '@/components/notice';

// Closing while the action runs would lose the failure message the caller shows here.
export function ConfirmDialog({
  open,
  busy = false,
  testId,
  title,
  confirmLabel,
  pendingLabel,
  destructive = true,
  confirmDisabled = false,
  error,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  // Busy from elsewhere too, beside the promise `onConfirm` returns.
  busy?: boolean;
  // The stem of `${testId}-dialog`, `${testId}-confirm` and `${testId}-error`.
  testId: string;
  title: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  destructive?: boolean;
  confirmDisabled?: boolean;
  error?: string | null;
  // A returned promise keeps the dialog busy until it settles, refreshes after the request included.
  onConfirm: () => unknown;
  onClose: () => void;
  children: ReactNode;
}) {
  const [running, setRunning] = useState<symbol | null>(null);
  const [shownOpen, setShownOpen] = useState(open);
  // A caller that stays mounted may still be refreshing after the last confirm when it opens again.
  if (open !== shownOpen) {
    setShownOpen(open);
    if (open) setRunning(null);
  }
  const pending = busy || running !== null;

  async function confirm() {
    const run = Symbol();
    setRunning(run);
    try {
      await onConfirm();
    } finally {
      setRunning((current) => (current === run ? null : current));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent data-testid={`${testId}-dialog`} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{children}</DialogDescription>
        </DialogHeader>
        {error && (
          <Notice variant="destructive" data-testid={`${testId}-error`}>
            {error}
          </Notice>
        )}
        <DialogFooter className="mt-2">
          <Button variant="ghost" disabled={pending} onClick={onClose}>
            Renunță
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            data-testid={`${testId}-confirm`}
            disabled={pending || confirmDisabled}
            onClick={() => void confirm()}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
