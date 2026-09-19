import { zodResolver } from '@hookform/resolvers/zod';
import { trainingMonths } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useForm, useWatch } from 'react-hook-form';

import {
  type ClientDocumentDetailsResponse,
  getGetClientDocumentDetailsQueryKey,
  getGetClientQueryKey,
  useGetClientDocumentDetails,
  useUpdateClientDocumentDetails,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { Field } from '../components/form-field';
import {
  documentDetailsFormSchema,
  type DocumentDetailsFormValues,
  intervalOptions,
  monthNames,
  toDocumentDetailsForm,
  toDocumentDetailsRequest,
} from './document-details-schema';

type DocumentDetails = ClientDocumentDetailsResponse['documentDetails'];

interface ClientSummary {
  id: string;
  archivedAt: string | null;
}

export function DocumentDetailsCard({ client, userId }: { client: ClientSummary; userId: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const details = useGetClientDocumentDetails(client.id, {
    request: apiRequest,
    query: { queryKey: [...getGetClientDocumentDetailsQueryKey(client.id), userId] },
  });

  return (
    <Card data-testid="document-details-card">
      <CardHeader>
        <h2 className="text-lg font-semibold">Reprezentant și instruire periodică</h2>
        <p className="text-sm text-muted-foreground">
          Deciziile sunt emise de reprezentantul legal, cu numele și funcția de mai jos, iar decizia
          privind instruirea tipărește programul instruirilor periodice. Calendarul termenelor va
          folosi același program.
        </p>
      </CardHeader>
      <CardContent>
        {details.isPending ? (
          <Skeleton className="h-72 w-full" />
        ) : details.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
            <p>Nu am putut încărca datele pentru documente.</p>
            <Button
              variant="outline"
              disabled={details.isFetching}
              onClick={() => void details.refetch()}
            >
              Încearcă din nou
            </Button>
          </div>
        ) : (
          // Keyed by what is saved, so the form starts again from what the server holds.
          <DocumentDetailsForm
            key={JSON.stringify(details.data.documentDetails)}
            saved={details.data.documentDetails}
            client={client}
            userId={userId}
          />
        )}
      </CardContent>
    </Card>
  );
}

function monthsPreview(firstMonth: string, interval: string) {
  if (!firstMonth || !interval) return null;
  return trainingMonths(Number(firstMonth), Number(interval))
    .map((month) => monthNames[month - 1])
    .join(', ');
}

function DocumentDetailsForm({
  saved,
  client,
  userId,
}: {
  saved: DocumentDetails;
  client: ClientSummary;
  userId: string;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const update = useUpdateClientDocumentDetails({ request: apiRequest });
  const form = useForm<DocumentDetailsFormValues>({
    resolver: zodResolver(documentDetailsFormSchema),
    defaultValues: toDocumentDetailsForm(saved),
  });
  const { errors, isDirty } = form.formState;
  const [firstMonth, administrativeInterval, workerInterval] = useWatch({
    control: form.control,
    name: [
      'trainingFirstMonth',
      'administrativeTrainingIntervalMonths',
      'workerTrainingIntervalMonths',
    ],
  });
  const busy = update.isPending;
  // An archived client keeps its data; nothing about it is edited any more.
  const locked = busy || client.archivedAt !== null;
  const administrativeMonths = monthsPreview(firstMonth, administrativeInterval);
  const workerMonths = monthsPreview(firstMonth, workerInterval);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({ clientId: client.id, data: toDocumentDetailsRequest(values) });
      // The client itself carries the name too.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [...getGetClientDocumentDetailsQueryKey(client.id), userId],
        }),
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(client.id) }),
      ]);
      toast.success('Datele pentru documente au fost salvate.');
    } catch (cause) {
      form.setError('root.server', {
        message:
          cause instanceof ApiHttpError && cause.status === 404
            ? 'Clientul nu mai există în organizația ta.'
            : cause instanceof ApiHttpError && cause.status === 401
              ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
              : 'Nu am putut salva datele. Verifică conexiunea și încearcă din nou.',
      });
    }
  });

  const describedBy = (id: string, error: unknown, hint = false) =>
    error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <form
      data-testid="document-details-form"
      onSubmit={(event) => void onSubmit(event)}
      aria-busy={busy}
      noValidate
      className="grid gap-5 sm:grid-cols-2"
    >
      <Field
        id="details-representative-name"
        label="Reprezentant legal"
        hint="Numele și prenumele, așa cum apar în decizii."
        error={errors.legalRepresentativeName}
      >
        <Input
          id="details-representative-name"
          data-testid="details-representative-name"
          autoComplete="off"
          disabled={locked}
          aria-invalid={Boolean(errors.legalRepresentativeName)}
          aria-describedby={describedBy(
            'details-representative-name',
            errors.legalRepresentativeName,
            true
          )}
          {...form.register('legalRepresentativeName')}
        />
      </Field>
      <Field
        id="details-representative-role"
        label="Funcția reprezentantului"
        hint="De exemplu „Administrator”."
        error={errors.legalRepresentativeRole}
      >
        <Input
          id="details-representative-role"
          data-testid="details-representative-role"
          autoComplete="off"
          disabled={locked}
          aria-invalid={Boolean(errors.legalRepresentativeRole)}
          aria-describedby={describedBy(
            'details-representative-role',
            errors.legalRepresentativeRole,
            true
          )}
          {...form.register('legalRepresentativeRole')}
        />
      </Field>

      <Field
        id="details-training-hours"
        label="Durata instruirii periodice"
        error={errors.periodicTrainingHours}
      >
        <NativeSelect
          id="details-training-hours"
          data-testid="details-training-hours"
          disabled={locked}
          aria-invalid={Boolean(errors.periodicTrainingHours)}
          aria-describedby={describedBy('details-training-hours', errors.periodicTrainingHours)}
          {...form.register('periodicTrainingHours')}
        >
          <NativeSelectOption value="">Alege durata</NativeSelectOption>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((hours) => (
            <NativeSelectOption key={hours} value={hours}>
              {hours === 1 ? '1 oră' : `${hours} ore`}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field
        id="details-first-month"
        label="Prima lună cu instruire"
        hint="Celelalte luni rezultă din interval."
        error={errors.trainingFirstMonth}
      >
        <NativeSelect
          id="details-first-month"
          data-testid="details-first-month"
          disabled={locked}
          aria-invalid={Boolean(errors.trainingFirstMonth)}
          aria-describedby={describedBy('details-first-month', errors.trainingFirstMonth, true)}
          {...form.register('trainingFirstMonth')}
        >
          <NativeSelectOption value="">Alege luna</NativeSelectOption>
          {monthNames.map((name, index) => (
            <NativeSelectOption key={name} value={index + 1}>
              {name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>

      <Field
        id="details-administrative-interval"
        label="Personal tehnic-administrativ și conducători"
        hint={administrativeMonths ? `Instruiri în: ${administrativeMonths}.` : undefined}
        error={errors.administrativeTrainingIntervalMonths}
      >
        <NativeSelect
          id="details-administrative-interval"
          data-testid="details-administrative-interval"
          disabled={locked}
          aria-invalid={Boolean(errors.administrativeTrainingIntervalMonths)}
          aria-describedby={describedBy(
            'details-administrative-interval',
            errors.administrativeTrainingIntervalMonths,
            Boolean(administrativeMonths)
          )}
          {...form.register('administrativeTrainingIntervalMonths')}
        >
          <NativeSelectOption value="">Alege intervalul</NativeSelectOption>
          {intervalOptions.map(({ months, label }) => (
            <NativeSelectOption key={months} value={months}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field
        id="details-worker-interval"
        label="Personal de execuție"
        hint={workerMonths ? `Instruiri în: ${workerMonths}.` : undefined}
        error={errors.workerTrainingIntervalMonths}
      >
        <NativeSelect
          id="details-worker-interval"
          data-testid="details-worker-interval"
          disabled={locked}
          aria-invalid={Boolean(errors.workerTrainingIntervalMonths)}
          aria-describedby={describedBy(
            'details-worker-interval',
            errors.workerTrainingIntervalMonths,
            Boolean(workerMonths)
          )}
          {...form.register('workerTrainingIntervalMonths')}
        >
          <NativeSelectOption value="">Alege intervalul</NativeSelectOption>
          {intervalOptions
            .filter(({ months }) => months <= 6)
            .map(({ months, label }) => (
              <NativeSelectOption key={months} value={months}>
                {label}
              </NativeSelectOption>
            ))}
        </NativeSelect>
      </Field>

      <Field id="details-day-from" label="Din ziua" error={errors.trainingDayFrom}>
        <Input
          id="details-day-from"
          data-testid="details-day-from"
          inputMode="numeric"
          autoComplete="off"
          disabled={locked}
          aria-invalid={Boolean(errors.trainingDayFrom)}
          aria-describedby={describedBy('details-day-from', errors.trainingDayFrom)}
          className="max-w-24"
          {...form.register('trainingDayFrom')}
        />
      </Field>
      <Field
        id="details-day-to"
        label="Până în ziua"
        hint="Zilele lunii în care are loc instruirea, de exemplu 2–7."
        error={errors.trainingDayTo}
      >
        <Input
          id="details-day-to"
          data-testid="details-day-to"
          inputMode="numeric"
          autoComplete="off"
          disabled={locked}
          aria-invalid={Boolean(errors.trainingDayTo)}
          aria-describedby={describedBy('details-day-to', errors.trainingDayTo, true)}
          className="max-w-24"
          {...form.register('trainingDayTo')}
        />
      </Field>

      {errors.root?.server && (
        <p
          data-testid="document-details-error"
          role="alert"
          className="rounded-md border border-destructive/30 p-3 text-sm text-destructive sm:col-span-2"
        >
          {errors.root.server.message}
        </p>
      )}
      {client.archivedAt === null && (
        <div className="sm:col-span-2">
          <Button type="submit" data-testid="document-details-save" disabled={busy || !isDirty}>
            {busy ? 'Se salvează…' : 'Salvează'}
          </Button>
        </div>
      )}
    </form>
  );
}
