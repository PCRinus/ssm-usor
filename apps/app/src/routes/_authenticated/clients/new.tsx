import {
  caenClassName,
  type CountyCode,
  countyNames,
  formatCui,
  isValidCuiInput,
  normalizeCui,
  romanianCounties,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { Controller, useWatch } from 'react-hook-form';

import { CaenCombobox } from '../../../clients/caen-combobox';
import type { ClientFormValues } from '../../../clients/client-form-schema';
import { type LookupState, useClientForm } from '../../../clients/use-client-form';
import { Field } from '../../../components/form-field';

const describedBy = (id: string, error: unknown, hint?: boolean) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

export const Route = createFileRoute('/_authenticated/clients/new')({
  staticData: { title: 'Client nou' },
  component: NewClientPage,
});

// A form section: what it is for on the left, its fields on the right.
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-5 px-6 py-7 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-10">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-[repeat(2,minmax(0,1fr))]">{children}</div>
    </section>
  );
}

function PreviewRow({ label, value, testId }: { label: string; value: ReactNode; testId: string }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd data-testid={testId} className="min-w-0 wrap-break-word">
        {value ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}

// Live summary of the client as it will appear in the list.
function ClientPreview({ values, lookup }: { values: ClientFormValues; lookup: LookupState }) {
  const cui = isValidCuiInput(values.cui) ? normalizeCui(values.cui) : null;
  const caenName = caenClassName(values.caenCode);
  const office = [
    values.locality,
    values.countyCode ? countyNames[values.countyCode as CountyCode] : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <aside
      data-testid="client-preview"
      aria-labelledby="client-preview-title"
      className="lg:sticky lg:top-24 lg:self-start"
    >
      <Card className="gap-0 py-0">
        <div className="border-b px-5 py-4">
          <h2 id="client-preview-title" className="text-sm font-semibold">
            Cum va apărea în listă
          </h2>
        </div>
        <dl className="divide-y px-5 py-2">
          <PreviewRow label="Companie" value={values.legalName || null} testId="preview-name" />
          <PreviewRow
            label="CUI"
            value={cui ? formatCui(cui.cui, values.vatPayer || cui.vatPrefix) : null}
            testId="preview-cui"
          />
          <PreviewRow
            label="Activitate"
            value={
              values.caenCode ? (
                <>
                  <span className="tabular-nums">{values.caenCode}</span>
                  {caenName && <span className="block text-muted-foreground">{caenName}</span>}
                </>
              ) : null
            }
            testId="preview-caen"
          />
          <PreviewRow label="Sediu social" value={office || null} testId="preview-office" />
          <PreviewRow
            label="Reprezentant"
            value={values.legalRepresentativeName || null}
            testId="preview-representative"
          />
          <PreviewRow
            label="Angajați"
            value={values.declaredEmployeeCount || null}
            testId="preview-employees"
          />
        </dl>
        <div className="border-t px-5 py-4 text-sm leading-relaxed text-muted-foreground">
          {lookup.status === 'done'
            ? 'Datele de identificare vin de la ANAF. Reprezentantul și numărul de angajați se completează manual.'
            : 'Doar denumirea și CUI-ul sunt obligatorii. Restul se poate completa și mai târziu.'}
        </div>
      </Card>
    </aside>
  );
}

export function NewClientPage() {
  const { form, onSubmit, lookup, lookupCui, isSaving } = useClientForm();
  const {
    register,
    control,
    formState: { errors },
  } = form;
  const values = useWatch({ control });
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
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <form
          className="grid gap-6"
          aria-busy={busy}
          aria-describedby={errors.root?.server ? 'client-form-error' : undefined}
          noValidate
          onSubmit={onSubmit}
        >
          <Card className="gap-0 divide-y py-0">
            <Section
              title="Identificare"
              description="Codul fiscal aduce restul datelor publice; denumirea rămâne editabilă."
            >
              <Field
                id="cui"
                label="CUI"
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
            </Section>

            <Section
              title="Înregistrare"
              description="Activitatea principală și numărul din Registrul Comerțului, așa cum apar în acte."
            >
              <Field
                id="caenCode"
                label="Cod CAEN"
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
            </Section>

            <Section
              title="Sediu social"
              description="Adresa înregistrată a companiei. Punctele de lucru se adaugă separat."
            >
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
            </Section>

            <Section
              title="Alte informații"
              description="Date pe care ANAF nu le oferă și pe care le poți actualiza oricând."
            >
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
            </Section>
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
        <ClientPreview values={values as ClientFormValues} lookup={lookup} />
      </div>
    </div>
  );
}
