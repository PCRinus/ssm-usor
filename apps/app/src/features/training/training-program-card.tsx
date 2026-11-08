import type { StaffCategory } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent } from '@ssm-usor/ui/components/card';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';

import { Notice } from '@/components/notice';
import { EditAction, SectionCard } from '@/components/section-card';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { intervalLabel, type JobPosition } from '@/features/job-positions/job-position-schema';
import { useJobPositionOptions } from '@/features/job-positions/use-job-position-options';
import { useFocusRequest } from '@/features/missing-data/focus';

import { type DocumentDetailsFormValues, notApplicable } from './document-details-schema';
import { PositionsButton, PositionsLink } from './positions-links';
import {
  CategoryBlock,
  NoPostsBlock,
  SessionSentence,
  TrainingScheduleFields,
} from './schedule-fields';
import {
  categoriesWithPosts,
  type CategoryPosts,
  durationText,
  intervalFieldId,
  legalMaxInterval,
  trainingMonthsText,
} from './schedule-rules';
import {
  type ClientSummary,
  type DocumentDetails,
  type DocumentDetailsField,
  useDocumentDetails,
  useDocumentDetailsForm,
} from './use-document-details-form';

const intervalField = {
  execution: 'workerTrainingIntervalMonths',
  technical_administrative: 'administrativeTrainingIntervalMonths',
} as const satisfies Record<StaffCategory, DocumentDetailsField>;

const sharedFields = [
  'periodicTrainingMinutes',
  'trainingFirstMonth',
  'trainingDayFrom',
  'trainingDayTo',
] as const satisfies readonly DocumentDetailsField[];

const savedInterval = (saved: DocumentDetails, category: StaffCategory) =>
  category === 'execution'
    ? saved.workerTrainingIntervalMonths
    : saved.administrativeTrainingIntervalMonths;

const markedNotApplicable = (saved: DocumentDetails, category: StaffCategory) =>
  category === 'execution'
    ? saved.workerTrainingNotApplicable
    : saved.administrativeTrainingNotApplicable;

type Program = {
  minutes: number;
  firstMonth: number;
  dayFrom: number;
  dayTo: number;
};

// A category without posts is not asked for, whatever was saved for it (ADR 039).
function completeProgram(saved: DocumentDetails, categories: readonly CategoryPosts[]) {
  if (
    saved.periodicTrainingMinutes === null ||
    saved.trainingFirstMonth === null ||
    saved.trainingDayFrom === null ||
    saved.trainingDayTo === null ||
    categories.some(({ category }) => savedInterval(saved, category) === null)
  ) {
    return null;
  }
  return {
    minutes: saved.periodicTrainingMinutes,
    firstMonth: saved.trainingFirstMonth,
    dayFrom: saved.trainingDayFrom,
    dayTo: saved.trainingDayTo,
  } satisfies Program;
}

export function TrainingProgramSection({
  client,
  userId,
  focus = false,
}: {
  client: ClientSummary;
  userId: string;
  focus?: boolean;
}) {
  const details = useDocumentDetails(client.id, userId);
  const positions = useJobPositionOptions(client.id, userId);
  if (details.isPending || positions.isPending) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }
  if (details.isError || positions.isError) {
    const failed = details.isError ? details : positions;
    return (
      <Card data-testid="document-details-unavailable">
        <CardContent>
          <Notice
            variant="destructive"
            action={
              <Button
                variant="outline"
                disabled={failed.isFetching}
                onClick={() => void failed.refetch()}
              >
                Încearcă din nou
              </Button>
            }
          >
            Nu am putut încărca programul de instruire.
          </Notice>
        </CardContent>
      </Card>
    );
  }
  return (
    <TrainingProgramCard
      saved={details.data.documentDetails}
      positions={positions.data.items}
      client={client}
      userId={userId}
      focus={focus}
    />
  );
}

function firstFieldToFill(saved: DocumentDetails, categories: readonly CategoryPosts[]) {
  const unset = categories.find(({ category }) => savedInterval(saved, category) === null);
  if (unset) return intervalFieldId('details', unset.category);
  if (saved.trainingFirstMonth === null) return 'details-first-month';
  if (saved.trainingDayFrom === null) return 'details-day-from';
  if (saved.trainingDayTo === null) return 'details-day-to';
  if (saved.periodicTrainingMinutes === null) return 'details-training-duration';
  return categories[0] ? intervalFieldId('details', categories[0].category) : 'details-first-month';
}

