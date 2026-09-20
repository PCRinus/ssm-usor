import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Controller } from 'react-hook-form';

import { CaenCombobox } from '../../../clients/caen-combobox';
import { CountyCombobox } from '../../../clients/county-combobox';
import { useClientForm } from '../../../clients/use-client-form';
import { Field } from '../../../components/form-field';
import { FormSection } from '../../../components/form-section';

const describedBy = (id: string, error: unknown, hint?: boolean) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

export const Route = createFileRoute('/_authenticated/clients/new')({
  staticData: { title: 'Client nou' },
  component: NewClientPage,
});

export function NewClientPage() {
  const { form, onSubmit, lookup, lookupCui, isSaving } = useClientForm();
  const {
    register,
    control,
    formState: { errors },
  } = form;
  const busy = isSaving || lookup.status === 'loading';
  const input = (name: keyof typeof errors, hint?: boolean): Partial<ComponentProps<'input'>> => ({
    disabled: busy,
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': describedBy(name, errors[name], hint),
  });

  return (
    <div data-testid="new-client-page" className="space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Client nou</h1>
      </div>
      <form
        className="grid gap-6"
        aria-busy={busy}
        aria-describedby={errors.root?.server ? 'client-form-error' : undefined}
        noValidate
        onSubmit={onSubmit}
      >
        <Card className="gap-0 divide-y py-0">
          <FormSection
            title="Identificare"
            description="Codul fiscal aduce restul datelor publice; denumirea rămâne editabilă."
          >
            <Field
              id="cui"
              label="CUI"
              mark="required"
              hint="Cu sau fără prefixul RO, de exemplu RO1590082."
              error={errors.cui}
              className="sm:col-span-2"
            >
              <div className="flex flex-wrap gap-2">
                <Input
                  id="cui"
                  data-testid="client-cui"
                  className="h-11 max-w-xs"
                  {...register('cui')}
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  {...input('cui', true)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  data-testid="client-lookup"
                  disabled={busy}
                  onClick={() => void lookupCui()}
                >
                  <Search aria-hidden="true" />
                  {lookup.status === 'loading' ? 'Se caută…' : 'Caută la ANAF'}
                </Button>
              </div>
            </Field>
            {lookup.status === 'done' && (
              <p
                data-testid="client-lookup-status"
                role="status"
                className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm sm:col-span-2"
              >
                {lookup.message}
              </p>
            )}
            {lookup.status === 'error' && (
              <p
                data-testid="client-lookup-status"
                role="alert"
                className="rounded-md border border-destructive/30 p-3 text-sm text-destructive sm:col-span-2"
              >
                {lookup.message}
              </p>
            )}
            <Field
              id="legalName"
              label="Denumire"
              mark="required"
              error={errors.legalName}
              className="sm:col-span-2"
            >
              <Input
                id="legalName"
                data-testid="client-legal-name"
                className="h-11"
                {...register('legalName')}
                autoComplete="organization"
                required
                {...input('legalName')}
              />
            </Field>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Controller
                control={control}
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
            </div>
          </FormSection>

          <FormSection
            title="Înregistrare"
            description="Activitatea principală și numărul din Registrul Comerțului, așa cum apar în acte."
          >
            <Field
              id="caenCode"
              label="Cod CAEN"
              mark="optional"
              hint="Caută după cod sau după cuvinte din denumirea activității."
              error={errors.caenCode}
            >
              <Controller
                control={control}
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
              error={errors.tradeRegisterNumber}
            >
              <Input
                id="tradeRegisterNumber"
                data-testid="client-trade-register"
                className="h-11"
                {...register('tradeRegisterNumber')}
                {...input('tradeRegisterNumber', true)}
              />
            </Field>
          </FormSection>

          <FormSection
            title="Sediu social"
            description="Adresa înregistrată a companiei. Punctele de lucru se adaugă separat."
          >
            <Field id="countyCode" label="Județ" mark="optional" error={errors.countyCode}>
              <Controller
                control={control}
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
            <Field id="locality" label="Localitate" mark="optional" error={errors.locality}>
              <Input
                id="locality"
                data-testid="client-locality"
                className="h-11"
                {...register('locality')}
                autoComplete="address-level2"
                {...input('locality')}
              />
            </Field>
            <Field
              id="addressLine"
              label="Adresă"
              mark="optional"
              error={errors.addressLine}
              className="sm:col-span-2"
            >
              <Input
                id="addressLine"
                data-testid="client-address"
                className="h-11"
                {...register('addressLine')}
                autoComplete="street-address"
                {...input('addressLine')}
              />
            </Field>
          </FormSection>

          <FormSection
            title="Alte informații"
            description="Date pe care ANAF nu le oferă și pe care le poți actualiza oricând."
          >
            <Field
              id="legalRepresentativeName"
              label="Reprezentant legal"
              mark="optional"
              hint="Numele și prenumele, așa cum apar în decizii."
              error={errors.legalRepresentativeName}
            >
              <Input
                id="legalRepresentativeName"
                data-testid="client-representative"
                className="h-11"
                {...register('legalRepresentativeName')}
                autoComplete="off"
                {...input('legalRepresentativeName', true)}
              />
            </Field>
            <Field
              id="declaredEmployeeCount"
              label="Număr de angajați"
              mark="optional"
              hint="Numărul declarat la preluare; îl vei putea actualiza."
              error={errors.declaredEmployeeCount}
            >
              <Input
                id="declaredEmployeeCount"
                data-testid="client-employees"
                className="h-11"
                {...register('declaredEmployeeCount')}
                inputMode="numeric"
                {...input('declaredEmployeeCount', true)}
              />
            </Field>
          </FormSection>
        </Card>

        {errors.root?.server && (
          <p
            id="client-form-error"
            data-testid="client-form-error"
            role="alert"
            className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"
          >
            {errors.root.server.message}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" className="h-11" data-testid="client-submit" disabled={busy}>
            {isSaving ? 'Se salvează…' : 'Salvează clientul'}
          </Button>
          <Button asChild type="button" variant="ghost" className="h-11">
            <Link to="/clients">Renunță</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
