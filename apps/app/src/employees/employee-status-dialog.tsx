import { formatEmployeeName } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Label } from '@ssm-usor/ui/components/label';
import { useRouteContext } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';

import {
  type ApiErrorResponse,
  type EmployeeListResponse,
  getGetEmployeeQueryKey,
  getListEmployeesQueryKey,
  useUpdateEmployeeStatus,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { DatePicker } from '../components/date-picker';
import { FieldMessage } from '../components/form-field';
import { formatDate, todayIso } from './employee-format';

type Employee = EmployeeListResponse['items'][number];

export type EmployeeStatusAction = 'terminate' | 'reactivate';

export interface EmployeeStatusChange {
  employee: Employee;
  action: EmployeeStatusAction;
}

function serverMessage(cause: unknown) {
  if (cause instanceof ApiHttpError) {
    if (cause.status === 404) return 'Angajatul nu mai există la acest client.';
    if (cause.status === 401) {
      return 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.';
    }
    if (cause.status === 403) {
      return 'Contul tău nu face parte dintr-o organizație. Contactează administratorul.';
    }
  }
  return 'Nu am putut salva modificarea. Verifică conexiunea și încearcă din nou.';
}

// Confirms a status change. Marking a leaver asks for the leave date; reactivating is for
// undoing a mistake, since a rehire after a gap is a new employee.
export function EmployeeStatusDialog({
  clientId,
  change,
  onClose,
}: {
  clientId: string;
  change: EmployeeStatusChange | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={change !== null} onOpenChange={(open) => !open && onClose()}>
      {change && (
        <StatusForm
          key={`${change.employee.id}-${change.action}`}
          clientId={clientId}
          onClose={onClose}
          {...change}
        />
      )}
    </Dialog>
  );
}

function StatusForm({
  clientId,
  employee,
  action,
  onClose,
}: EmployeeStatusChange & { clientId: string; onClose: () => void }) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const update = useUpdateEmployeeStatus({ request: apiRequest });
  const [terminatedAt, setTerminatedAt] = useState(todayIso);
  const [dateError, setDateError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = formatEmployeeName(employee);
  const busy = update.isPending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setDateError(null);
    setError(null);
    if (action === 'terminate') {
      if (!terminatedAt) return setDateError('Alege data plecării.');
      if (terminatedAt < employee.hiredAt) {
        return setDateError('Data plecării nu poate fi înaintea datei angajării.');
      }
    }
    try {
      await update.mutateAsync({
        clientId,
        employeeId: employee.id,
        data:
          action === 'terminate' ? { status: 'terminated', terminatedAt } : { status: 'active' },
      });
      // Every filtered variant of the client's list shares this key prefix; the detail
      // page reads its own query.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey(clientId) }),
        queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(clientId, employee.id) }),
      ]);
      onClose();
    } catch (cause) {
      const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
      const issue = body?.issues?.find((item) => item.path === 'terminatedAt');
      if (issue) setDateError('Data plecării nu poate fi înaintea datei angajării.');
      else setError(serverMessage(cause));
    }
  }

  return (
    <DialogContent data-testid="employee-status-dialog" className="sm:max-w-md">
      <form onSubmit={(event) => void submit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>
            {action === 'terminate' ? 'Marchează plecarea' : 'Reactivează angajatul'}
          </DialogTitle>
          <DialogDescription>
            {action === 'terminate' ? (
              <>
                <span className="font-medium text-foreground">{name}</span> trece la foști angajați.
                Dovezile instruirilor rămân la dosar.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">{name}</span> revine printre angajații
                actuali. Folosește acțiunea doar pentru a corecta o greșeală; o reangajare după o
                pauză se înregistrează ca angajat nou.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {action === 'terminate' && (
          <div className="mt-5 grid gap-2">
            <Label htmlFor="terminatedAt">Data plecării</Label>
            <DatePicker
              id="terminatedAt"
              testId="employee-terminated-at"
              value={terminatedAt}
              min={employee.hiredAt}
              disabled={busy}
              invalid={Boolean(dateError)}
              describedBy={dateError ? 'terminatedAt-error' : 'terminatedAt-hint'}
              onChange={setTerminatedAt}
              required
            />
            {!dateError && (
              <p id="terminatedAt-hint" className="text-xs text-muted-foreground">
                Angajat din {formatDate(employee.hiredAt)}.
              </p>
            )}
            <FieldMessage
              id="terminatedAt-error"
              error={dateError ? { type: 'manual', message: dateError } : undefined}
            />
          </div>
        )}
        {error && (
          <p
            data-testid="employee-status-error"
            role="alert"
            className="mt-4 rounded-md border border-destructive/30 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="employee-status-confirm" disabled={busy}>
            {busy ? 'Se salvează…' : action === 'terminate' ? 'Confirmă plecarea' : 'Reactivează'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
