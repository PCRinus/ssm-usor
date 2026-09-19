import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  type EmployeeResponse,
  getGetEmployeeQueryKey,
  getListEmployeesQueryKey,
  getListJobPositionsQueryKey,
  useUpdateEmployeeJobPosition,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { Field } from '../components/form-field';
import { JobPositionCombobox } from '../job-positions/job-position-combobox';

type Employee = EmployeeResponse['employee'];

const schema = z.object({
  // The id of one of the client's job positions.
  jobPosition: z.uuid('Alege postul de lucru.'),
  jobTitle: z
    .string()
    .trim()
    .min(2, 'Introdu funcția din contract (cel puțin 2 caractere).')
    .max(160, 'Funcția poate avea cel mult 160 de caractere.'),
});

type Values = z.infer<typeof schema>;

// Moves an employee to another of the client's job positions (ADR 006). The contract title
// is shown and stays as it is unless the person changes it: a post can change without a new
// contract.
export function EmployeeJobPositionDialog({
  clientId,
  userId,
  employee,
  onClose,
}: {
  clientId: string;
  userId: string;
  employee: Employee | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={employee !== null} onOpenChange={(open) => !open && onClose()}>
      {employee && (
        <Form
          key={employee.id}
          clientId={clientId}
          userId={userId}
          employee={employee}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function Form({
  clientId,
  userId,
  employee,
  onClose,
}: {
  clientId: string;
  userId: string;
  employee: Employee;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const move = useUpdateEmployeeJobPosition({ request: apiRequest });
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { jobPosition: employee.jobPosition.id, jobTitle: employee.jobTitle },
  });
  const { errors } = form.formState;
  const busy = move.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await move.mutateAsync({
        clientId,
        employeeId: employee.id,
        data: {
          jobPositionId: values.jobPosition,
          ...(values.jobTitle === employee.jobTitle ? {} : { jobTitle: values.jobTitle }),
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetEmployeeQueryKey(clientId, employee.id) }),
        queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey(clientId) }),
        queryClient.invalidateQueries({ queryKey: getListJobPositionsQueryKey(clientId) }),
      ]);
      toast.success('Postul de lucru a fost schimbat.');
      onClose();
    } catch (cause) {
      form.setError('root.server', {
        message:
          cause instanceof ApiHttpError && cause.status === 400
            ? 'Postul ales nu mai există la acest client. Alege altul.'
            : cause instanceof ApiHttpError && cause.status === 404
              ? 'Angajatul nu mai există la acest client.'
              : 'Nu am putut schimba postul de lucru. Verifică conexiunea și încearcă din nou.',
      });
    }
  });

  return (
    <DialogContent data-testid="employee-job-position-dialog" className="sm:max-w-lg">
      <form onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>Schimbă postul de lucru</DialogTitle>
          <DialogDescription>
            Postul este munca pe care o face omul, cu riscurile și instruirea ei. Funcția din
            contract rămâne cum este, dacă nu o schimbi și pe ea.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-5 grid gap-5">
          <Field id="employee-position" label="Post de lucru" error={errors.jobPosition}>
            <Controller
              control={form.control}
              name="jobPosition"
              render={({ field }) => (
                <JobPositionCombobox
                  id="employee-position"
                  testId="employee-position"
                  clientId={clientId}
                  userId={userId}
                  value={field.value}
                  onChange={(value) => field.onChange(value)}
                  onBlur={field.onBlur}
                  disabled={busy}
                  invalid={Boolean(errors.jobPosition)}
                  describedBy={errors.jobPosition ? 'employee-position-error' : undefined}
                  modal
                />
              )}
            />
          </Field>
          <Field id="employee-contract-title" label="Funcția din contract" error={errors.jobTitle}>
            <Input
              id="employee-contract-title"
              data-testid="employee-contract-title"
              autoComplete="off"
              disabled={busy}
              aria-invalid={Boolean(errors.jobTitle)}
              aria-describedby={errors.jobTitle ? 'employee-contract-title-error' : undefined}
              {...form.register('jobTitle')}
            />
          </Field>
        </div>
        {errors.root?.server && (
          <p
            data-testid="employee-job-position-error"
            role="alert"
            className="mt-4 rounded-md border border-destructive/30 p-3 text-sm text-destructive"
          >
            {errors.root.server.message}
          </p>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="employee-job-position-save" disabled={busy}>
            {busy ? 'Se salvează…' : 'Salvează'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
