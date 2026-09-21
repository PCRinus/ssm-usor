import { zodResolver } from '@hookform/resolvers/zod';
import { isValidCuiInput, normalizeCui } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import {
  getGetOrganizationCompanyDetailsQueryKey,
  lookupCompany,
  type OrganizationCompanyDetailsResponse,
  useGetOrganizationCompanyDetails,
  useUpdateOrganizationCompanyDetails,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { CountyCombobox } from '../clients/county-combobox';
import { Field } from '../components/form-field';
import { FormSection } from '../components/form-section';
import { Notice } from '../components/notice';
import {
  companyDetailsFormSchema,
  type CompanyDetailsFormValues,
  toCompanyDetailsForm,
  toCompanyDetailsRequest,
} from './company-details-schema';

type CompanyDetails = OrganizationCompanyDetailsResponse['companyDetails'];

// Hiding the owner's form controls is a courtesy; the API and the database enforce the rule.
export function CompanyDetailsCard({ userId, canEdit }: { userId: string; canEdit: boolean }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const details = useGetOrganizationCompanyDetails({
    request: apiRequest,
    query: { queryKey: [...getGetOrganizationCompanyDetailsQueryKey(), userId] },
  });

  return (
    <div data-testid="company-details-card" className="grid gap-5">
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        Apar în documentele și în contractele pe care le generezi. Poți salva și pe rând: abia
        generarea unui document le cere, și îți spune ce lipsește.
        {!canEdit && ' Doar administratorii le pot modifica.'}
      </p>
      {details.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : details.isError ? (
        <Notice
          variant="destructive"
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
          Nu am putut încărca datele firmei.
        </Notice>
      ) : (
        // Keyed by what is saved, so the form starts again from what the server holds.
        <CompanyDetailsForm
          key={JSON.stringify(details.data.companyDetails)}
          saved={details.data.companyDetails}
          userId={userId}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}

type LookupState = { status: 'idle' | 'loading' } | { status: 'done' | 'error'; message: string };

type TextField = Exclude<keyof CompanyDetailsFormValues, 'countyCode' | 'vatPayer'>;

function CompanyDetailsForm({
  saved,
  userId,
  canEdit,
}: {
  saved: CompanyDetails;
  userId: string;
  canEdit: boolean;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const update = useUpdateOrganizationCompanyDetails({ request: apiRequest });
  const [lookup, setLookup] = useState<LookupState>({ status: 'idle' });
  const form = useForm<CompanyDetailsFormValues>({
    resolver: zodResolver(companyDetailsFormSchema),
    defaultValues: toCompanyDetailsForm(saved),
  });
  const { errors, isDirty } = form.formState;
  const busy = update.isPending || lookup.status === 'loading';
  const locked = busy || !canEdit;

  async function lookupCui() {
    const input = form.getValues('cui');
    if (!isValidCuiInput(input)) {
      form.setError('cui', { message: 'Introdu un CUI valid înainte de căutare.' });
      return;
    }
    form.clearErrors('cui');
    setLookup({ status: 'loading' });
    try {
      const { company } = await lookupCompany({ cui: normalizeCui(input)!.cui }, apiRequest);
      const fill = { shouldDirty: true, shouldValidate: false };
      form.setValue('legalName', company.legalName, fill);
      form.setValue('vatPayer', company.vatPayer, fill);
      form.setValue('tradeRegisterNumber', company.tradeRegisterNumber ?? '', fill);
      form.setValue('countyCode', company.countyCode ?? '', fill);
      form.setValue('locality', company.locality ?? '', fill);
      form.setValue('addressLine', company.addressLine ?? '', fill);
      setLookup({
        status: 'done',
        message: `Date preluate de la ANAF pentru ${company.legalName}. Verifică-le înainte de salvare.`,
      });
    } catch (cause) {
      setLookup({
        status: 'error',
        message:
          cause instanceof ApiHttpError && cause.status === 404
            ? 'Nu am găsit nicio companie cu acest CUI la ANAF. Completează datele manual.'
            : 'Serviciul ANAF nu este disponibil momentan. Completează datele manual.',
      });
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({ data: toCompanyDetailsRequest(values) });
      await queryClient.invalidateQueries({
        queryKey: [...getGetOrganizationCompanyDetailsQueryKey(), userId],
      });
      toast.success('Datele firmei au fost salvate.');
    } catch (cause) {
      form.setError('root.server', {
        message:
          cause instanceof ApiHttpError && cause.status === 403
            ? 'Doar administratorii organizației pot modifica datele firmei.'
            : cause instanceof ApiHttpError && cause.status === 401
              ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
              : 'Nu am putut salva datele firmei. Verifică conexiunea și încearcă din nou.',
      });
    }
  });

  const text = (
    name: TextField,
    label: string,
    options: { hint?: string; className?: string; autoComplete?: string; type?: string } = {}
  ) => {
    const id = `company-${name}`;
    return (
      <Field
        id={id}
        label={label}
        hint={options.hint}
        error={errors[name]}
        className={options.className}
      >
        <Input
          id={id}
          data-testid={id}
          type={options.type}
          autoComplete={options.autoComplete ?? 'off'}
          disabled={locked}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? `${id}-error` : options.hint ? `${id}-hint` : undefined}
          {...form.register(name)}
        />
      </Field>
    );
  };

  return (
    <form
      data-testid="company-details-form"
      onSubmit={(event) => void onSubmit(event)}
      aria-busy={busy}
      noValidate
      className="grid gap-6"
    >
      <Card className="gap-0 divide-y py-0">
        <FormSection
          title="Identificare"
          description="Codul fiscal aduce de la ANAF denumirea, sediul și dacă firma plătește TVA. Toate rămân editabile."
        >
          <Field id="company-cui" label="CUI" error={errors.cui} className="sm:col-span-2">
            <div className="flex flex-wrap gap-2">
              <Input
                id="company-cui"
                data-testid="company-cui"
                inputMode="numeric"
                autoComplete="off"
                disabled={locked}
                aria-invalid={Boolean(errors.cui)}
                aria-describedby={errors.cui ? 'company-cui-error' : undefined}
                className="max-w-56"
                {...form.register('cui')}
              />
              {canEdit && (
                <Button
                  type="button"
                  variant="outline"
                  data-testid="company-lookup"
                  disabled={busy}
                  onClick={() => void lookupCui()}
                >
                  {lookup.status === 'loading' ? 'Se caută…' : 'Caută la ANAF'}
                </Button>
              )}
            </div>
          </Field>
          {(lookup.status === 'done' || lookup.status === 'error') && (
            <p
              data-testid="company-lookup-status"
              role={lookup.status === 'error' ? 'alert' : 'status'}
              className={`text-sm sm:col-span-2 ${lookup.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              {lookup.message}
            </p>
          )}
          {text('legalName', 'Denumire juridică', {
            hint: 'Așa cum apare în documente, de exemplu „S.C. Exemplu S.R.L.”.',
            className: 'sm:col-span-2',
            autoComplete: 'organization',
          })}
          {text('tradeRegisterNumber', 'Nr. registrul comerțului')}
          <div className="flex items-center gap-3 self-end pb-2">
            <Controller
              control={form.control}
              name="vatPayer"
              render={({ field }) => (
                <Checkbox
                  id="company-vatPayer"
                  data-testid="company-vatPayer"
                  checked={field.value}
                  disabled={locked}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  onBlur={field.onBlur}
                />
              )}
            />
            <Label htmlFor="company-vatPayer">Plătitor de TVA</Label>
          </div>
        </FormSection>

        <FormSection
          title="Sediu și contact"
          description="Sediul social, așa cum apare la registrul comerțului, și telefonul firmei."
        >
          <Field id="company-county" label="Județ" error={errors.countyCode}>
            <Controller
              control={form.control}
              name="countyCode"
              render={({ field }) => (
                <CountyCombobox
                  id="company-county"
                  testId="company-county"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={locked}
                  invalid={Boolean(errors.countyCode)}
                  describedBy={errors.countyCode ? 'company-county-error' : undefined}
                />
              )}
            />
          </Field>
          {text('locality', 'Localitate')}
          {text('addressLine', 'Adresă', { className: 'sm:col-span-2' })}
          {text('phone', 'Telefon', { type: 'tel', autoComplete: 'tel' })}
        </FormSection>

        <FormSection
          title="Reprezentant legal"
          description="Persoana care semnează documentele și contractele în numele firmei."
        >
          {text('legalRepresentativeName', 'Nume și prenume', {
            autoComplete: 'name',
            hint: 'Așa cum apar în documente.',
          })}
          {text('legalRepresentativeRole', 'Funcție', { hint: 'De exemplu „Administrator”.' })}
        </FormSection>

        <FormSection
          title="Cont bancar"
          description="Contul în care clienții plătesc serviciile. Apare doar în contracte."
        >
          {text('iban', 'IBAN', {
            hint: 'Cu sau fără spații, de exemplu RO49 AAAA 1B31 0075 9384 0000.',
          })}
          {text('bankName', 'Banca', { hint: 'De exemplu „Banca Transilvania”.' })}
        </FormSection>
      </Card>

      {errors.root?.server && (
        <Notice variant="destructive" data-testid="company-details-error">
          {errors.root.server.message}
        </Notice>
      )}
      {canEdit && (
        <div>
          <Button type="submit" data-testid="company-details-save" disabled={busy || !isDirty}>
            {update.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </div>
      )}
    </form>
  );
}
