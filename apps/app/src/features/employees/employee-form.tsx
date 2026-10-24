import { bloodGroups, formatEmployeeName, rhFactors } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { Link } from '@tanstack/react-router';
import { Controller } from 'react-hook-form';

import { DatePicker } from '@/components/date-picker';
import { Field } from '@/components/form-field';
import { FormSection } from '@/components/form-section';
import { Notice } from '@/components/notice';
import { PhoneInput } from '@/components/phone-input';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { useAuth } from '@/features/auth/auth-context';
import { JobPositionCombobox } from '@/features/job-positions/job-position-combobox';
import { type EmployeeFocus, useFocusRequest } from '@/features/missing-data/focus';

import { type Employee, employeeErrorHelp, type EmployeeFormValues } from './employee-form-schema';
import { todayIso } from './employee-format';
import { EmployeeWorkplaceCombobox } from './employee-workplace-combobox';
import { useEmployeeForm } from './use-employee-form';

const describedBy = (id: string, error: unknown, hint?: boolean) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

// The employee form, for adding a person and for correcting what was entered about one. Whether
// they still work there is not here: that is a status change, on their page.
export function EmployeeForm({
  clientId,
  clientName,
  employee,
  focus,
}: {
  clientId: string;
  clientName: string;
  /** The person being corrected; left out, a new one is added. */
  employee?: Employee;
  focus?: EmployeeFocus;
}) {
  const { session } = useAuth();
  // The shell renders this only for a signed-in user.
  const userId = session?.user.id ?? '';
  const { form, onSubmit, prefillBirthDate, choosePosition, workplaces, isSaving } =
    useEmployeeForm(clientId, employee);
  const formRef = useRevealErrors(form);
  // The workplace picker stays disabled, and so cannot take the focus, until its list loads.
  useFocusRequest(focus !== undefined, {
    ready: focus !== 'workplace' || workplaces !== undefined,
    field: focus === 'workplace' ? 'workplaceId' : 'commuteRoute',
  });
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
        ref={formRef}
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
                ? 'Angajatorul acestui angajat nu poate fi schimbat.'
                : 'Pentru alt angajator, revino la lista de clienți.'
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

          <FormSection title="Identificare" description="Numele din actul de identitate.">
            <Field
              id="lastName"
              label="Nume"
              mark="required"
              help="angajati.nume"
              error={errors.lastName}
            >
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
            <Field
              id="firstName"
              label="Prenume"
              mark="required"
              help="angajati.nume"
              error={errors.firstName}
            >
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
              hint="13 cifre."
              help="angajati.cnp"
              error={errors.cnp}
              errorHelp={employeeErrorHelp(errors.cnp)}
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
              help="angajati.marca"
              error={errors.employeeNumber}
              errorHelp={employeeErrorHelp(errors.employeeNumber)}
            >
              <Input
                id="employeeNumber"
                data-testid="employee-number"
                className="h-11"
                {...register('employeeNumber')}
                autoComplete="off"
                {...control('employeeNumber')}
              />
            </Field>
          </FormSection>

          <FormSection title="Angajare" help="angajati.termen-instruire">
            <Field
              id="jobPosition"
              label="Post de lucru"
              mark="required"
              help="angajati.post-de-lucru"
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
                    describedBy={describedBy('jobPosition', errors.jobPosition)}
                  />
                )}
              />
            </Field>
            <Field
              id="jobTitle"
              label="Funcția din contract"
              mark="required"
              hint="Ca în contractul de muncă."
              help="angajati.functia-din-contract"
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
              id="contractNumber"
              label="Nr. contractului individual de muncă"
              mark="optional"
              hint="De exemplu 125/2024."
              help="angajati.numar-contract"
              error={errors.contractNumber}
            >
              <Input
                id="contractNumber"
                data-testid="employee-contract-number"
                className="h-11"
                {...register('contractNumber')}
                autoComplete="off"
                {...control('contractNumber', true)}
              />
            </Field>
            <Field
              id="hiredAt"
              label="Data angajării"
              mark="required"
              hint="zz.ll.aaaa, ca în contract."
              help="angajati.data-angajarii"
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
            description="Pentru portal și codurile de semnare."
            help="angajati.contact"
          >
            <Field
              id="email"
              label="Email"
              mark="optional"
              help="angajati.email"
              error={errors.email}
            >
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
            <Field
              id="phone"
              label="Telefon"
              mark="optional"
              help="angajati.telefon"
              error={errors.phone}
            >
              <Controller
                control={formControl}
                name="phone"
                render={({ field }) => (
                  <PhoneInput
                    id="phone"
                    data-testid="employee-phone"
                    ref={field.ref}
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    autoComplete="off"
                    {...control('phone')}
                  />
                )}
              />
            </Field>
          </FormSection>

          <FormSection
            title="Fișa de instruire"
            description="Opționale; apar pe fișa de instruire."
            help="angajati.date-fisa"
          >
            <Field
              id="workplaceId"
              label="Punct de lucru"
              mark="optional"
              help="angajati.punct-de-lucru"
              error={errors.workplaceId}
              className="sm:col-span-2"
            >
              <Controller
                control={formControl}
                name="workplaceId"
                render={({ field }) => (
                  <EmployeeWorkplaceCombobox
                    id="workplaceId"
                    testId="employee-workplace"
                    clientId={clientId}
                    workplaces={workplaces}
                    current={employee?.workplace ?? null}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    disabled={isSaving}
                    invalid={Boolean(errors.workplaceId)}
                    describedBy={describedBy('workplaceId', errors.workplaceId)}
                  />
                )}
              />
            </Field>
            <Field
              id="birthDate"
              label="Data nașterii"
              mark="optional"
              help="angajati.data-nasterii"
              error={errors.birthDate}
              errorHelp={employeeErrorHelp(errors.birthDate)}
            >
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
            <Field
              id="birthPlace"
              label="Locul nașterii"
              mark="optional"
              help="angajati.domiciliu"
              error={errors.birthPlace}
            >
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
              help="angajati.domiciliu"
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
              help="angajati.grupa-sanguina"
              error={errors.bloodGroup}
            >
              <NativeSelect
                id="bloodGroup"
                data-testid="employee-blood-group"
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
              help="angajati.grupa-sanguina"
              error={errors.rhFactor}
            >
              <NativeSelect
                id="rhFactor"
                data-testid="employee-rh-factor"
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
              id="qualification"
              label="Calificarea"
              mark="optional"
              help="angajati.calificare"
              error={errors.qualification}
            >
              <Input
                id="qualification"
                data-testid="employee-qualification"
                className="h-11"
                placeholder="de exemplu, electrician, contabil"
                {...register('qualification')}
                autoComplete="off"
                {...control('qualification')}
              />
            </Field>
            <Field
              id="education"
              label="Studiile"
              mark="optional"
              help="angajati.calificare"
              error={errors.education}
            >
              <Input
                id="education"
                data-testid="employee-education"
                className="h-11"
                placeholder="de exemplu, medii, superioare tehnice"
                {...register('education')}
                autoComplete="off"
                {...control('education')}
              />
            </Field>
            <Field
              id="authorizations"
              label="Autorizații"
              mark="optional"
              hint="De exemplu ISCIR, electrician autorizat ANRE."
              help="angajati.autorizatii"
              error={errors.authorizations}
              className="sm:col-span-2"
            >
              <Input
                id="authorizations"
                data-testid="employee-authorizations"
                className="h-11"
                {...register('authorizations')}
                autoComplete="off"
                {...control('authorizations', true)}
              />
            </Field>
            <Field
              id="commuteRoute"
              label="Traseul de deplasare"
              mark="optional"
              hint="De acasă la locul de muncă, cu mijlocul de transport."
              help="angajati.traseu"
              error={errors.commuteRoute}
              className="sm:col-span-2"
            >
              <Textarea
                id="commuteRoute"
                data-testid="employee-commute-route"
                rows={3}
                {...register('commuteRoute')}
                disabled={isSaving}
                aria-invalid={Boolean(errors.commuteRoute)}
                aria-describedby={describedBy('commuteRoute', errors.commuteRoute, true)}
              />
            </Field>
            <Field
              id="commuteMinutes"
              label="Durata deplasării (minute)"
              mark="optional"
              help="angajati.durata-deplasarii"
              error={errors.commuteMinutes}
            >
              <Input
                id="commuteMinutes"
                data-testid="employee-commute-minutes"
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                step={1}
                className="h-11"
                {...register('commuteMinutes')}
                autoComplete="off"
                {...control('commuteMinutes')}
              />
            </Field>
            <Field
              id="notes"
              label="Observații"
              mark="optional"
              help="angajati.observatii"
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