function TrainingProgramCard({
  saved,
  positions,
  client,
  userId,
  focus,
}: {
  saved: DocumentDetails;
  positions: readonly JobPosition[];
  client: ClientSummary;
  userId: string;
  focus: boolean;
}) {
  const categories = categoriesWithPosts(positions);
  const savedKey = [
    ...sharedFields.map((field) => saved[field]),
    saved.administrativeTrainingIntervalMonths,
    saved.workerTrainingIntervalMonths,
    saved.administrativeTrainingNotApplicable,
    saved.workerTrainingNotApplicable,
    ...categories.map(({ category }) => category),
  ].join('|');
  const program = completeProgram(saved, categories);
  const readOnly = client.archivedAt !== null;
  // Editing belongs to what was saved when it began, so a save goes back to the summary.
  const [editedKey, setEditedKey] = useState<string | null>(null);
  const editing = !readOnly && (program === null || editedKey === savedKey);
  const editRef = useRef<HTMLButtonElement>(null);
  useFocusRequest(focus, {
    anchor: () => editRef.current,
    open: readOnly ? undefined : () => setEditedKey(savedKey),
    field: readOnly ? undefined : firstFieldToFill(saved, categories),
  });

  return (
    <SectionCard
      data-testid="training-program-card"
      title="Instruire SSM"
      action={
        !readOnly &&
        !editing && (
          <EditAction
            ref={editRef}
            data-testid="training-program-edit"
            onClick={() => setEditedKey(savedKey)}
          />
        )
      }
    >
      {editing ? (
        <TrainingProgramForm
          key={savedKey}
          saved={saved}
          categories={categories}
          positions={positions}
          client={client}
          userId={userId}
          onCancel={program ? () => setEditedKey(null) : undefined}
        />
      ) : program ? (
        <TrainingProgramSummary
          program={program}
          saved={saved}
          categories={categories}
          positions={positions}
          clientId={client.id}
        />
      ) : (
        <p data-testid="training-program-empty" className="text-sm text-muted-foreground">
          Programul de instruire nu a fost completat.
        </p>
      )}
    </SectionCard>
  );
}

const ownInterval = (positions: readonly JobPosition[], category?: StaffCategory) =>
  positions.filter(
    (position) =>
      position.trainingIntervalMonths !== null &&
      (category === undefined || position.staffCategory === category)
  );

