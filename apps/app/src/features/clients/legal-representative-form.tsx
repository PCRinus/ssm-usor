import { formatEmployeeName, maxPageSize, samePerson } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Input } from '@ssm-usor/ui/components/input';
import { Notice } from '@ssm-usor/ui/components/notice';
import { useEffect, useRef } from 'react';
import { Controller, useWatch } from 'react-hook-form';

import { getListEmployeesQueryKey, useListEmployees } from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { describedBy } from '@/components/described-by';
import { Field } from '@/components/form-field';
import { HelpLink } from '@/components/help-link';
import { FormActions } from '@/components/section-card';
import { useRevealErrors } from '@/components/use-reveal-errors';
import {
  type ClientSummary,
  type DocumentDetails,
  useDocumentDetailsForm,
} from '@/features/clients/document-details/use-document-details-form';
import { EmployeeCombobox } from '@/features/employees/employee-combobox';

const fields = [
  'legalRepresentativeName',
  'legalRepresentativeRole',
  'legalRepresentativeIsEmployee',
  'legalRepresentativeEmployeeId',
] as const;

const listParams = { page: 1, pageSize: maxPageSize, sort: 'name', order: 'asc' } as const;

export function LegalRepresentativeForm({
  saved,
  client,
  onClose,
}: {
  saved: DocumentDetails;
  client: ClientSummary;
  onClose: () => void;
}) {
  const { form, onSubmit, busy, locked } = useDocumentDetailsForm({
    saved,
    client,
    fields,
    successMessage: 'Reprezentantul legal a fost salvat.',
    onSaved: onClose,
  });
  const formRef = useRevealErrors(form);
  const { errors, isDirty } = form.formState;
  const { request, key } = useApi();
  const [isEmployee, employeeId, typedName] = useWatch({
    control: form.control,
    name: [
      'legalRepresentativeIsEmployee',
      'legalRepresentativeEmployeeId',
      'legalRepresentativeName',
    ],
  });
  const employees = useListEmployees(client.id, listParams, {
    request,
    query: {
      queryKey: key(getListEmployeesQueryKey(client.id, listParams)),
      enabled: isEmployee,
    },
  });
  // Once per tick: a suggestion the user clears is not made again until the box is ticked anew.
  const suggested = useRef(false);
  useEffect(() => {
    if (!isEmployee) {
      suggested.current = false;
      return;
    }
    if (suggested.current || employeeId || !employees.data) return;
    suggested.current = true;
    const matching = employees.data.items.filter((employee) =>
      samePerson(formatEmployeeName(employee), typedName)
    );
    if (matching.length === 1) {
      form.setValue('legalRepresentativeEmployeeId', matching[0]!.id, { shouldDirty: true });
    }
  }, [isEmployee, employeeId, employees.data, typedName, form]);

  return (
    <form
      ref={formRef}
      data-testid="legal-representative-form"
      onSubmit={(event) => void onSubmit(event)}
      aria-busy={busy}
      noValidate
      className="grid gap-5 sm:grid-cols-2"
    >
      <Field
        id="details-representative-name"
        label="Nume și prenume"
        help="detalii.nume-reprezentant"
        error={errors.legalRepresentativeName}
      >
        <Input
          id="details-representative-name"
          data-testid="details-representative-name"
          className="h-11"
          autoComplete="off"
          autoFocus
          disabled={locked}
          aria-invalid={Boolean(errors.legalRepresentativeName)}
          aria-describedby={describedBy(
            'details-representative-name',
            errors.legalRepresentativeName
          )}
          {...form.register('legalRepresentativeName')}
        />
      </Field>
      <Field
        id="details-representative-role"
        label="Funcția"
        hint="De exemplu „Administrator”."
        help="detalii.functia-reprezentantului"
        error={errors.legalRepresentativeRole}
      >
        <Input
          id="details-representative-role"
          data-testid="details-representative-role"
          className="h-11"
          autoComplete="off"
          disabled={locked}
          aria-invalid={Boolean(errors.legalRepresentativeRole)}
          aria-describedby={describedBy(
            'details-representative-role',
            errors.legalRepresentativeRole,
            true
          )}
          {...form.register('legalRepresentativeRole')}
        />
      </Field>
      <div className="grid gap-3 sm:col-span-2">
        <Controller
          control={form.control}
          name="legalRepresentativeIsEmployee"
          render={({ field }) => (
            <div className="flex items-start gap-3">
              <Checkbox
                id="details-representative-is-employee"
                data-testid="details-representative-is-employee"
                className="mt-0.5"
                checked={field.value}
                disabled={locked}
                onCheckedChange={(checked) => {
                  field.onChange(checked === true);
                  if (checked !== true) {
                    form.setValue('legalRepresentativeEmployeeId', '', { shouldDirty: true });
                    form.clearErrors('legalRepresentativeEmployeeId');
                  }
                }}
              />
              <div className="flex items-center gap-1">
                <label htmlFor="details-representative-is-employee" className="text-sm font-medium">
                  Administratorul este și lucrător al firmei
                </label>
                <HelpLink
                  topic="detalii.reprezentant-angajat"
                  label="Ajutor: Administratorul este și lucrător al firmei"
                />
              </div>
            </div>
          )}
        />
        {isEmployee && (
          <Field
            id="details-representative-employee"
            label="Lucrătorul"
            mark="required"
            error={errors.legalRepresentativeEmployeeId}
          >
            <Controller
              control={form.control}
              name="legalRepresentativeEmployeeId"
              render={({ field }) => (
                <EmployeeCombobox
                  id="details-representative-employee"
                  testId="details-representative-employee"
                  clientId={client.id}
                  value={field.value}
                  disabled={locked}
                  invalid={Boolean(errors.legalRepresentativeEmployeeId)}
                  describedBy={
                    errors.legalRepresentativeEmployeeId
                      ? 'details-representative-employee-error'
                      : undefined
                  }
                  onSelect={(employee) => {
                    field.onChange(employee?.id ?? '');
                    form.clearErrors('legalRepresentativeEmployeeId');
                    if (employee && !form.getValues('legalRepresentativeName').trim()) {
                      // Documents print the first names, then the family name.
                      form.setValue(
                        'legalRepresentativeName',
                        `${employee.firstName} ${employee.lastName}`,
                        { shouldDirty: true, shouldValidate: true }
                      );
                    }
                  }}
                />
              )}
            />
          </Field>
        )}
      </div>
      {errors.root?.server && (
        <Notice
          variant="destructive"
          data-testid="legal-representative-error"
          className="sm:col-span-2"
        >
          {errors.root.server.message}
        </Notice>
      )}
      <FormActions>
        <Button type="submit" data-testid="legal-representative-save" disabled={busy || !isDirty}>
          {busy ? 'Se salvează…' : 'Salvează'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          data-testid="legal-representative-cancel"
          disabled={busy}
          onClick={onClose}
        >
          Renunță
        </Button>
      </FormActions>
    </form>
  );
}
