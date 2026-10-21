import { formatEmployeeName, maxPageSize, samePersonName } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Input } from '@ssm-usor/ui/components/input';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useRouteContext } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { Controller, useWatch } from 'react-hook-form';

import { getListEmployeesQueryKey, useListEmployees } from '@/api/generated/api';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { EditAction, Fact, FactList, FormActions, SectionCard } from '@/components/section-card';
import { useInPlaceEdit } from '@/components/use-in-place-edit';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { type LegalRepresentativeFocus, useFocusRequest } from '@/features/missing-data/focus';
import { EmployeeCombobox } from '@/features/training/employee-combobox';
import {
  type ClientSummary,
  describedBy,
  type DocumentDetails,
  useDocumentDetails,
  useDocumentDetailsForm,
} from '@/features/training/use-document-details-form';

const fields = [
  'legalRepresentativeName',
  'legalRepresentativeRole',
  'legalRepresentativeIsEmployee',
  'legalRepresentativeEmployeeId',
] as const;

const listParams = { page: 1, pageSize: maxPageSize, sort: 'name', order: 'asc' } as const;

export function LegalRepresentativeCard({
  client,
  userId,
  focus,
}: {
  client: ClientSummary;
  userId: string;
  focus?: LegalRepresentativeFocus;
}) {
  const details = useDocumentDetails(client.id, userId);
  const { editing, editRef, open, close } = useInPlaceEdit();
  const readOnly = client.archivedAt !== null;
  const saved = details.data?.documentDetails;
  const empty = !saved?.legalRepresentativeName && !saved?.legalRepresentativeRole;
  useFocusRequest(focus !== undefined, {
    ready: !details.isPending,
    anchor: () => editRef.current,
    open: readOnly ? undefined : open,
    field:
      readOnly || !saved
        ? undefined
        : focus === 'legal-representative-role'
          ? 'details-representative-role'
          : 'details-representative-name',
  });

  return (
    <SectionCard
      data-testid="legal-representative-card"
      title="Reprezentant legal"
      description="Numele și funcția vor apărea în deciziile generate."
      action={
        saved &&
        !readOnly &&
        !editing && (
          <EditAction
            ref={editRef}
            empty={empty}
            data-testid="legal-representative-edit"
            onClick={open}
          />
        )
      }
    >
      {details.isPending ? (
        <Skeleton className="h-12 w-full" />
      ) : details.isError ? (
        <Notice
          variant="destructive"
          data-testid="legal-representative-unavailable"
          action={
            <Button
              variant="outline"
              disabled={details.isFetching}
              onClick={() => void details.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca reprezentantul legal.
        </Notice>
      ) : editing && !readOnly ? (
        <LegalRepresentativeForm
          saved={details.data.documentDetails}
          client={client}
          userId={userId}
          onClose={close}
        />
      ) : empty ? (
        <p data-testid="legal-representative-empty" className="text-sm text-muted-foreground">
          Niciun reprezentant legal încă.
        </p>
      ) : (
        <FactList>
          <Fact label="Nume și prenume" testId="legal-representative-name">
            {details.data.documentDetails.legalRepresentativeName}
          </Fact>
          <Fact label="Funcția" testId="legal-representative-role">
            {details.data.documentDetails.legalRepresentativeRole}
          </Fact>
          {details.data.documentDetails.legalRepresentativeEmployee && (
            <Fact label="Și angajat al firmei" testId="legal-representative-employee">
              {formatEmployeeName(details.data.documentDetails.legalRepresentativeEmployee)},{' '}
              {details.data.documentDetails.legalRepresentativeEmployee.jobTitle}
            </Fact>
          )}
        </FactList>
      )}
    </SectionCard>
  );
}

function LegalRepresentativeForm({
  saved,
  client,
  userId,
  onClose,
}: {
  saved: DocumentDetails;
  client: ClientSummary;
  userId: string;
  onClose: () => void;
}) {
  const { form, onSubmit, busy, locked } = useDocumentDetailsForm({
    saved,
    client,
    userId,
    fields,
    successMessage: 'Reprezentantul legal a fost salvat.',
    onSaved: onClose,
  });
  const formRef = useRevealErrors(form);
  const { errors, isDirty } = form.formState;
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const [isEmployee, employeeId, typedName] = useWatch({
    control: form.control,
    name: [
      'legalRepresentativeIsEmployee',
      'legalRepresentativeEmployeeId',
      'legalRepresentativeName',
    ],
  });
  const employees = useListEmployees(client.id, listParams, {
    request: apiRequest,
    query: {
      queryKey: [...getListEmployeesQueryKey(client.id, listParams), userId],
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
      samePersonName(formatEmployeeName(employee), typedName)
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
        hint="Așa cum apar în decizii."
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
            errors.legalRepresentativeName,
            true
          )}
          {...form.register('legalRepresentativeName')}
        />
      </Field>
      <Field
        id="details-representative-role"
        label="Funcția"
        hint="De exemplu „Administrator”."
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
                aria-describedby="details-representative-is-employee-description"
                onCheckedChange={(checked) => {
                  field.onChange(checked === true);
                  if (checked !== true) {
                    form.setValue('legalRepresentativeEmployeeId', '', { shouldDirty: true });
                    form.clearErrors('legalRepresentativeEmployeeId');
                  }
                }}
              />
              <div className="grid gap-0.5">
                <label htmlFor="details-representative-is-employee" className="text-sm font-medium">
                  Administratorul este și angajat al firmei
                </label>
                <p
                  id="details-representative-is-employee-description"
                  className="text-xs text-muted-foreground"
                >
                  Documentele îl numesc o singură dată, nu o dată ca administrator și încă o dată ca
                  angajat.
                </p>
              </div>
            </div>
          )}
        />
        {isEmployee && (
          <Field
            id="details-representative-employee"
            label="Angajatul"
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
                  userId={userId}
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
