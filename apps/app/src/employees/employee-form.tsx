import { bloodGroups, formatEmployeeName, rhFactors } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { Link } from '@tanstack/react-router';
import { Controller } from 'react-hook-form';

import { useAuth } from '../auth/auth-context';
import { DatePicker } from '../components/date-picker';
import { Field } from '../components/form-field';
import { FormSection } from '../components/form-section';
import { Notice } from '../components/notice';
import { JobPositionCombobox } from '../job-positions/job-position-combobox';
import type { Employee, EmployeeFormValues } from './employee-form-schema';
import { todayIso } from './employee-format';
import { useEmployeeForm } from './use-employee-form';

const describedBy = (id: string, error: unknown, hint?: boolean) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

// The employee form, for adding a person and for correcting what was entered about one. Whether
// they still work there is not here: that is a status change, on their page.
export function EmployeeForm({
  clientId,
  clientName,
  employee,
}: {
  clientId: string;
  clientName: string;
  /** The person being corrected; left out, a new one is added. */
  employee?: Employee;
}) {
  const { session } = useAuth();
  // The shell renders this only for a signed-in user.
  const userId = session?.user.id ?? '';
  const { form, onSubmit, prefillBirthDate, choosePosition, isSaving } = useEmployeeForm(
    clientId,
    employee
  );
  const {
    register,
    control: formControl,
    formState: { errors },
  } = form;
  const today = todayIso();
  const control = (name: keyof EmployeeFormValues, hint?: boolean) => ({
    disabled: isSaving,
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': describedBy(name, errors[name], hint),
  });
  // The same, in the date picker's own prop names.
  const dateControl = (name: 'hiredAt' | 'birthDate', hint?: boolean) => ({
    disabled: isSaving,
    invalid: Boolean(errors[name]),
    describedBy: describedBy(name, errors[name], hint),
  });

  return (
    <div data-testid={employee ? 'edit-employee-page' : 'new-employee-page'} className="space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {employee ? `Modifică: ${formatEmployeeName(employee)}` : 'Angajat nou'}
        </h1>
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
            title="Angajator"
            description={
              employee
                ? 'Clientul la care lucrează angajatul. Nu se poate schimba.'
                : 'Clientul la care se adaugă angajatul. Se schimbă din lista de clienți.'
            }
          >
            <Field id="client" label="Client" className="sm:col-span-2">
              <Input
                id="client"
                data-testid="employee-client"
                className="h-11"
                value={clientName}
                readOnly
                disabled
              />
            </Field>
          </FormSection>

          <FormSection
            title="Identificare"
            description="Așa cum apar în actul de identitate. CNP-ul este opțional și rămâne vizibil doar pe fișa angajatului."
          >
            <Field id="lastName" label="Nume" mark="required" error={errors.lastName}>
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
            <Field id="firstName" label="Prenume" mark="required" error={errors.firstName}>
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
              mark="optional"
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
              mark="optional"
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
            description="Postul pe care lucrează, funcția din contract și data de la care curg termenele de instruire."
          >
            <Field
              id="jobPosition"
              label="Post de lucru"
              mark="required"
              hint="Munca pe care o face, cu riscurile și instruirea ei. Dacă postul lipsește din listă, adaugă-l de acolo."
              error={errors.jobPosition}
            >
              <Controller
                control={formControl}
                name="jobPosition"
                render={({ field }) => (
                  <JobPositionCombobox
                    id="jobPosition"
                    testId="employee-job-position"
                    clientId={clientId}
                    userId={userId}
                    value={field.value}
                    onChange={choosePosition}
                    onBlur={field.onBlur}
                    disabled={isSaving}
                    invalid={Boolean(errors.jobPosition)}
                    describedBy={describedBy('jobPosition', errors.jobPosition, true)}
                  />
                )}
              />
            </Field>
            <Field
              id="jobTitle"
              label="Funcția din contract"
              mark="required"
              hint="Se completează după post. Schimb-o dacă în contract scrie altfel."
              error={errors.jobTitle}
            >
              <Input
                id="jobTitle"
                data-testid="employee-job-title"
                className="h-11"
                {...register('jobTitle')}
                autoComplete="organization-title"
                required
                {...control('jobTitle', true)}
              />
            </Field>
            <Field
              id="hiredAt"
              label="Data angajării"
              mark="required"
              hint="Ziua din contract, în formatul zz.ll.aaaa."
              error={errors.hiredAt}
            >
              <Controller
                control={formControl}
                name="hiredAt"
                render={({ field }) => (
                  <DatePicker
                    id="hiredAt"
                    testId="employee-hired-at"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    required
                    {...dateControl('hiredAt', true)}
                  />
                )}
              />
            </Field>
          </FormSection>

          <FormSection
            title="Contact"
            description="Pentru invitații la instruiri și semnarea documentelor de la distanță."
          >
            <Field id="email" label="Email" mark="optional" error={errors.email}>
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
            <Field id="phone" label="Telefon" mark="optional" error={errors.phone}>
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
            <Field id="birthDate" label="Data nașterii" mark="optional" error={errors.birthDate}>
              <Controller
                control={formControl}
                name="birthDate"
                render={({ field }) => (
                  <DatePicker
                    id="birthDate"
                    testId="employee-birth-date"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    max={today}
                    {...dateControl('birthDate')}
                  />
                )}
              />
            </Field>
            <Field id="birthPlace" label="Locul nașterii" mark="optional" error={errors.birthPlace}>
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
              mark="optional"
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
              mark="optional"
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
              mark="optional"
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
            <Field
              id="notes"
              label="Observații"
              mark="optional"
              error={errors.notes}
              className="sm:col-span-2"
            >
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
          <Notice variant="destructive" id="employee-form-error" data-testid="employee-form-error">
            {errors.root.server.message}
          </Notice>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" className="h-11" data-testid="employee-submit" disabled={isSaving}>
            {isSaving ? 'Se salvează…' : employee ? 'Salvează modificările' : 'Salvează angajatul'}
          </Button>
          <Button asChild type="button" variant="ghost" className="h-11">
            {employee ? (
              <Link
                to="/clients/$clientId/employees/$employeeId"
                params={{ clientId, employeeId: employee.id }}
              >
                Renunță
              </Link>
            ) : (
              <Link to="/clients/$clientId/employees" params={{ clientId }}>
                Renunță
              </Link>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
