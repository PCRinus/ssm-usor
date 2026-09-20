import {
  formatTrainingDuration,
  periodicTrainingMinutesOptions,
  trainingMonths,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Link } from '@tanstack/react-router';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useWatch } from 'react-hook-form';

import { Field } from '../components/form-field';
import { Notice } from '../components/notice';
import { intervalLabel, staffCategoryLabels } from '../job-positions/job-position-schema';
import { useJobPositionOptions } from '../job-positions/use-job-position-options';
import { intervalOptions, monthNames } from './document-details-schema';
import {
  type ClientSummary,
  describedBy,
  type DocumentDetails,
  useDocumentDetailsForm,
} from './use-document-details-form';

const fields = [
  'periodicTrainingMinutes',
  'administrativeTrainingIntervalMonths',
  'workerTrainingIntervalMonths',
  'trainingFirstMonth',
  'trainingDayFrom',
  'trainingDayTo',
] as const;

type Program = { [Field in (typeof fields)[number]]: number };

function completeProgram(saved: DocumentDetails): Program | null {
  const entries = fields.map((field) => [field, saved[field]] as const);
  return entries.every(([, value]) => value !== null)
    ? (Object.fromEntries(entries) as Program)
    : null;
}

const monthList = (firstMonth: number, interval: number) =>
  trainingMonths(firstMonth, interval)
    .map((month) => monthNames[month - 1])
    .join(', ');

export function TrainingProgramCard({
  saved,
  client,
  userId,
}: {
  saved: DocumentDetails;
  client: ClientSummary;
  userId: string;
}) {
  return (
    <Card data-testid="training-program-card">
      <CardHeader>
        <h2 className="text-lg font-semibold">Instruire periodică</h2>
        <p className="text-sm text-muted-foreground">
          Programul pe care îl tipărește decizia privind instruirea și pe care îl va urma calendarul
          termenelor.
        </p>
      </CardHeader>
      <CardContent>
        {/* Keyed by what is saved, so the card goes back to the summary after a save. */}
        <TrainingProgram
          key={fields.map((field) => saved[field]).join('|')}
          saved={saved}
          client={client}
          userId={userId}
        />
      </CardContent>
    </Card>
  );
}

function TrainingProgram({
  saved,
  client,
  userId,
}: {
  saved: DocumentDetails;
  client: ClientSummary;
  userId: string;
}) {
  const program = completeProgram(saved);
  const readOnly = client.archivedAt !== null;
  const [editing, setEditing] = useState(program === null && !readOnly);

  if (editing) {
    return (
      <TrainingProgramForm
        saved={saved}
        client={client}
        userId={userId}
        onCancel={program ? () => setEditing(false) : undefined}
      />
    );
  }
  if (!program) {
    return (
      <p data-testid="training-program-empty" className="text-sm text-muted-foreground">
        Programul de instruire nu a fost completat.
      </p>
    );
  }
  return (
    <div className="grid gap-5">
      <TrainingProgramSummary program={program} clientId={client.id} userId={userId} />
      {!readOnly && (
        <div>
          <Button
            variant="outline"
            data-testid="training-program-edit"
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden="true" />
            Modifică programul
          </Button>
        </div>
      )}
    </div>
  );
}

function CategoryProgram({
  testId,
  label,
  interval,
  firstMonth,
}: {
  testId: string;
  label: string;
  interval: number;
  firstMonth: number;
}) {
  return (
    <div data-testid={testId} className="rounded-lg border bg-muted/40 p-4">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight first-letter:uppercase">
        {intervalLabel(interval)}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{monthList(firstMonth, interval)}</p>
    </div>
  );
}

