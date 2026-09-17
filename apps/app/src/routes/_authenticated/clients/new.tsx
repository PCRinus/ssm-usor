import { romanianCounties } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Controller } from 'react-hook-form';

import { useClientForm } from '../../../clients/use-client-form';
import { Field } from '../../../components/form-field';

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
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Introdu codul CUI pentru a prelua datele publice de la ANAF, apoi completează restul.
        </p>
      </div>
      <form
        className="grid gap-8"
        aria-busy={busy}
        aria-describedby={errors.root?.server ? 'client-form-error' : undefined}
        noValidate
        onSubmit={onSubmit}
      >
        <Card className="max-w-3xl">
          <CardHeader>
            <h2 className="text-lg font-semibold">Identificare</h2>
          </CardHeader>
          <CardContent className="grid gap-6">
            <Field
              id="cui"
              label="CUI"
              hint="Cu sau fără prefixul RO, de exemplu RO1590082."
              error={errors.cui}
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
                className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"
              >
                {lookup.message}
              </p>
            )}
            {lookup.status === 'error' && (
              <p
                data-testid="client-lookup-status"
                role="alert"
                className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"
              >
                {lookup.message}
              </p>
            )}
            <div className="flex items-center gap-3">
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
            <Field id="legalName" label="Denumire" error={errors.legalName}>
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
          </CardContent>
        </Card>

        <Card className="max-w-3xl">
          <CardHeader>
            <h2 className="text-lg font-semibold">Date de înregistrare</h2>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <Field
              id="caenCode"
              label="Cod CAEN"
              hint="Activitatea principală, patru cifre."
              error={errors.caenCode}
            >
              <Input
                id="caenCode"
                data-testid="client-caen"
                className="h-11"
                {...register('caenCode')}
                inputMode="numeric"
                maxLength={4}
                {...input('caenCode', true)}
              />
            </Field>
            <Field
              id="tradeRegisterNumber"
              label="Nr. Registrul Comerțului"
              error={errors.tradeRegisterNumber}
            >
              <Input
                id="tradeRegisterNumber"
                data-testid="client-trade-register"
                className="h-11"
                {...register('tradeRegisterNumber')}
                {...input('tradeRegisterNumber')}
              />
            </Field>
          </CardContent>
        </Card>

        <Card className="max-w-3xl">
          <CardHeader>
            <h2 className="text-lg font-semibold">Sediu social</h2>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <Field id="countyCode" label="Județ" error={errors.countyCode}>
              <NativeSelect
                id="countyCode"
                data-testid="client-county"
                className="h-11 min-w-56"
                {...register('countyCode')}
                disabled={busy}
                aria-invalid={Boolean(errors.countyCode)}
                aria-describedby={describedBy('countyCode', errors.countyCode)}
              >
                <NativeSelectOption value="">Alege județul</NativeSelectOption>
                {romanianCounties.map((county) => (
                  <NativeSelectOption key={county.code} value={county.code}>
                    {county.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field id="locality" label="Localitate" error={errors.locality}>
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
          </CardContent>
        </Card>

        <Card className="max-w-3xl">
          <CardHeader>
            <h2 className="text-lg font-semibold">Alte informații</h2>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <Field
              id="legalRepresentativeName"
              label="Reprezentant legal"
              hint="Numele administratorului, așa cum apare pe documente."
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
          </CardContent>
        </Card>

        {errors.root?.server && (
          <p
            id="client-form-error"
            data-testid="client-form-error"
            role="alert"
            className="max-w-3xl rounded-md border border-destructive/30 p-3 text-sm text-destructive"
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
