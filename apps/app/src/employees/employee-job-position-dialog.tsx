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
import { useRef } from 'react';
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
import { Notice } from '../components/notice';
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

// Moves an employee to another of the client's job positions (ADR 006). A post can change
// without a new contract, so a contract title of its own stays. One that only repeats the
// old post's name follows the new post, as it does in the employee form.
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

  const filledTitle = useRef(employee.jobPosition.name);
  function choosePosition(value: string, name: string) {
    form.setValue('jobPosition', value, { shouldDirty: true, shouldValidate: true });
    if (name && form.getValues('jobTitle').trim() === filledTitle.current) {
      filledTitle.current = name;
      form.setValue('jobTitle', name, { shouldDirty: true, shouldValidate: true });
    }
  }

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
    <DialogContent data-testid="employee-job-position-dialog" className="sm:max-w-xl">
      <form onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>Schimbă postul de lucru</DialogTitle>
          <DialogDescription>
            Noul post schimbă riscurile și instruirea. Funcția din contract se actualizează doar
            dacă avea aceeași denumire ca postul vechi. O poți schimba și separat.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-5 grid gap-5">
          <Field
            id="employee-position"
            label="Post de lucru"
            mark="required"
            error={errors.jobPosition}
          >
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
                  onChange={choosePosition}
                  onBlur={field.onBlur}
                  disabled={busy}
                  invalid={Boolean(errors.jobPosition)}
                  describedBy={errors.jobPosition ? 'employee-position-error' : undefined}
                />
              )}
            />
          </Field>
          <Field
            id="employee-contract-title"
            label="Funcția din contract"
            mark="required"
            error={errors.jobTitle}
          >
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
          <Notice variant="destructive" data-testid="employee-job-position-error" className="mt-4">
            {errors.root.server.message}
          </Notice>
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