function TrainingProgramSummary({
  program,
  clientId,
  userId,
}: {
  program: Program;
  clientId: string;
  userId: string;
}) {
  const positions = useJobPositionOptions(clientId, userId);
  const exceptions = (positions.data?.items ?? []).filter(
    (position) => position.trainingIntervalMonths !== null
  );

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <CategoryProgram
          testId="training-program-execution"
          label={staffCategoryLabels.execution}
          interval={program.workerTrainingIntervalMonths}
          firstMonth={program.trainingFirstMonth}
        />
        <CategoryProgram
          testId="training-program-administrative"
          label={staffCategoryLabels.technical_administrative}
          interval={program.administrativeTrainingIntervalMonths}
          firstMonth={program.trainingFirstMonth}
        />
      </div>
      <p data-testid="training-program-session" className="text-sm">
        Fiecare instruire durează{' '}
        <span className="font-medium">
          {formatTrainingDuration(program.periodicTrainingMinutes)}
        </span>{' '}
        și are loc{' '}
        <span className="font-medium">
          {program.trainingDayFrom === program.trainingDayTo
            ? `în ziua de ${program.trainingDayFrom} a lunii`
            : `între zilele ${program.trainingDayFrom} și ${program.trainingDayTo} ale lunii`}
        </span>
        .
      </p>
      <div className="border-t pt-4">
        <h3 className="text-sm font-medium">Posturi cu alt interval</h3>
        {exceptions.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            Toate posturile urmează intervalul categoriei lor. Un post care se instruiește altfel
            își primește intervalul în{' '}
            <Link
              to="/clients/$clientId/job-positions"
              params={{ clientId }}
              className="underline underline-offset-4"
            >
              Posturi de lucru
            </Link>
            .
          </p>
        ) : (
          <>
            <ul data-testid="training-program-exceptions" className="mt-2 grid gap-1.5 text-sm">
              {exceptions.map((position) => (
                <li key={position.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{position.name}</span>
                  <span>{intervalLabel(position.trainingIntervalMonths!)}</span>
                  <span className="text-muted-foreground">
                    {monthList(program.trainingFirstMonth, position.trainingIntervalMonths!)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Decizia privind instruirea tipărește deocamdată doar intervalele celor două categorii.
              Se modifică din{' '}
              <Link
                to="/clients/$clientId/job-positions"
                params={{ clientId }}
                className="underline underline-offset-4"
              >
                Posturi de lucru
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </>
  );
}

function TrainingProgramForm({
  saved,
  client,
  userId,
  onCancel,
}: {
  saved: DocumentDetails;
  client: ClientSummary;
  userId: string;
  onCancel?: () => void;
}) {
  const { form, onSubmit, busy, locked } = useDocumentDetailsForm({
    saved,
    client,
    userId,
    fields,
    successMessage: 'Programul de instruire a fost salvat.',
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
  const preview = (interval: string) =>
    firstMonth && interval ? monthList(Number(firstMonth), Number(interval)) : null;
  const administrativeMonths = preview(administrativeInterval);
  const workerMonths = preview(workerInterval);

  return (
    <form
      data-testid="training-program-form"
      onSubmit={(event) => void onSubmit(event)}
      aria-busy={busy}
      noValidate
      className="grid gap-5 sm:grid-cols-2"
    >
      <Field
        id="details-worker-interval"
        label={staffCategoryLabels.execution}
        hint={workerMonths ? `Instruiri în: ${workerMonths}.` : 'Cel mult la 6 luni.'}
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
            true
          )}
          className="w-full"
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
      <Field
        id="details-administrative-interval"
        label={staffCategoryLabels.technical_administrative}
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
          className="w-full"
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
          className="w-full"
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
        id="details-training-duration"
        label="Durata unei instruiri"
        error={errors.periodicTrainingMinutes}
      >
        <NativeSelect
          id="details-training-duration"
          data-testid="details-training-duration"
          disabled={locked}
          aria-invalid={Boolean(errors.periodicTrainingMinutes)}
          aria-describedby={describedBy(
            'details-training-duration',
            errors.periodicTrainingMinutes
          )}
          className="w-full"
          {...form.register('periodicTrainingMinutes')}
        >
          <NativeSelectOption value="">Alege durata</NativeSelectOption>
          {periodicTrainingMinutesOptions.map((minutes) => (
            <NativeSelectOption key={minutes} value={minutes}>
              {formatTrainingDuration(minutes)}
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
        <Notice
          variant="destructive"
          data-testid="training-program-error"
          className="sm:col-span-2"
        >
          {errors.root.server.message}
        </Notice>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" data-testid="training-program-save" disabled={busy || !isDirty}>
          {busy ? 'Se salvează…' : 'Salvează programul'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
            Renunță
          </Button>
        )}
      </div>
    </form>
  );
}
