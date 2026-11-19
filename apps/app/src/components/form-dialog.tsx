import { Dialog } from '@ssm-usor/ui/components/dialog';
import type { ReactNode, RefObject } from 'react';

import { SavingContext, useCloseGuard } from './close-guard';

export function CloseGuard({
  savingRef,
  children,
}: {
  savingRef: RefObject<boolean>;
  children: ReactNode;
}) {
  return <SavingContext value={savingRef}>{children}</SavingContext>;
}

// The form inside calls `useHoldOpen` with its pending state; without that call nothing is held.
export function FormDialog({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const { savingRef, onOpenChange } = useCloseGuard(onClose);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <CloseGuard savingRef={savingRef}>{children}</CloseGuard>
    </Dialog>
  );
}
