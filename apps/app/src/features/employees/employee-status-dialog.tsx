import {
  type ApiErrorResponse,
  clientConflictReasons,
  employeeConflictReasons,
  formatEmployeeName,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Notice } from '@ssm-usor/ui/components/notice';
import { toast } from '@ssm-usor/ui/lib/toast';
import { type FormEvent, useState } from 'react';

import { type EmployeeListResponse, useUpdateEmployeeStatus } from '@/api/generated/api';
import { apiErrorBody, ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { replayMask } from '@/app/observability/replay-masking';
import { useHoldOpen } from '@/components/close-guard';
import { DatePicker } from '@/components/date-picker';
import { FormDialog } from '@/components/form-dialog';
import { Field } from '@/components/form-field';
import { HelpLink } from '@/components/help-link';
import { maskPeople } from '@/components/mask-people';
import {
  employeesOverStepMessage,
  isEmployeesOverStepError,
} from '@/features/subscription/employees-over-step';
import { commonFailure, noOrganizationMessage } from '@/lib/api-errors';
import { formatDate, todayIso } from '@/lib/dates';

import { refreshWorkforce } from './employee-cache';

type Employee = Omit<
  EmployeeListResponse['items'][number],
  'signaturesPending' | 'portal' | 'dutiesAcknowledgement'
>;

export type EmployeeStatusAction = 'terminate' | 'reactivate';

export interface EmployeeStatusChange {
  employee: Employee;
  action: EmployeeStatusAction;
}

function serverMessage(cause: unknown) {
  if (isEmployeesOverStepError(cause)) return employeesOverStepMessage;
  const common = commonFailure(cause);
  if (common) return common;
  if (cause instanceof ApiHttpError) {
    if (cause.status === 404) return 'Lucrătorul nu mai există la acest client.';
    if (cause.status === 409) return conflictMessage(apiErrorBody(cause));
    if (cause.status === 403) {
      return noOrganizationMessage;
    }
  }
  return 'Nu am putut salva modificarea. Verifică conexiunea și încearcă din nou.';
}

function conflictMessage(body: Partial<ApiErrorResponse> | undefined) {
  if (body?.reason === clientConflictReasons.clientArchived) {
    return 'Clientul este arhivat; situația lucrătorilor nu se mai schimbă.';
  }
  if (body?.reason === employeeConflictReasons.cnpTaken) {
    return 'Trecerea la foști nu poate fi anulată: un lucrător actual al clientului are același CNP, de obicei rândul adăugat la reangajare.';
  }
  if (body?.reason === employeeConflictReasons.numberTaken) {
    return 'Trecerea la foști nu poate fi anulată: un lucrător actual al clientului are aceeași marcă, de obicei rândul adăugat la reangajare.';
  }
  return 'Situația lucrătorului nu a putut fi schimbată. Reîncarcă pagina și încearcă din nou.';
}

// Marking a leaver asks for the leave date; reactivating is for undoing a mistake, since a
// rehire after a gap is a new employee.
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
    <FormDialog open={change !== null} onClose={onClose}>
      {change && (
        <StatusForm
          key={`${change.employee.id}-${change.action}`}
          clientId={clientId}
          onClose={onClose}
          {...change}
        />
      )}
    </FormDialog>
  );
}

function StatusForm({
  clientId,
  employee,
  action,
  onClose,
}: EmployeeStatusChange & { clientId: string; onClose: () => void }) {
  const { request, queryClient } = useApi();
  const update = useUpdateEmployeeStatus({ request });
  const [terminatedAt, setTerminatedAt] = useState(todayIso);
  const [dateError, setDateError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = formatEmployeeName(employee);
  const busy = update.isPending;
  useHoldOpen(busy);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setDateError(null);
    setError(null);
    if (action === 'terminate') {
      if (!terminatedAt) return setDateError('Alege data încetării.');
      if (terminatedAt < employee.hiredAt) {
        return setDateError('Data încetării nu poate fi înaintea datei angajării.');
      }
    }
    try {
      await update.mutateAsync({
        clientId,
        employeeId: employee.id,
        data:
          action === 'terminate' ? { status: 'terminated', terminatedAt } : { status: 'active' },
      });
      await refreshWorkforce(queryClient, clientId, { employeeId: employee.id });
      toast.success(
        action === 'terminate'
          ? maskPeople`${name} a trecut la foști lucrători.`
          : maskPeople`${name} este din nou lucrător actual.`
      );
      onClose();
    } catch (cause) {
      const body = apiErrorBody(cause);
      const issue = body?.issues?.find((item) => item.path === 'terminatedAt');
      if (issue) setDateError('Data încetării nu poate fi înaintea datei angajării.');
      else setError(serverMessage(cause));
    }
  }

  return (
    <DialogContent
      data-testid="employee-status-dialog"
      className="sm:max-w-md"
      showCloseButton={!busy}
    >
      <form onSubmit={(event) => void submit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>
            {action === 'terminate' ? 'Trece la foști lucrători' : 'Anulezi trecerea la foști?'}
          </DialogTitle>
          <DialogDescription>
            {action === 'terminate' ? (
              <>
                <span className="font-medium text-foreground" {...replayMask}>
                  {name}
                </span>{' '}
                trece la foști lucrători din ziua încetării. Instruirile, fișele și fișierele rămân
                la dosar.
              </>
            ) : (
              <>
                <span className="font-medium text-foreground" {...replayMask}>
                  {name}
                </span>{' '}
                redevine lucrător actual și data încetării
                {employee.terminatedAt && `, ${formatDate(employee.terminatedAt)},`} se șterge.
                Folosește asta doar ca să corectezi o greșeală; cine revine după o pauză se adaugă
                ca lucrător nou. <HelpLink topic="angajati.reactivare">Află mai mult</HelpLink>
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {action === 'terminate' && (
          <Field
            id="terminatedAt"
            label="Data încetării"
            hint={`Angajat din ${formatDate(employee.hiredAt)}.`}
            help="angajati.data-plecarii"
            error={dateError ? { type: 'manual', message: dateError } : undefined}
            className="mt-5"
          >
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
          </Field>
        )}
        {error && (
          <Notice variant="destructive" data-testid="employee-status-error" className="mt-4">
            {error}
          </Notice>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button
            type="submit"
            variant={action === 'terminate' ? 'destructive-soft' : 'default'}
            data-testid="employee-status-confirm"
            disabled={busy}
          >
            {busy
              ? 'Se salvează…'
              : action === 'terminate'
                ? 'Trece la foști'
                : 'Anulează trecerea'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
