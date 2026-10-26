import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import type { ComponentProps } from 'react';
import { Controller, type FieldError, type UseFormReturn, useFormState } from 'react-hook-form';

import { Field } from '@/components/form-field';
import { HelpLink } from '@/components/help-link';
import { Notice } from '@/components/notice';

import { AnafLookupButton } from './anaf-lookup-button';
import { CaenCombobox } from './caen-combobox';
import { clientErrorHelp, type ClientFormValues } from './client-form-schema';
import { CountyCombobox } from './county-combobox';
import type { LookupState } from './use-company-lookup';

type ClientForm = UseFormReturn<ClientFormValues>;

const describedBy = (id: string, error: unknown, hint?: boolean) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

function inputProps(
  name: keyof ClientFormValues,
  error: FieldError | undefined,
  busy: boolean,
  hint?: boolean
): Partial<ComponentProps<'input'>> {
  return {
    disabled: busy,
    'aria-invalid': Boolean(error),
    'aria-describedby': describedBy(name, error, hint),
  };
}

export function IdentificationFields({
  form,
  busy,
  lookup,
  onLookup,
  autoFocus = false,
}: {
  form: ClientForm;
  busy: boolean;
  lookup: LookupState;
  onLookup: () => void;
  autoFocus?: boolean;
}) {
  const { errors } = useFormState({ control: form.control });
  return (
    <>
      <Field
        id="cui"
        label="CUI"
        mark="required"
        hint="Cu sau fără prefixul RO, de exemplu RO1590082."
        help="clienti.cui"
        error={errors.cui}
        errorHelp={clientErrorHelp(errors.cui)}
        className="sm:col-span-2"
      >
        <div className="flex flex-wrap gap-2">
          <Input
            id="cui"
            data-testid="client-cui"
            className="h-11 max-w-xs"
            {...form.register('cui')}
            inputMode="numeric"
            autoComplete="off"
            autoFocus={autoFocus}
            required
            {...inputProps('cui', errors.cui, busy, true)}
          />
          <AnafLookupButton
            testId="client-lookup"
            loading={lookup.status === 'loading'}
            disabled={busy}
            onClick={onLookup}
          />
        </div>
      </Field>
      {lookup.status === 'done' && (
        <Notice
          variant={lookup.inactive ? 'warning' : 'success'}
          data-testid="client-lookup-status"
          className="sm:col-span-2"
        >
          {lookup.message}
          {lookup.inactive && (
            <>
              {' '}
              <HelpLink topic="clienti.firma-inactiva">Află mai mult</HelpLink>
            </>
          )}
        </Notice>
      )}
      {lookup.status === 'error' && (
        <Notice
          variant="warning"
          role="alert"
          data-testid="client-lookup-status"
          className="sm:col-span-2"
        >
          {lookup.message}
        </Notice>
      )}
      <Field
        id="legalName"
        label="Denumire"
        mark="required"
        help="clienti.denumire"
        error={errors.legalName}
        className="sm:col-span-2"
      >
        <Input
          id="legalName"
          data-testid="client-legal-name"
          className="h-11"
          {...form.register('legalName')}
          autoComplete="organization"
          required
          {...inputProps('legalName', errors.legalName, busy)}
        />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Controller
          control={form.control}
          name="vatPayer"
          render={({ field }) => (
            <Checkbox
              id="vatPayer"
              data-testid="client-vat-payer"
              checked={field.value}
              disabled={busy}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              onBlur={field.onBlur}
            />
          )}
        />
        <Label htmlFor="vatPayer">Plătitor de TVA</Label>
        <HelpLink topic="clienti.tva" label="Ajutor: Plătitor de TVA" className="-ml-2" />
      </div>
    </>
  );
}

