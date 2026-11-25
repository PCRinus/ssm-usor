import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { Notice } from '@ssm-usor/ui/components/notice';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  type EmployeeResponse,
  getGetDutiesAcknowledgementQueryKey,
  getGetEmployeeQueryKey,
  getListEmployeesQueryKey,
  getListJobPositionsQueryKey,
  useUpdateEmployeeJobPosition,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { useHoldOpen } from '@/components/close-guard';
import { FormDialog } from '@/components/form-dialog';
import { Field } from '@/components/form-field';
import { HelpLink } from '@/components/help-link';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { JobPositionCombobox } from '@/features/job-positions/job-position-combobox';
import { commonFailure } from '@/lib/api-errors';

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
  employee,
  onClose,
}: {
  clientId: string;
  employee: Employee | null;
  onClose: () => void;
}) {
  return (
    <FormDialog open={employee !== null} onClose={onClose}>
      {employee && (
        <Form key={employee.id} clientId={clientId} employee={employee} onClose={onClose} />
      )}
    </FormDialog>
  );
}

function Form({
  clientId,
  employee,
  onClose,
}: {
  clientId: string;
  employee: Employee;
  onClose: () => void;
}) {
  const { request, queryClient } = useApi();
  const move = useUpdateEmployeeJobPosition({ request });
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { jobPosition: employee.jobPosition.id, jobTitle: employee.jobTitle },
  });
  const formRef = useRevealErrors(form);
  const { errors } = form.formState;
  const busy = move.isPending;
  useHoldOpen(busy);

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
        queryClient.invalidateQueries({
          queryKey: getGetDutiesAcknowledgementQueryKey(clientId, employee.id),
        }),
      ]);
      toast.success('Postul de lucru a fost schimbat.');
      onClose();
    } catch (cause) {
      form.setError('root.server', {
        message:
          cause instanceof ApiHttpError && cause.status === 400
            ? 'Postul ales nu mai există la acest client. Alege altul.'
            : cause instanceof ApiHttpError && cause.status === 404
              ? 'Lucrătorul nu mai există la acest client.'
              : (commonFailure(cause) ??
                'Nu am putut schimba postul de lucru. Verifică conexiunea și încearcă din nou.'),
      });
    }
  });

  return (
    <DialogContent
      data-testid="employee-job-position-dialog"
      className="sm:max-w-xl"
      showCloseButton={!busy}
    >
      <form ref={formRef} onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>Schimbă postul de lucru</DialogTitle>
          <DialogDescription>
            Funcția urmează postul doar dacă avea aceeași denumire.{' '}
            <HelpLink topic="angajati.schimbare-post">Află mai mult</HelpLink>
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
