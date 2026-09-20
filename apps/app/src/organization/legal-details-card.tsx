import { zodResolver } from '@hookform/resolvers/zod';
import { isValidCuiInput, normalizeCui } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import { Input } from '@ssm-usor/ui/components/input';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import {
  getGetOrganizationLegalDetailsQueryKey,
  lookupCompany,
  type OrganizationLegalDetailsResponse,
  useGetOrganizationLegalDetails,
  useUpdateOrganizationLegalDetails,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { CountyCombobox } from '../clients/county-combobox';
import { Field } from '../components/form-field';
import { Notice } from '../components/notice';
import {
  legalDetailsFormSchema,
  type LegalDetailsFormValues,
  toLegalDetailsForm,
  toLegalDetailsRequest,
} from './legal-details-schema';

type LegalDetails = OrganizationLegalDetailsResponse['legalDetails'];

// What generated documents print about the provider. Every member reads it; hiding the
// owner's form controls is a courtesy, and the API and the database enforce the rule.
export function LegalDetailsCard({ userId, canEdit }: { userId: string; canEdit: boolean }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const details = useGetOrganizationLegalDetails({
    request: apiRequest,
    query: { queryKey: [...getGetOrganizationLegalDetailsQueryKey(), userId] },
  });

  return (
    <Card data-testid="legal-details-card">
      <CardHeader>
        <h2 className="text-lg font-semibold">Date juridice</h2>
        <p className="text-sm text-muted-foreground">
          Apar în documentele generate pentru clienți: denumirea, datele de înregistrare și
          reprezentantul serviciului extern. Poți salva și pe rând, dar generarea documentelor le
          cere pe toate.
          {!canEdit && ' Doar administratorii le pot modifica.'}
        </p>
      </CardHeader>
      <CardContent>
        {details.isPending ? (
          <Skeleton className="h-64 w-full" />
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
            Nu am putut încărca datele juridice.
          </Notice>
        ) : (
          // Keyed by what is saved, so the form starts again from what the server holds.
          <LegalDetailsForm
            key={JSON.stringify(details.data.legalDetails)}
            saved={details.data.legalDetails}
            userId={userId}
            canEdit={canEdit}
          />
        )}
      </CardContent>
    </Card>
  );
}

type LookupState = { status: 'idle' | 'loading' } | { status: 'done' | 'error'; message: string };

function LegalDetailsForm({
  saved,
  userId,
  canEdit,
}: {
  saved: LegalDetails;
  userId: string;
  canEdit: boolean;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const update = useUpdateOrganizationLegalDetails({ request: apiRequest });
  const [lookup, setLookup] = useState<LookupState>({ status: 'idle' });
  const form = useForm<LegalDetailsFormValues>({
    resolver: zodResolver(legalDetailsFormSchema),
    defaultValues: toLegalDetailsForm(saved),
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
      await update.mutateAsync({ data: toLegalDetailsRequest(values) });
      await queryClient.invalidateQueries({
        queryKey: [...getGetOrganizationLegalDetailsQueryKey(), userId],
      });
      toast.success('Datele juridice au fost salvate.');
    } catch (cause) {
      form.setError('root.server', {
        message:
          cause instanceof ApiHttpError && cause.status === 403
            ? 'Doar administratorii organizației pot modifica datele juridice.'
            : cause instanceof ApiHttpError && cause.status === 401
              ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
              : 'Nu am putut salva datele juridice. Verifică conexiunea și încearcă din nou.',
      });
    }
  });

  const text = (
    name: Exclude<keyof LegalDetailsFormValues, 'countyCode'>,
    label: string,
    options: { hint?: string; className?: string; autoComplete?: string } = {}
  ) => {
    const id = `legal-${name}`;
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
      data-testid="legal-details-form"
      onSubmit={(event) => void onSubmit(event)}
      aria-busy={busy}
      noValidate
      className="grid gap-5 sm:grid-cols-2"
    >
      <Field id="legal-cui" label="CUI" error={errors.cui} className="sm:col-span-2">
        <div className="flex flex-wrap gap-2">
          <Input
            id="legal-cui"
            data-testid="legal-cui"
            inputMode="numeric"
            autoComplete="off"
            disabled={locked}
            aria-invalid={Boolean(errors.cui)}
            aria-describedby={errors.cui ? 'legal-cui-error' : undefined}
            className="max-w-56"
            {...form.register('cui')}
          />
          {canEdit && (
            <Button
              type="button"
              variant="outline"
              data-testid="legal-lookup"
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
          data-testid="legal-lookup-status"
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
      <Field id="legal-county" label="Județ" error={errors.countyCode}>
        <Controller
          control={form.control}
          name="countyCode"
          render={({ field }) => (
            <CountyCombobox
              id="legal-county"
              testId="legal-county"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              disabled={locked}
              invalid={Boolean(errors.countyCode)}
              describedBy={errors.countyCode ? 'legal-county-error' : undefined}
            />
          )}
        />
      </Field>
      {text('locality', 'Localitate')}
      {text('addressLine', 'Adresă')}
      {text('legalRepresentativeName', 'Reprezentant legal', {
        autoComplete: 'name',
        hint: 'Numele și prenumele, așa cum apar în documente.',
      })}
      {text('legalRepresentativeRole', 'Funcția reprezentantului', {
        hint: 'De exemplu „Administrator”.',
      })}
      {errors.root?.server && (
        <Notice variant="destructive" data-testid="legal-details-error" className="sm:col-span-2">
          {errors.root.server.message}
        </Notice>
      )}
      {canEdit && (
        <div className="sm:col-span-2">
          <Button type="submit" data-testid="legal-details-save" disabled={busy || !isDirty}>
            {update.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </div>
      )}
    </form>
  );
}