export function RegistrationFields({ form, busy }: { form: ClientForm; busy: boolean }) {
  const { errors } = useFormState({ control: form.control });
  return (
    <>
      <Field
        id="caenCode"
        label="Cod CAEN"
        mark="optional"
        hint="Caută după cod sau după cuvinte din denumirea activității."
        help="clienti.caen"
        error={errors.caenCode}
      >
        <Controller
          control={form.control}
          name="caenCode"
          render={({ field }) => (
            <CaenCombobox
              id="caenCode"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              disabled={busy}
              invalid={Boolean(errors.caenCode)}
              describedBy={describedBy('caenCode', errors.caenCode, true)}
            />
          )}
        />
      </Field>
      <Field
        id="tradeRegisterNumber"
        label="Nr. Registrul Comerțului"
        mark="optional"
        hint="De exemplu J40/1234/2020."
        help="clienti.registrul-comertului"
        error={errors.tradeRegisterNumber}
      >
        <Input
          id="tradeRegisterNumber"
          data-testid="client-trade-register"
          className="h-11"
          {...form.register('tradeRegisterNumber')}
          {...inputProps('tradeRegisterNumber', errors.tradeRegisterNumber, busy, true)}
        />
      </Field>
    </>
  );
}

export function RegisteredOfficeFields({ form, busy }: { form: ClientForm; busy: boolean }) {
  const { errors } = useFormState({ control: form.control });
  return (
    <>
      <Field
        id="countyCode"
        label="Județ"
        mark="optional"
        help="clienti.sediu-social"
        error={errors.countyCode}
      >
        <Controller
          control={form.control}
          name="countyCode"
          render={({ field }) => (
            <CountyCombobox
              id="countyCode"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              disabled={busy}
              invalid={Boolean(errors.countyCode)}
              describedBy={describedBy('countyCode', errors.countyCode)}
            />
          )}
        />
      </Field>
      <Field
        id="locality"
        label="Localitate"
        mark="optional"
        help="clienti.sediu-social"
        error={errors.locality}
      >
        <Input
          id="locality"
          data-testid="client-locality"
          className="h-11"
          {...form.register('locality')}
          autoComplete="address-level2"
          {...inputProps('locality', errors.locality, busy)}
        />
      </Field>
      <Field
        id="addressLine"
        label="Adresă"
        mark="optional"
        help="clienti.sediu-social"
        error={errors.addressLine}
        className="sm:col-span-2"
      >
        <Input
          id="addressLine"
          data-testid="client-address"
          className="h-11"
          {...form.register('addressLine')}
          autoComplete="street-address"
          {...inputProps('addressLine', errors.addressLine, busy)}
        />
      </Field>
    </>
  );
}

export function ContactFields({
  form,
  busy,
  autoFocus = false,
}: {
  form: ClientForm;
  busy: boolean;
  autoFocus?: boolean;
}) {
  const { errors } = useFormState({ control: form.control });
  return (
    <>
      <Field
        id="contactName"
        label="Nume"
        mark="optional"
        help="detalii.persoana-de-contact"
        error={errors.contactName}
        className="sm:col-span-2"
      >
        <Input
          id="contactName"
          data-testid="client-contact-name"
          className="h-11"
          {...form.register('contactName')}
          autoComplete="off"
          autoFocus={autoFocus}
          {...inputProps('contactName', errors.contactName, busy)}
        />
      </Field>
      <Field
        id="contactEmail"
        label="Email"
        mark="optional"
        help="detalii.contact-email"
        error={errors.contactEmail}
      >
        <Input
          id="contactEmail"
          type="email"
          data-testid="client-contact-email"
          className="h-11"
          {...form.register('contactEmail')}
          autoComplete="off"
          {...inputProps('contactEmail', errors.contactEmail, busy)}
        />
      </Field>
      <Field
        id="contactPhone"
        label="Telefon"
        mark="optional"
        help="detalii.contact-telefon"
        error={errors.contactPhone}
      >
        <Input
          id="contactPhone"
          type="tel"
          data-testid="client-contact-phone"
          className="h-11"
          {...form.register('contactPhone')}
          autoComplete="off"
          {...inputProps('contactPhone', errors.contactPhone, busy)}
        />
      </Field>
    </>
  );
}
