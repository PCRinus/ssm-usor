import { zodResolver } from '@hookform/resolvers/zod';
import { responsiblePersonConflictReasons } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
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
import { Controller, useForm, useWatch } from 'react-hook-form';

import {
  type ApiErrorResponse,
  getGetClientDocumentDetailsQueryKey,
  getListResponsiblePersonsQueryKey,
  useCreateResponsiblePerson,
  useGetClientDocumentDetails,
  useUpdateResponsiblePerson,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { Field, FieldMessage } from '../components/form-field';
import { Notice } from '../components/notice';
import { EmployeeCombobox } from './employee-combobox';
import {
  emptyResponsiblePersonForm,
  type ResponsiblePerson,
  responsiblePersonFormSchema,
  type ResponsiblePersonFormValues,
  responsibleRoleLabels,
  responsibleRoleOrder,
  toResponsiblePersonForm,
  toResponsiblePersonRequest,
} from './responsible-person-schema';

// `null` is closed, 'new' adds a person, and a person edits them.
export type ResponsiblePersonEditing = ResponsiblePerson | 'new' | null;

export function ResponsiblePersonDialog({
  clientId,
  userId,
  editing,
  onClose,
}: {
  clientId: string;
  userId: string;
  editing: ResponsiblePersonEditing;
  onClose: () => void;
}) {
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      {editing && (
        <ResponsiblePersonForm
          key={editing === 'new' ? 'new' : editing.id}
          clientId={clientId}
          userId={userId}
          person={editing === 'new' ? null : editing}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function ResponsiblePersonForm({
  clientId,
  userId,
  person,
  onClose,
}: {
  clientId: string;
  userId: string;
  person: ResponsiblePerson | null;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const create = useCreateResponsiblePerson({ request: apiRequest });
  const update = useUpdateResponsiblePerson({ request: apiRequest });
  // The page shows the legal representative from the same query, so it is already loaded.
  const details = useGetClientDocumentDetails(clientId, {
    request: apiRequest,
    query: { queryKey: [...getGetClientDocumentDetailsQueryKey(clientId), userId] },
  });
  const form = useForm<ResponsiblePersonFormValues>({
    resolver: zodResolver(responsiblePersonFormSchema),
    defaultValues: person ? toResponsiblePersonForm(person) : emptyResponsiblePersonForm,
  });
  const { errors } = form.formState;
  const busy = create.isPending || update.isPending;
  const contractTitle = person?.employeeJobTitle;
  const typedTitle = useWatch({ control: form.control, name: 'jobTitle' });
  const contractTitleHint =
    contractTitle && contractTitle !== typedTitle.trim()
      ? `În contractul angajatului este acum „${contractTitle}”.`
      : undefined;

  const onSubmit = form.handleSubmit(async (values) => {
    const data = toResponsiblePersonRequest(values);
    try {
      if (person) {
        await update.mutateAsync({ clientId, responsiblePersonId: person.id, data });
      } else {
        await create.mutateAsync({ clientId, data });
      }
      await queryClient.invalidateQueries({
        queryKey: getListResponsiblePersonsQueryKey(clientId),
      });
      toast.success(person ? 'Persoana a fost salvată.' : 'Persoana a fost adăugată.');
      onClose();
    } catch (cause) {
      const status = cause instanceof ApiHttpError ? cause.status : null;
      const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
      if (
        status === 409 &&
        body?.reason === responsiblePersonConflictReasons.workersRepresentativeIsLegalRepresentative
      ) {
        const legalRepresentative = details.data?.documentDetails.legalRepresentativeName;
        form.setError('roles', {
          message: legalRepresentative
            ? `„${values.fullName.trim()}” are același nume ca reprezentantul legal al clientului, „${legalRepresentative}”, și nu poate fi și reprezentantul lucrătorilor.`
            : `${values.fullName.trim()} este reprezentantul legal al clientului și nu poate fi și reprezentantul lucrătorilor.`,
        });
        return;
      }
      if (status === 409) {
        form.setError('employeeId', {
          message: 'Angajatul este deja în listă. Modifică responsabilitățile lui de acolo.',
        });
        return;
      }
      if (status === 400 && body?.issues?.some((issue) => issue.path === 'employeeId')) {
        form.setError('employeeId', { message: 'Angajatul nu aparține acestui client.' });
        return;
      }
      form.setError('root.server', {
        message:
          status === 404
            ? 'Persoana nu mai există la acest client.'
            : status === 401
              ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
              : 'Nu am putut salva persoana. Verifică conexiunea și încearcă din nou.',
      });
    }
  });

  return (
    <DialogContent data-testid="responsible-dialog" className="sm:max-w-2xl">
      <form onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>
            {person ? 'Modifică persoana responsabilă' : 'Adaugă o persoană responsabilă'}
          </DialogTitle>
          <DialogDescription>
            Deciziile o numesc cu numele și funcția de mai jos. Aceeași persoană poate avea mai
            multe responsabilități.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field
            id="responsible-employee"
            label="Angajat"
            mark="optional"
            hint="Completează numele și funcția. Administratorul poate fi adăugat fără a fi angajat."
            error={errors.employeeId}
            className="sm:col-span-2"
          >
            <Controller
              control={form.control}
              name="employeeId"
              render={({ field }) => (
                <EmployeeCombobox
                  id="responsible-employee"
                  clientId={clientId}
                  userId={userId}
                  value={field.value}
                  disabled={busy}
                  invalid={Boolean(errors.employeeId)}
                  describedBy={
                    errors.employeeId ? 'responsible-employee-error' : 'responsible-employee-hint'
                  }
                  onSelect={(employee) => {
                    field.onChange(employee?.id ?? '');
                    form.clearErrors('employeeId');
                    if (!employee) return;
                    // Documents print the first names, then the family name.
                    const fill = { shouldDirty: true, shouldValidate: true };
                    form.setValue('fullName', `${employee.firstName} ${employee.lastName}`, fill);
                    form.setValue('jobTitle', employee.jobTitle, fill);
                  }}
                />
              )}
            />
          </Field>
          <Field
            id="responsible-name"
            label="Nume și prenume"
            mark="required"
            error={errors.fullName}
          >
            <Input
              id="responsible-name"
              data-testid="responsible-name"
              autoComplete="off"
              disabled={busy}
              aria-invalid={Boolean(errors.fullName)}
              aria-describedby={errors.fullName ? 'responsible-name-error' : undefined}
              {...form.register('fullName')}
            />
          </Field>
          <Field
            id="responsible-job-title"
            label="Funcția"
            mark="required"
            hint={contractTitleHint}
            error={errors.jobTitle}
          >
            <Input
              id="responsible-job-title"
              data-testid="responsible-job-title"
              autoComplete="off"
              disabled={busy}
              aria-invalid={Boolean(errors.jobTitle)}
              aria-describedby={
                errors.jobTitle
                  ? 'responsible-job-title-error'
                  : contractTitleHint && 'responsible-job-title-hint'
              }
              {...form.register('jobTitle')}
            />
          </Field>
          <fieldset
            className="grid gap-3 sm:col-span-2"
            aria-describedby={errors.roles ? 'responsible-roles-error' : undefined}
          >
            <legend className="mb-1 text-sm font-medium">Responsabilități</legend>
            <Controller
              control={form.control}
              name="roles"
              render={({ field }) => (
                <>
                  {responsibleRoleOrder.map((role) => {
                    const id = `responsible-role-${role}`;
                    return (
                      <div key={role} className="flex items-start gap-3">
                        <Checkbox
                          id={id}
                          data-testid={id}
                          className="mt-0.5"
                          checked={field.value.includes(role)}
                          disabled={busy}
                          aria-describedby={`${id}-description`}
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked === true
                                ? [...field.value, role]
                                : field.value.filter((item) => item !== role)
                            )
                          }
                        />
                        <div className="grid gap-0.5">
                          <label htmlFor={id} className="text-sm font-medium">
                            {responsibleRoleLabels[role].label}
                          </label>
                          <p id={`${id}-description`} className="text-xs text-muted-foreground">
                            {responsibleRoleLabels[role].description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            />
            <FieldMessage
              id="responsible-roles-error"
              error={errors.roles ? { type: 'manual', message: errors.roles.message } : undefined}
            />
          </fieldset>
        </div>
        {errors.root?.server && (
          <Notice variant="destructive" data-testid="responsible-error" className="mt-4">
            {errors.root.server.message}
          </Notice>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="responsible-save" disabled={busy}>
            {busy ? 'Se salvează…' : person ? 'Salvează' : 'Adaugă'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