function TrainingProgramSummary({
  program,
  saved,
  categories,
  positions,
  clientId,
}: {
  program: Program;
  saved: DocumentDetails;
  categories: readonly CategoryPosts[];
  positions: readonly JobPosition[];
  clientId: string;
}) {
  const exceptions = ownInterval(positions);

  return (
    <div className="grid gap-4">
      {categories.length === 0 ? (
        <NoPostsBlock action={<PositionsButton clientId={clientId} />} />
      ) : (
        <div className="grid gap-3">
          {categories.map(({ category, positions: held }) => (
            <CategoryBlock
              key={category}
              testId={`training-program-${category === 'execution' ? 'execution' : 'administrative'}`}
              category={category}
              positions={held}
              interval={savedInterval(saved, category)}
              firstMonth={program.firstMonth}
            />
          ))}
        </div>
      )}
      <p data-testid="training-program-session" className="text-sm">
        <SessionSentence
          duration={durationText('ssm', program.minutes)}
          dayFrom={program.dayFrom}
          dayTo={program.dayTo}
        />
      </p>
      {exceptions.length > 0 && (
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium">Posturi cu alt interval</h3>
          <ul data-testid="training-program-exceptions" className="mt-2 grid gap-1.5 text-sm">
            {exceptions.map((position) => (
              <li key={position.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{position.name}</span>
                <span>{intervalLabel(position.trainingIntervalMonths!)}</span>
                <span className="text-muted-foreground">
                  {trainingMonthsText(
                    program.firstMonth,
                    position.trainingIntervalMonths!
                  ).toLocaleLowerCase('ro')}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Intervalele proprii se schimbă din <PositionsLink clientId={clientId} />.
          </p>
        </div>
      )}
    </div>
  );
}

function OwnIntervalNote({
  positions,
  clientId,
}: {
  positions: readonly JobPosition[];
  clientId: string;
}) {
  if (positions.length === 0) return null;
  const names = positions.map(
    (position) => `${position.name.trim()} (${intervalLabel(position.trainingIntervalMonths!)})`
  );
  return (
    <p className="text-xs text-muted-foreground">
      {positions.length === 1
        ? `${positions[0]!.name.trim()} are interval propriu, ${intervalLabel(positions[0]!.trainingIntervalMonths!)}. Îl schimbi din `
        : `${names.join(', ')} au interval propriu. Le schimbi din `}
      <PositionsLink clientId={clientId} />.
    </p>
  );
}

function UnsavedIntervalNote({
  saved,
  category,
  domainMax,
}: {
  saved: DocumentDetails;
  category: StaffCategory;
  domainMax: number;
}) {
  if (markedNotApplicable(saved, category)) {
    return (
      <Notice variant="warning" data-testid={`training-program-was-not-applicable-${category}`}>
        Categoria era marcată „Nu se aplică”, dar clientul are posturi în ea, deci are nevoie de un
        interval. Am ales intervalul cel mai lung permis de lege, la {domainMax} luni; salvează
        programul sau alege mai des.
      </Notice>
    );
  }
  return (
    <p
      data-testid={`training-program-new-category-${category}`}
      className="text-xs text-muted-foreground"
    >
      Intervalul nu e salvat încă. Am ales intervalul cel mai lung permis de lege; salvează
      programul ca să-l păstrezi.
    </p>
  );
}

function TrainingProgramForm({
  saved,
  categories,
  positions,
  client,
  userId,
  onCancel,
}: {
  saved: DocumentDetails;
  categories: readonly CategoryPosts[];
  positions: readonly JobPosition[];
  client: ClientSummary;
  userId: string;
  onCancel?: () => void;
}) {
  const unsaved = categories
    .map(({ category }) => category)
    .filter((category) => savedInterval(saved, category) === null);
  const starting: Partial<DocumentDetailsFormValues> = Object.fromEntries(
    unsaved.map((category) => [intervalField[category], String(legalMaxInterval('ssm', category))])
  );
  const startedBefore =
    sharedFields.some((field) => saved[field] !== null) ||
    categories.some(({ category }) => savedInterval(saved, category) !== null) ||
    categories.some(({ category }) => markedNotApplicable(saved, category));
  const { form, onSubmit, busy, locked } = useDocumentDetailsForm({
    saved,
    client,
    userId,
    fields: [...sharedFields, ...categories.map(({ category }) => intervalField[category])],
    successMessage: 'Programul de instruire a fost salvat.',
    starting,
  });
  const formRef = useRevealErrors(form);
  const { errors, isDirty, isSubmitted } = form.formState;
  const values = useWatch({ control: form.control });
  const set = (field: DocumentDetailsField, value: string) =>
    form.setValue(field, value, { shouldDirty: true, shouldValidate: isSubmitted });
  // Each day's message depends on the other day.
  const setDay = (field: 'trainingDayFrom' | 'trainingDayTo', value: string) => {
    form.setValue(field, value, { shouldDirty: true });
    if (isSubmitted) void form.trigger(['trainingDayFrom', 'trainingDayTo']);
  };
  const number = (value: string | undefined) =>
    value && value !== notApplicable && /^[0-9]+$/.test(value) ? Number(value) : null;

  return (
    <form
      ref={formRef}
      data-testid="training-program-form"
      onSubmit={(event) => void onSubmit(event)}
      aria-busy={busy}
      noValidate
      className="grid gap-8"
    >
      <TrainingScheduleFields
        domain="ssm"
        idPrefix="details"
        categories={categories.map((entry) => ({
          ...entry,
          interval: number(values[intervalField[entry.category]]),
          error: errors[intervalField[entry.category]],
          fieldNote: (
            <OwnIntervalNote
              positions={ownInterval(positions, entry.category)}
              clientId={client.id}
            />
          ),
          blockNote:
            startedBefore && unsaved.includes(entry.category) ? (
              <UnsavedIntervalNote
                saved={saved}
                category={entry.category}
                domainMax={legalMaxInterval('ssm', entry.category)}
              />
            ) : null,
        }))}
        firstMonth={number(values.trainingFirstMonth)}
        dayFrom={values.trainingDayFrom ?? ''}
        dayTo={values.trainingDayTo ?? ''}
        duration={number(values.periodicTrainingMinutes)}
        disabled={locked}
        errors={{
          firstMonth: errors.trainingFirstMonth,
          dayFrom: errors.trainingDayFrom,
          dayTo: errors.trainingDayTo,
          duration: errors.periodicTrainingMinutes,
        }}
        postsLink={<PositionsLink clientId={client.id} />}
        noPostsAction={<PositionsButton clientId={client.id} />}
        onIntervalChange={(category, months) => set(intervalField[category], String(months))}
        onFirstMonthChange={(month) =>
          set('trainingFirstMonth', month === null ? '' : String(month))
        }
        onDayFromChange={(day) => setDay('trainingDayFrom', day)}
        onDayToChange={(day) => setDay('trainingDayTo', day)}
        onDurationChange={(minutes) => set('periodicTrainingMinutes', String(minutes))}
      />

      {errors.root?.server && (
        <Notice variant="destructive" data-testid="training-program-error">
          {errors.root.server.message}
        </Notice>
      )}
      <div className="grid gap-2 sm:flex sm:flex-wrap">
        <Button
          type="submit"
          data-testid="training-program-save"
          disabled={busy || (!isDirty && unsaved.length === 0)}
        >
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
