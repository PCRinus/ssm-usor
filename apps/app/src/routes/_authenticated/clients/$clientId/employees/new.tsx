import { bloodGroups, rhFactors } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router';

import { Field } from '../../../../../components/form-field';
import { FormSection } from '../../../../../components/form-section';
import type { EmployeeFormValues } from '../../../../../employees/employee-form-schema';
import { useEmployeeForm } from '../../../../../employees/use-employee-form';

const describedBy = (id: string, error: unknown, hint?: boolean) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

export const Route = createFileRoute('/_authenticated/clients/$clientId/employees/new')({
  staticData: { title: 'Angajat nou', fullPage: true },
  component: NewEmployeePage,
});

export function NewEmployeePage() {
  const { clientId } = Route.useParams();
  const { client } = clientRoute.useLoaderData();
  const { form, onSubmit, prefillBirthDate, isSaving } = useEmployeeForm(clientId);
  const {
    register,
    formState: { errors },
  } = form;
  // Shared attributes for inputs and selects.
  const control = (name: keyof EmployeeFormValues, hint?: boolean) => ({
    disabled: isSaving,
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': describedBy(name, errors[name], hint),
  });

  return (
    <div data-testid="new-employee-page" className="space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Angajat nou</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Se adaugă la <span className="font-medium text-foreground">{client.legalName}</span>.
          Numele, funcția și data angajării sunt suficiente pentru început; restul datelor apar pe
          fișa de instruire și pot fi completate mai târziu.
        </p>
      </div>
      <form
        className="grid gap-6"
        aria-busy={isSaving}
        aria-describedby={errors.root?.server ? 'employee-form-error' : undefined}
        noValidate
        onSubmit={onSubmit}
      >
        <Card className="gap-0 divide-y py-0">
          <FormSection
            title="Identificare"
            description="Așa cum apar în actul de identitate. CNP-ul este opțional și rămâne vizibil doar pe fișa angajatului."
          >
            <Field id="lastName" label="Nume" error={errors.lastName}>
              <Input
                id="lastName"
                data-testid="employee-last-name"
                className="h-11"
                {...register('lastName')}
                autoComplete="off"
                required
                {...control('lastName')}
              />
            </Field>
            <Field id="firstName" label="Prenume" error={errors.firstName}>
              <Input
                id="firstName"
                data-testid="employee-first-name"
                className="h-11"
                {...register('firstName')}
                autoComplete="off"
                required
                {...control('firstName')}
              />
            </Field>
            <Field
              id="cnp"
              label="CNP"
              hint="13 cifre. Completează automat data nașterii."
              error={errors.cnp}
            >
              <Input
                id="cnp"
                data-testid="employee-cnp"
                className="h-11"
                {...register('cnp', { onBlur: prefillBirthDate })}
                inputMode="numeric"
                autoComplete="off"
                {...control('cnp', true)}
              />
            </Field>
            <Field
              id="employeeNumber"
              label="Marca"
              hint="Numărul intern al angajatului la client, dacă există."
              error={errors.employeeNumber}
            >
              <Input
                id="employeeNumber"
                data-testid="employee-number"
                className="h-11"
                {...register('employeeNumber')}
                autoComplete="off"
                {...control('employeeNumber', true)}
              />
            </Field>
          </FormSection>

          <FormSection
            title="Angajare"
            description="Funcția din contract și data de la care curg termenele de instruire."
          >
            <Field id="jobTitle" label="Funcție" error={errors.jobTitle}>
              <Input
                id="jobTitle"
                data-testid="employee-job-title"
                className="h-11"
                {...register('jobTitle')}
                autoComplete="organization-title"
                required
                {...control('jobTitle')}
              />
            </Field>
            <Field id="hiredAt" label="Data angajării" error={errors.hiredAt}>
              <Input
                id="hiredAt"
                data-testid="employee-hired-at"
                type="date"
                className="h-11"
                {...register('hiredAt')}
                required
                {...control('hiredAt')}
              />
            </Field>
          </FormSection>

          <FormSection
            title="Contact"
            description="Pentru invitații la instruiri și semnarea documentelor de la distanță."
          >
            <Field id="email" label="Email" error={errors.email}>
              <Input
                id="email"
                data-testid="employee-email"
                type="email"
                className="h-11"
                {...register('email')}
                autoComplete="off"
                {...control('email')}
              />
            </Field>
            <Field id="phone" label="Telefon" error={errors.phone}>
              <Input
                id="phone"
                data-testid="employee-phone"
                type="tel"
                className="h-11"
                {...register('phone')}
                autoComplete="off"
                {...control('phone')}
              />
            </Field>
          </FormSection>

          <FormSection
            title="Fișa de instruire"
            description="Date tipărite pe fișa individuală de instruire. Toate sunt opționale."
          >
            <Field id="birthDate" label="Data nașterii" error={errors.birthDate}>
              <Input
                id="birthDate"
                data-testid="employee-birth-date"
                type="date"
                className="h-11"
                {...register('birthDate')}
                {...control('birthDate')}
              />
            </Field>
            <Field id="birthPlace" label="Locul nașterii" error={errors.birthPlace}>
              <Input
                id="birthPlace"
                data-testid="employee-birth-place"
                className="h-11"
                {...register('birthPlace')}
                autoComplete="off"
                {...control('birthPlace')}
              />
            </Field>
            <Field
              id="homeAddress"
              label="Domiciliu"
              error={errors.homeAddress}
              className="sm:col-span-2"
            >
              <Input
                id="homeAddress"
                data-testid="employee-home-address"
                className="h-11"
                {...register('homeAddress')}
                autoComplete="off"
                {...control('homeAddress')}
              />
            </Field>
            <Field
              id="bloodGroup"
              label="Grupa sanguină"
              error={errors.bloodGroup}
              className="*:data-[slot=native-select-wrapper]:w-full"
            >
              <NativeSelect
                id="bloodGroup"
                data-testid="employee-blood-group"
                className="h-11"
                {...register('bloodGroup')}
                {...control('bloodGroup')}
              >
                <NativeSelectOption value="">Necunoscută</NativeSelectOption>
                {bloodGroups.map((group) => (
                  <NativeSelectOption key={group} value={group}>
                    {group}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field
              id="rhFactor"
              label="Rh"
              error={errors.rhFactor}
              className="*:data-[slot=native-select-wrapper]:w-full"
            >
              <NativeSelect
                id="rhFactor"
                data-testid="employee-rh-factor"
                className="h-11"
                {...register('rhFactor')}
                {...control('rhFactor')}
              >
                <NativeSelectOption value="">Necunoscut</NativeSelectOption>
                {rhFactors.map((factor) => (
                  <NativeSelectOption key={factor} value={factor}>
                    Rh {factor}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field id="notes" label="Observații" error={errors.notes} className="sm:col-span-2">
              <Textarea
                id="notes"
                data-testid="employee-notes"
                rows={3}
                {...register('notes')}
                disabled={isSaving}
                aria-invalid={Boolean(errors.notes)}
                aria-describedby={describedBy('notes', errors.notes)}
              />
            </Field>
          </FormSection>
        </Card>

        {errors.root?.server && (
          <p
            id="employee-form-error"
            data-testid="employee-form-error"
            role="alert"
            className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"
          >
            {errors.root.server.message}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" className="h-11" data-testid="employee-submit" disabled={isSaving}>
            {isSaving ? 'Se salvează…' : 'Salvează angajatul'}
          </Button>
          <Button asChild type="button" variant="ghost" className="h-11">
            <Link to="/clients/$clientId/employees" params={{ clientId }}>
              Renunță
            </Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
