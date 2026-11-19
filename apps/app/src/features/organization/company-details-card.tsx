import { zodResolver } from '@hookform/resolvers/zod';
import { bankNameAfterIbanChange, formatIban } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useRouteContext } from '@tanstack/react-router';
import { Controller, useForm } from 'react-hook-form';

import {
  getGetBillingQueryKey,
  getGetOrganizationCompanyDetailsQueryKey,
  type OrganizationCompanyDetailsResponse,
  useGetOrganizationCompanyDetails,
  useUpdateOrganizationCompanyDetails,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { replayShow } from '@/app/observability/replay-masking';
import { Field } from '@/components/form-field';
import { FormSection } from '@/components/form-section';
import { LoadFailed } from '@/components/load-failed';
import { Notice } from '@/components/notice';
import { sheetPadding } from '@/components/page-spacing';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { AnafLookupButton } from '@/features/clients/anaf-lookup-button';
import { CompanyLookupStatus } from '@/features/clients/company-lookup-status';
import { CountyCombobox } from '@/features/clients/county-combobox';
import { anafFill, useCompanyLookup } from '@/features/clients/use-company-lookup';
import { type OrganizationCompanyFocus, useFocusRequest } from '@/features/missing-data/focus';
import { useSavedToast } from '@/features/missing-data/saved-toast';
import { commonFailure } from '@/lib/api-errors';

import {
  companyDetailsFormSchema,
  type CompanyDetailsFormValues,
  toCompanyDetailsForm,
  toCompanyDetailsRequest,
} from './company-details-schema';

type CompanyDetails = OrganizationCompanyDetailsResponse['companyDetails'];

function fieldFor(focus: OrganizationCompanyFocus, saved: CompanyDetails) {
  const fields: Record<Exclude<OrganizationCompanyFocus, 'address'>, string> = {
    'legal-name': 'company-legalName',
    cui: 'company-cui',
    'trade-register': 'company-tradeRegisterNumber',
    'representative-name': 'company-legalRepresentativeName',
    'representative-role': 'company-legalRepresentativeRole',
    phone: 'company-phone',
    'bank-account': saved.iban ? 'company-bankName' : 'company-iban',
  };
  if (focus !== 'address') return fields[focus];
  if (!saved.countyCode) return 'company-county';
  return saved.locality ? 'company-addressLine' : 'company-locality';
}

// Hiding the owner's form controls is a courtesy; the API and the database enforce the rule.
export function CompanyDetailsCard({
  userId,
  canEdit,
  focus,
}: {
  userId: string;
  canEdit: boolean;
  focus?: OrganizationCompanyFocus;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const details = useGetOrganizationCompanyDetails({
    request: apiRequest,
    query: { queryKey: [...getGetOrganizationCompanyDetailsQueryKey(), userId] },
  });
  useFocusRequest(focus !== undefined, {
    ready: !details.isPending,
    field: focus && details.data ? fieldFor(focus, details.data.companyDetails) : undefined,
  });

  return (
    <div
      data-testid="company-details-card"
      className={details.isPending || details.isError ? sheetPadding : undefined}
    >
      {details.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : details.isError ? (
        <LoadFailed
          error={details.error}
          busy={details.isFetching}
          onRetry={() => void details.refetch()}
        >
          Nu am putut încărca datele firmei.
        </LoadFailed>
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

type TextField = Exclude<keyof CompanyDetailsFormValues, 'countyCode' | 'vatPayer'>;

const shownInReplay = new Set<TextField>([
  'legalName',
  'tradeRegisterNumber',
  'locality',
  'addressLine',
  'legalRepresentativeRole',
  'iban',
  'bankName',
]);

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
  const savedToast = useSavedToast();
  const update = useUpdateOrganizationCompanyDetails({ request: apiRequest });
  const form = useForm<CompanyDetailsFormValues>({
    resolver: zodResolver(companyDetailsFormSchema),
    defaultValues: toCompanyDetailsForm(saved),
  });
  const formRef = useRevealErrors(form);
  const { errors, isDirty } = form.formState;
  function followIban(iban: string) {
    const bankName = bankNameAfterIbanChange(iban, form.getValues('bankName'));
    if (bankName !== form.getValues('bankName')) {
      form.setValue('bankName', bankName, { shouldDirty: true, shouldValidate: false });
    }
  }
  const { lookup, lookupCui } = useCompanyLookup(form, (company) => {
    // ANAF rarely holds them, so an empty answer keeps what the owner wrote.
    if (company.phone) form.setValue('phone', company.phone, anafFill);
    if (company.iban) {
      form.setValue('iban', formatIban(company.iban), anafFill);
      followIban(company.iban);
    }
  });
  const busy = update.isPending || lookup.status === 'loading';
  const locked = busy || !canEdit;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({ data: toCompanyDetailsRequest(values) });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [...getGetOrganizationCompanyDetailsQueryKey(), userId],
        }),
        // Abonament shows the amounts without VAT by this box. Only marked stale: the billing
        // overview asks Stripe, so it is read when Abonament opens, not now.
        queryClient.invalidateQueries({ queryKey: getGetBillingQueryKey(), refetchType: 'none' }),
      ]);
      savedToast('Datele firmei au fost salvate.');
    } catch (cause) {
      form.setError('root.server', {
        message:
          commonFailure(cause) ??
          (cause instanceof ApiHttpError && cause.status === 403
            ? 'Doar adminii organizației pot modifica datele firmei.'
            : 'Nu am putut salva datele firmei. Verifică conexiunea și încearcă din nou.'),
      });
    }
  });

  const text = (
    name: TextField,
    label: string,
    options: {
      hint?: string;
      className?: string;
      autoComplete?: string;
      type?: string;
      onChange?: (value: string) => void;
    } = {}
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
          {...(shownInReplay.has(name) && replayShow)}
          {...form.register(name, {
            onChange: options.onChange && ((event) => options.onChange?.(event.target.value)),
          })}
        />
      </Field>
    );
  };

  return (
    <form
      ref={formRef}
      data-testid="company-details-form"
      onSubmit={(event) => void onSubmit(event)}
      aria-busy={busy}
      noValidate
    >
      <div className="divide-y">
        <FormSection
          title="Identificare"
          description="Introdu CUI-ul ca să preiei datele de la ANAF. Le poți corecta înainte să le salvezi."
        >
          <Field id="company-cui" label="CUI" error={errors.cui} className="sm:col-span-2">
            <div className="flex flex-wrap gap-2">
              <Input
                id="company-cui"
                data-testid="company-cui"
                {...replayShow}
                inputMode="numeric"
                autoComplete="off"
                disabled={locked}
                aria-invalid={Boolean(errors.cui)}
                aria-describedby={errors.cui ? 'company-cui-error' : undefined}
                className="max-w-56"
                {...form.register('cui')}
              />
              {canEdit && (
                <AnafLookupButton
                  testId="company-lookup"
                  loading={lookup.status === 'loading'}
                  disabled={busy}
                  onClick={() => void lookupCui()}
                />
              )}
            </div>
          </Field>
          <CompanyLookupStatus lookup={lookup} testId="company-lookup-status" />
          {text('legalName', 'Denumire juridică', {
            hint: 'Așa cum apare în actele firmei.',
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
          description="Adresa din registrul comerțului și telefonul firmei."
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
          description="Cine semnează documentele în numele firmei."
        >
          {text('legalRepresentativeName', 'Nume și prenume', {
            autoComplete: 'name',
            hint: 'Așa cum apare în actele firmei.',
          })}
          {text('legalRepresentativeRole', 'Funcție', { hint: 'De exemplu „Administrator”.' })}
        </FormSection>

        <FormSection title="Cont bancar" description="Apare în contractele cu clienții.">
          {text('iban', 'IBAN', {
            hint: 'Cu sau fără spații, de exemplu RO49 AAAA 1B31 0075 9384 0000.',
            onChange: followIban,
          })}
          {text('bankName', 'Banca', {
            hint: 'Se completează din IBAN pentru băncile din România. O poți corecta.',
          })}
        </FormSection>
        {(errors.root?.server || canEdit) && (
          <div className="grid gap-6 p-6">
            {errors.root?.server && (
              <Notice variant="destructive" data-testid="company-details-error">
                {errors.root.server.message}
              </Notice>
            )}
            {canEdit && (
              <div>
                <Button
                  type="submit"
                  data-testid="company-details-save"
                  disabled={busy || !isDirty}
                >
                  {update.isPending ? 'Se salvează…' : 'Salvează'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
