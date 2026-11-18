import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import type { ReactNode } from 'react';

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
  onConfirm: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
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
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            data-testid={`${testId}-confirm`}
            disabled={busy || confirmDisabled}
            onClick={onConfirm}
          >
            {busy ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
