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
  busy,
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
  busy: boolean;
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
  const [running, setRunning] = useState(false);
  const pending = busy || running;

  async function confirm() {
    setRunning(true);
    try {
      await onConfirm();
    } finally {
      setRunning(false);
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
