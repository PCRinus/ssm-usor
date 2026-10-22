import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { useState } from 'react';

import { Field } from '@/components/form-field';
import { EmployeeCombobox, type EmployeeOption } from '@/features/training/employee-combobox';

import type { InvitedEmployee } from './invite-employee-dialog';

export function InviteEmployeePicker({
  clientId,
  userId,
  open,
  onClose,
  onPick,
}: {
  clientId: string;
  userId: string;
  open: boolean;
  onClose: () => void;
  onPick: (employee: InvitedEmployee) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open && <PickerForm clientId={clientId} userId={userId} onClose={onClose} onPick={onPick} />}
    </Dialog>
  );
}

function PickerForm({
  clientId,
  userId,
  onClose,
  onPick,
}: {
  clientId: string;
  userId: string;
  onClose: () => void;
  onPick: (employee: InvitedEmployee) => void;
}) {
  const [employee, setEmployee] = useState<EmployeeOption | null>(null);
  const [missing, setMissing] = useState(false);

  function next() {
    if (!employee) {
      setMissing(true);
      return;
    }
    onPick({ id: employee.id, clientId, email: employee.email, phone: employee.phone });
  }

  return (
    <DialogContent data-testid="participant-pick-dialog" className="sm:max-w-md">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          next();
        }}
        noValidate
      >
        <DialogHeader>
          <DialogTitle>Invită un angajat în portal</DialogTitle>
          <DialogDescription>
            Alege angajatul; invitația pleacă pe emailul sau telefonul din datele lui.
          </DialogDescription>
        </DialogHeader>
        <Field
          id="participant-pick-employee"
          label="Angajatul"
          error={missing ? { type: 'required', message: 'Alege un angajat.' } : undefined}
          className="mt-5"
        >
          <EmployeeCombobox
            id="participant-pick-employee"
            testId="participant-pick-employee"
            clientId={clientId}
            userId={userId}
            value={employee?.id ?? ''}
            onSelect={(picked) => {
              setEmployee(picked);
              if (picked) setMissing(false);
            }}
            invalid={missing}
            describedBy={missing ? 'participant-pick-employee-error' : undefined}
          />
        </Field>
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="participant-pick-submit">
            Continuă
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
