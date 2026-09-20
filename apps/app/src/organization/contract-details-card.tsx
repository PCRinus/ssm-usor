import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { Controller, useForm } from 'react-hook-form';

import {
  getGetOrganizationContractDetailsQueryKey,
  type OrganizationContractDetailsResponse,
  useGetOrganizationContractDetails,
  useUpdateOrganizationContractDetails,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { DatePicker } from '../components/date-picker';
import { Field } from '../components/form-field';
import { Notice } from '../components/notice';
import { todayIso } from '../employees/employee-format';
import {
  contractDetailsFormSchema,
  type ContractDetailsFormValues,
  toContractDetailsForm,
  toContractDetailsRequest,
} from './contract-details-schema';

type ContractDetails = OrganizationContractDetailsResponse['contractDetails'];

// What a service contract prints about the provider and the documentation set does not
// (ADR 007). Rendered for owners only, as the API answers only them.
export function ContractDetailsCard({ userId }: { userId: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const details = useGetOrganizationContractDetails({
    request: apiRequest,
    query: { queryKey: [...getGetOrganizationContractDetailsQueryKey(), userId] },
  });

  return (
    <Card data-testid="contract-details-card">
      <CardHeader>
        <h2 className="text-lg font-semibold">Date pentru contracte</h2>
        <p className="text-sm text-muted-foreground">
          Apar în contractele de prestări servicii pe care le generezi pentru clienți și clienți
          potențiali, alături de datele juridice. Niciuna nu este obligatorie până atunci: doar
          generarea unui contract le cere.
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
            Nu am putut încărca datele pentru contracte.
          </Notice>
        ) : (
          // Keyed by what is saved, so the form starts again from what the server holds.
          <ContractDetailsForm
            key={JSON.stringify(details.data.contractDetails)}
            saved={details.data.contractDetails}
            userId={userId}
          />
        )}
      </CardContent>
    </Card>
  );
}

type TextField = Exclude<
  keyof ContractDetailsFormValues,
  'vatPayer' | 'authorizationCertificateDate'
>;

function ContractDetailsForm({ saved, userId }: { saved: ContractDetails; userId: string }) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const update = useUpdateOrganizationContractDetails({ request: apiRequest });
  const form = useForm<ContractDetailsFormValues>({
    resolver: zodResolver(contractDetailsFormSchema),
    defaultValues: toContractDetailsForm(saved),
  });
  const { errors, isDirty } = form.formState;
  const busy = update.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({ data: toContractDetailsRequest(values) });
      await queryClient.invalidateQueries({
        queryKey: [...getGetOrganizationContractDetailsQueryKey(), userId],
      });
      toast.success('Datele pentru contracte au fost salvate.');
    } catch (cause) {
      form.setError('root.server', {
        message:
          cause instanceof ApiHttpError && cause.status === 403
            ? 'Doar administratorii organizației pot modifica datele pentru contracte.'
            : cause instanceof ApiHttpError && cause.status === 401
              ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
              : 'Nu am putut salva datele pentru contracte. Verifică conexiunea și încearcă din nou.',
      });
    }
  });

  const text = (
    name: TextField,
    label: string,
    options: { hint?: string; className?: string; autoComplete?: string; type?: string } = {}
  ) => {
    const id = `contract-${name}`;
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
          disabled={busy}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? `${id}-error` : options.hint ? `${id}-hint` : undefined}
          {...form.register(name)}
        />
      </Field>
    );
  };

  return (
    <form
      data-testid="contract-details-form"
      onSubmit={(event) => void onSubmit(event)}
      aria-busy={busy}
      noValidate
      className="grid gap-5 sm:grid-cols-2"
    >
      {text('phone', 'Telefon', { type: 'tel', autoComplete: 'tel' })}
      <div className="flex items-center gap-3 self-end pb-2">
        <Controller
          control={form.control}
          name="vatPayer"
          render={({ field }) => (
            <Checkbox
              id="contract-vatPayer"
              data-testid="contract-vatPayer"
              checked={field.value}
              disabled={busy}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              onBlur={field.onBlur}
            />
          )}
        />
        <Label htmlFor="contract-vatPayer">Plătitor de TVA</Label>
      </div>
      {text('iban', 'Cont bancar (IBAN)', {
        hint: 'Cu sau fără spații, de exemplu RO49 AAAA 1B31 0075 9384 0000.',
      })}
      {text('bankName', 'Banca', { hint: 'De exemplu „Banca Transilvania”.' })}

      <h3 className="mt-2 text-sm font-semibold sm:col-span-2">Certificatul de abilitare</h3>
      {text('authorizationCertificateNumber', 'Număr')}
      <Field
        id="contract-authorizationCertificateDate"
        label="Data emiterii"
        error={errors.authorizationCertificateDate}
      >
        <Controller
          control={form.control}
          name="authorizationCertificateDate"
          render={({ field }) => (
            <DatePicker
              id="contract-authorizationCertificateDate"
              testId="contract-authorizationCertificateDate"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              max={todayIso()}
              disabled={busy}
              invalid={Boolean(errors.authorizationCertificateDate)}
            />
          )}
        />
      </Field>
      {text('authorizationCertificateIssuer', 'Emis de', {
        hint: 'De exemplu „Ministerul Muncii – Direcția de muncă și protecție socială Timiș”.',
        className: 'sm:col-span-2',
      })}

      <div className="mt-2 sm:col-span-2">
        <h3 className="text-sm font-semibold">Cadrul tehnic PSI</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Doar dacă vinzi și servicii de apărare împotriva incendiilor: apare în contractele care le
          includ.
        </p>
      </div>
      {text('fireSafetyTechnicianName', 'Nume și prenume')}
      {text('fireSafetyTechnicianCertificate', 'Certificat', {
        hint: 'Seria și numărul certificatului de cadru tehnic.',
      })}

      {errors.root?.server && (
        <Notice
          variant="destructive"
          data-testid="contract-details-error"
          className="sm:col-span-2"
        >
          {errors.root.server.message}
        </Notice>
      )}
      <div className="sm:col-span-2">
        <Button type="submit" data-testid="contract-details-save" disabled={busy || !isDirty}>
          {update.isPending ? 'Se salvează…' : 'Salvează'}
        </Button>
      </div>
    </form>
  );
}
