import {
  formatTrainingDuration,
  periodicTrainingMinutesOptions,
  trainingMonths,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import { Input } from '@ssm-usor/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@ssm-usor/ui/components/select';
import { Link } from '@tanstack/react-router';
import { FileText, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';

import { Field } from '../components/form-field';
import { Notice } from '../components/notice';
import { intervalLabel, staffCategoryLabels } from '../job-positions/job-position-schema';
import { useJobPositionOptions } from '../job-positions/use-job-position-options';
import { intervalOptions, monthNames, notApplicable } from './document-details-schema';
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

type Program = {
  periodicTrainingMinutes: number;
  administrativeTrainingIntervalMonths: number | null;
  workerTrainingIntervalMonths: number | null;
  trainingFirstMonth: number;
  trainingDayFrom: number;
  trainingDayTo: number;
};

function completeProgram(saved: DocumentDetails): Program | null {
  const administrative = saved.administrativeTrainingIntervalMonths;
  const worker = saved.workerTrainingIntervalMonths;
  if (
    (administrative === null && !saved.administrativeTrainingNotApplicable) ||
    (worker === null && !saved.workerTrainingNotApplicable) ||
    (administrative === null && worker === null) ||
    saved.periodicTrainingMinutes === null ||
    saved.trainingFirstMonth === null ||
    saved.trainingDayFrom === null ||
    saved.trainingDayTo === null
  ) {
    return null;
  }
  return {
    periodicTrainingMinutes: saved.periodicTrainingMinutes,
    administrativeTrainingIntervalMonths: administrative,
    workerTrainingIntervalMonths: worker,
    trainingFirstMonth: saved.trainingFirstMonth,
    trainingDayFrom: saved.trainingDayFrom,
    trainingDayTo: saved.trainingDayTo,
  };
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
    <Card data-testid="training-program-card" className="gap-3">
      <CardHeader>
        <h2 className="text-lg font-semibold">Programul de instruire periodică</h2>
      </CardHeader>
      <CardContent>
        {/* Keyed by what is saved, so the card goes back to the summary after a save. */}
        <TrainingProgram
          key={[
            ...fields.map((field) => saved[field]),
            saved.administrativeTrainingNotApplicable,
            saved.workerTrainingNotApplicable,
          ].join('|')}
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
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
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
    (position) =>
      position.trainingIntervalMonths !== null &&
      (position.staffCategory === 'execution'
        ? program.workerTrainingIntervalMonths !== null
        : program.administrativeTrainingIntervalMonths !== null)
  );
  const hasExcludedEmployees = (positions.data?.items ?? []).some(
    (position) =>
      position.employeeCount > 0 &&
      (position.staffCategory === 'execution'
        ? program.workerTrainingIntervalMonths === null
        : program.administrativeTrainingIntervalMonths === null)
  );

  return (
    <div className="grid gap-4">
      {hasExcludedEmployees && (
        <Notice variant="warning" data-testid="training-program-category-warning">
          Există angajați într-o categorie marcată „Nu se aplică”. Modifică programul înainte de a
          genera documentele.
        </Notice>
      )}
      <div
        className={`grid gap-3 ${
          program.workerTrainingIntervalMonths !== null &&
          program.administrativeTrainingIntervalMonths !== null
            ? 'sm:grid-cols-2'
            : 'lg:grid-cols-2'
        }`}
      >
        {program.workerTrainingIntervalMonths !== null && (
          <CategoryProgram
            testId="training-program-execution"
            label={staffCategoryLabels.execution}
            interval={program.workerTrainingIntervalMonths}
            firstMonth={program.trainingFirstMonth}
          />
        )}
        {program.administrativeTrainingIntervalMonths !== null && (
          <CategoryProgram
            testId="training-program-administrative"
            label={staffCategoryLabels.technical_administrative}
            interval={program.administrativeTrainingIntervalMonths}
            firstMonth={program.trainingFirstMonth}
          />
        )}
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
            Toate posturile urmează intervalul categoriei lor. Poți seta un interval diferit în{' '}
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
              Decizia de instruire include doar intervalele pe categorii. Intervalele speciale se
              schimbă din{' '}
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
    </div>
  );
}

type SelectOption = { value: string; label: string };

function ProgramSelect({
  id,
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
  placeholder,
  options,
  allowNotApplicable = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  invalid: boolean;
  describedBy?: string;
  placeholder: string;
  options: readonly SelectOption[];
  allowNotApplicable?: boolean;
}) {
  return (
    <Select
      value={value || 'undecided'}
      onValueChange={(next) => onChange(next === 'undecided' ? '' : next)}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        data-testid={id}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="w-full"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="undecided">{placeholder}</SelectItem>
        <SelectSeparator />
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
        {allowNotApplicable && (
          <>
            <SelectSeparator />
            <SelectItem value={notApplicable}>Nu se aplică</SelectItem>
          </>
        )}
      </SelectContent>
    </Select>
  );
}

const intervalChoices: SelectOption[] = intervalOptions.map(({ months, label }) => ({
  value: String(months),
  label,
}));
const monthChoices: SelectOption[] = monthNames.map((label, index) => ({
  value: String(index + 1),
  label,
}));
const durationChoices: SelectOption[] = periodicTrainingMinutesOptions.map((minutes) => ({
  value: String(minutes),
  label: formatTrainingDuration(minutes),
}));

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
  const [firstMonth, administrativeInterval, workerInterval, duration, dayFrom, dayTo] = useWatch({
    control: form.control,
    name: [
      'trainingFirstMonth',
      'administrativeTrainingIntervalMonths',
      'workerTrainingIntervalMonths',
      'periodicTrainingMinutes',
      'trainingDayFrom',
      'trainingDayTo',
    ],
  });
  const positions = useJobPositionOptions(client.id, userId);
  const conflictingCategories = new Set(
    (positions.data?.items ?? [])
      .filter(
        (position) =>
          position.employeeCount > 0 &&
          (position.staffCategory === 'execution'
            ? workerInterval === notApplicable
            : administrativeInterval === notApplicable)
      )
      .map((position) => position.staffCategory)
  );
  const preview = (interval: string) =>
    firstMonth && interval && interval !== notApplicable
      ? monthList(Number(firstMonth), Number(interval))
      : null;
  const administrativeMonths = preview(administrativeInterval);
  const workerMonths = preview(workerInterval);
  const hasAdministrativeInterval = Boolean(
    administrativeInterval && administrativeInterval !== notApplicable
  );
  const hasWorkerInterval = Boolean(workerInterval && workerInterval !== notApplicable);

  return (
    <form
      data-testid="training-program-form"
      onSubmit={(event) => void onSubmit(event)}
      aria-busy={busy}
      noValidate
      className="grid gap-6"
    >
      <Notice variant="info" title="Pentru generarea documentelor">
        Poți salva programul incomplet. Alege un interval sau „Nu se aplică” pentru fiecare
        categorie; cel puțin una trebuie să aibă interval.
      </Notice>

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
        <section className="grid content-start gap-4" aria-labelledby="training-categories-title">
          <div>
            <h3 id="training-categories-title" className="font-semibold">
              Categoriile de personal
            </h3>
          </div>
          <div className="grid gap-4">
            <Field
              id="details-administrative-interval"
              label={staffCategoryLabels.technical_administrative}
              mark="required"
              hint="Cel mult la 12 luni."
              error={errors.administrativeTrainingIntervalMonths}
            >
              <Controller
                name="administrativeTrainingIntervalMonths"
                control={form.control}
                render={({ field }) => (
                  <ProgramSelect
                    id="details-administrative-interval"
                    value={field.value}
                    onChange={field.onChange}
                    disabled={locked}
                    invalid={Boolean(errors.administrativeTrainingIntervalMonths)}
                    describedBy={describedBy(
                      'details-administrative-interval',
                      errors.administrativeTrainingIntervalMonths,
                      true
                    )}
                    placeholder="Alege intervalul"
                    options={intervalChoices}
                    allowNotApplicable
                  />
                )}
              />
            </Field>
            <Field
              id="details-worker-interval"
              label={staffCategoryLabels.execution}
              mark="required"
              hint="Cel mult la 6 luni."
              error={errors.workerTrainingIntervalMonths}
            >
              <Controller
                name="workerTrainingIntervalMonths"
                control={form.control}
                render={({ field }) => (
                  <ProgramSelect
                    id="details-worker-interval"
                    value={field.value}
                    onChange={field.onChange}
                    disabled={locked}
                    invalid={Boolean(errors.workerTrainingIntervalMonths)}
                    describedBy={describedBy(
                      'details-worker-interval',
                      errors.workerTrainingIntervalMonths,
                      true
                    )}
                    placeholder="Alege intervalul"
                    options={intervalChoices.filter(({ value }) => Number(value) <= 6)}
                    allowNotApplicable
                  />
                )}
              />
            </Field>
          </div>
          {conflictingCategories.size > 0 && (
            <Notice variant="warning" data-testid="training-program-category-warning">
              Există angajați în categoria marcată „Nu se aplică”. Alege un interval pentru acea
              categorie înainte de a genera documentele.
            </Notice>
          )}
        </section>

        <section
          className="grid content-start gap-4 border-t pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0"
          aria-labelledby="training-dates-title"
        >
          <div>
            <h3 id="training-dates-title" className="font-semibold">
              Programarea instruirii
            </h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="details-first-month"
              label="Prima lună"
              mark="required"
              error={errors.trainingFirstMonth}
            >
              <Controller
                name="trainingFirstMonth"
                control={form.control}
                render={({ field }) => (
                  <ProgramSelect
                    id="details-first-month"
                    value={field.value}
                    onChange={field.onChange}
                    disabled={locked}
                    invalid={Boolean(errors.trainingFirstMonth)}
                    describedBy={describedBy('details-first-month', errors.trainingFirstMonth)}
                    placeholder="Alege luna"
                    options={monthChoices}
                  />
                )}
              />
            </Field>
            <Field
              id="details-training-duration"
              label="Durata"
              mark="required"
              error={errors.periodicTrainingMinutes}
            >
              <Controller
                name="periodicTrainingMinutes"
                control={form.control}
                render={({ field }) => (
                  <ProgramSelect
                    id="details-training-duration"
                    value={field.value}
                    onChange={field.onChange}
                    disabled={locked}
                    invalid={Boolean(errors.periodicTrainingMinutes)}
                    describedBy={describedBy(
                      'details-training-duration',
                      errors.periodicTrainingMinutes
                    )}
                    placeholder="Alege durata"
                    options={durationChoices}
                  />
                )}
              />
            </Field>
            <Field
              id="details-day-from"
              label="Din ziua"
              mark="required"
              error={errors.trainingDayFrom}
            >
              <Input
                id="details-day-from"
                data-testid="details-day-from"
                inputMode="numeric"
                autoComplete="off"
                disabled={locked}
                aria-invalid={Boolean(errors.trainingDayFrom)}
                aria-describedby={describedBy('details-day-from', errors.trainingDayFrom)}
                className="w-full"
                {...form.register('trainingDayFrom')}
              />
            </Field>
            <Field
              id="details-day-to"
              label="Până în ziua"
              mark="required"
              error={errors.trainingDayTo}
            >
              <Input
                id="details-day-to"
                data-testid="details-day-to"
                inputMode="numeric"
                autoComplete="off"
                disabled={locked}
                aria-invalid={Boolean(errors.trainingDayTo)}
                aria-describedby={describedBy('details-day-to', errors.trainingDayTo)}
                className="w-full"
                {...form.register('trainingDayTo')}
              />
            </Field>
          </div>
        </section>
      </div>

      {hasAdministrativeInterval || hasWorkerInterval ? (
        <section
          className="rounded-xl border border-info-border bg-info p-5"
          aria-labelledby="training-preview-title"
          aria-live="polite"
        >
          <div className="mb-5 flex items-center gap-2.5">
            <FileText aria-hidden="true" className="size-5 text-primary" />
            <h3 id="training-preview-title" className="font-semibold">
              În decizia de instruire
            </h3>
          </div>
          <div
            className={`grid gap-5 ${hasAdministrativeInterval && hasWorkerInterval ? 'sm:grid-cols-2' : ''}`}
          >
            {hasAdministrativeInterval && (
              <div className="border-l-2 border-primary pl-4">
                <p className="text-sm text-muted-foreground">
                  {staffCategoryLabels.technical_administrative}
                </p>
                <p className="mt-1 text-xl font-semibold tracking-tight">
                  {intervalLabel(Number(administrativeInterval))}
                </p>
                {administrativeMonths && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Lunile: {administrativeMonths}
                  </p>
                )}
              </div>
            )}
            {hasWorkerInterval && (
              <div className="border-l-2 border-primary pl-4">
                <p className="text-sm text-muted-foreground">{staffCategoryLabels.execution}</p>
                <p className="mt-1 text-xl font-semibold tracking-tight">
                  {intervalLabel(Number(workerInterval))}
                </p>
                {workerMonths && (
                  <p className="mt-1 text-sm text-muted-foreground">Lunile: {workerMonths}</p>
                )}
              </div>
            )}
          </div>
          {(duration || (dayFrom && dayTo)) && (
            <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t border-info-border pt-4 text-sm">
              {duration && (
                <p>
                  <span className="text-muted-foreground">Durata</span>{' '}
                  <strong className="font-semibold">
                    {formatTrainingDuration(Number(duration))}
                  </strong>
                </p>
              )}
              {dayFrom && dayTo && (
                <p>
                  <span className="text-muted-foreground">Zilele lunii</span>{' '}
                  <strong className="font-semibold">
                    {dayFrom === dayTo ? dayFrom : `${dayFrom}–${dayTo}`}
                  </strong>
                </p>
              )}
            </div>
          )}
        </section>
      ) : null}

      {errors.root?.server && (
        <Notice variant="destructive" data-testid="training-program-error">
          {errors.root.server.message}
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
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
