import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent } from '@ssm-usor/ui/components/card';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useRouteContext } from '@tanstack/react-router';
import { Plus, X } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { type FieldError, useForm, useWatch } from 'react-hook-form';

import {
  type ApiErrorResponse,
  getGetClientFireSafetyQueryKey,
  useGetClientFireSafety,
  useUpdateClientFireSafety,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { EditAction, Fact, FactList, SectionCard } from '@/components/section-card';
import { useInPlaceEdit } from '@/components/use-in-place-edit';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { intervalLabel, staffCategoryLabels } from '@/features/job-positions/job-position-schema';
import { type FireTrainingFocus, useFocusRequest } from '@/features/missing-data/focus';
import { useSavedToast } from '@/features/missing-data/saved-toast';

import { monthNames } from './document-details-schema';
import {
  completeFireSchedule,
  fireHourChoices,
  fireIntervalChoices,
  type FireSafety,
  fireSafetyFormSchema,
  type FireSafetyFormValues,
  fireSmokingChoices,
  firstFireScheduleField,
  maxWasteKinds,
  monthChoices,
  startingFireSafety,
  toFireSafetyForm,
  toFireSafetyRequest,
  wasteKindProblem,
} from './fire-safety-schema';
import { CategoryProgram } from './training-program-card';
import { type ClientSummary, describedBy, useDocumentDetails } from './use-document-details-form';

function useFireSafety(clientId: string, userId: string) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  return useGetClientFireSafety(clientId, {
    request: apiRequest,
    query: { queryKey: [...getGetClientFireSafetyQueryKey(clientId), userId] },
  });
}

export function FireSafetySection({
  client,
  userId,
  focus,
}: {
  client: ClientSummary;
  userId: string;
  focus?: FireTrainingFocus;
}) {
  const fireSafety = useFireSafety(client.id, userId);
  // The starting calendar is the occupational safety card's, which loads the same query.
  const details = useDocumentDetails(client.id, userId);
  if (fireSafety.isPending || details.isPending) {
    return <Skeleton className="h-56 w-full rounded-xl" />;
  }
  if (fireSafety.isError) {
    return (
      <Card data-testid="fire-safety-unavailable">
        <CardContent>
          <Notice
            variant="destructive"
            action={
              <Button
                variant="outline"
                disabled={fireSafety.isFetching}
                onClick={() => void fireSafety.refetch()}
              >
                Încearcă din nou
              </Button>
            }
          >
            Nu am putut încărca instruirea PSI.
          </Notice>
        </CardContent>
      </Card>
    );
  }
  const { fireSafety: saved, exists } = fireSafety.data;
  return (
    <FireSafetyCard
      saved={saved}
      exists={exists}
      start={startingFireSafety(saved, exists, details.data?.documentDetails ?? null)}
      client={client}
      userId={userId}
      focus={focus}
    />
  );
}

function FireSafetyCard({
  saved,
  exists,
  start,
  client,
  userId,
  focus,
}: {
  saved: FireSafety;
  exists: boolean;
  start: FireSafety;
  client: ClientSummary;
  userId: string;
  focus?: FireTrainingFocus;
}) {
  const readOnly = client.archivedAt !== null;
  const { editing, editRef, open, close } = useInPlaceEdit();
  useFocusRequest(focus !== undefined, {
    anchor: () => editRef.current,
    open: readOnly ? undefined : open,
    field: readOnly
      ? undefined
      : focus === 'fire-waste'
        ? 'fire-waste-input'
        : firstFireScheduleField(start),
  });

  return (
    <SectionCard
      data-testid="fire-safety-card"
      title="Instruire PSI"
      action={
        !readOnly &&
        !editing && (
          <EditAction ref={editRef} empty={!exists} data-testid="fire-safety-edit" onClick={open} />
        )
      }
    >
      {editing ? (
        <FireSafetyForm
          start={start}
          exists={exists}
          clientId={client.id}
          userId={userId}
          onDone={close}
        />
      ) : (
        <FireSafetySummary saved={saved} exists={exists} />
      )}
    </SectionCard>
  );
}

const unset = (label = 'Necompletat') => (
  <span className="font-normal text-muted-foreground">{label}</span>
);

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const daysLabel = (from: number, to: number) =>
  from === to ? `în ziua de ${from} a lunii` : `între zilele ${from} și ${to} ale lunii`;

function FireSafetySummary({ saved, exists }: { saved: FireSafety; exists: boolean }) {
  const schedule = exists ? completeFireSchedule(saved) : null;
  const { trainingDayFrom: dayFrom, trainingDayTo: dayTo } = saved;

  return (
    <div className="grid gap-5">
      {schedule ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <CategoryProgram
              testId="fire-schedule-execution"
              label={staffCategoryLabels.execution}
              interval={schedule.workerTrainingIntervalMonths}
              firstMonth={schedule.trainingFirstMonth}
            />
            <CategoryProgram
              testId="fire-schedule-administrative"
              label={staffCategoryLabels.technical_administrative}
              interval={schedule.administrativeTrainingIntervalMonths}
              firstMonth={schedule.trainingFirstMonth}
            />
          </div>
          <p data-testid="fire-schedule-session" className="text-sm">
            Fiecare instruire durează{' '}
            <span className="font-medium">{schedule.periodicTrainingHours} ore</span> și are loc{' '}
            <span className="font-medium">
              {daysLabel(schedule.trainingDayFrom, schedule.trainingDayTo)}
            </span>
            .
          </p>
        </>
      ) : (
        <FactList data-testid="fire-schedule-facts">
          <Fact label="Durata">
            {saved.periodicTrainingHours === null ? unset() : `${saved.periodicTrainingHours} ore`}
          </Fact>
          <Fact label={staffCategoryLabels.execution}>
            {saved.workerTrainingIntervalMonths === null
              ? unset()
              : capitalized(intervalLabel(saved.workerTrainingIntervalMonths))}
          </Fact>
          <Fact label={staffCategoryLabels.technical_administrative}>
            {saved.administrativeTrainingIntervalMonths === null
              ? unset()
              : capitalized(intervalLabel(saved.administrativeTrainingIntervalMonths))}
          </Fact>
          <Fact label="Prima lună">
            {saved.trainingFirstMonth === null ? unset() : monthNames[saved.trainingFirstMonth - 1]}
          </Fact>
          <Fact label="Zilele lunii">
            {dayFrom === null || dayTo === null
              ? unset()
              : dayFrom === dayTo
                ? String(dayFrom)
                : `${dayFrom}–${dayTo}`}
          </Fact>
        </FactList>
      )}
      <FactList className="border-t pt-5">
        <Fact label="Fumatul" testId="fire-smoking">
          {saved.smokingPolicy ? fireSmokingChoices[saved.smokingPolicy] : unset('Nestabilit')}
        </Fact>
        <Fact label="Firma care preia deșeurile" testId="fire-waste-contractor">
          {saved.wasteContractor}
        </Fact>
        <Fact label="Deșeuri colectate" wide testId="fire-waste-kinds">
          {saved.wasteKinds.length === 0 ? unset() : <WasteChips kinds={saved.wasteKinds} />}
        </Fact>
      </FactList>
    </div>
  );
}

function WasteChips({
  kinds,
  onRemove,
  disabled = false,
}: {
  kinds: readonly string[];
  onRemove?: (kind: string) => void;
  disabled?: boolean;
}) {
  return (
    <ul className="flex flex-wrap gap-1.5" data-testid="fire-waste-chips">
      {kinds.map((kind) => (
        <li
          key={kind}
          className="inline-flex max-w-full items-center gap-1 rounded-full bg-secondary py-1 pr-1 pl-3 text-sm font-medium wrap-anywhere text-secondary-foreground"
        >
          <span className={onRemove ? undefined : 'pr-2'}>{kind}</span>
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="rounded-full"
              disabled={disabled}
              aria-label={`Scoate „${kind}”`}
              onClick={() => onRemove(kind)}
            >
              <X aria-hidden="true" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function ProgramField({
  id,
  label,
  error,
  hint,
  describedById,
  children,
}: {
  id: string;
  label: string;
  error?: FieldError;
  hint?: string;
  describedById?: string;
  children: (props: { 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode;
}) {
  return (
    <Field id={id} label={label} mark="required" hint={hint} error={error}>
      {children({
        'aria-invalid': Boolean(error),
        'aria-describedby': error ? `${id}-error` : (describedById ?? (hint && `${id}-hint`)),
      })}
    </Field>
  );
}

function useFireSafetyForm({
  start,
  clientId,
  userId,
  onDone,
}: {
  start: FireSafety;
  clientId: string;
  userId: string;
  onDone: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const savedToast = useSavedToast();
  const update = useUpdateClientFireSafety({ request: apiRequest });
  const form = useForm<FireSafetyFormValues>({
    resolver: zodResolver(fireSafetyFormSchema),
    defaultValues: toFireSafetyForm(start),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({ clientId, data: toFireSafetyRequest(values) });
      await queryClient.invalidateQueries({
        queryKey: [...getGetClientFireSafetyQueryKey(clientId), userId],
      });
      savedToast('Instruirea PSI a fost salvată.');
      onDone();
    } catch (cause) {
      const status = cause instanceof ApiHttpError ? cause.status : null;
      const reason =
        cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>).reason : null;
      form.setError('root.server', {
        message:
          status === 409 && reason === 'client_archived'
            ? 'Clientul este arhivat; datele lui nu se mai schimbă.'
            : status === 404
              ? 'Clientul nu mai există în organizația ta.'
              : status === 401
                ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
                : 'Nu am putut salva instruirea PSI. Verifică conexiunea și încearcă din nou.',
      });
    }
  });

  return { form, onSubmit, busy: update.isPending };
}

function FireSafetyForm({
  start,
  exists,
  clientId,
  userId,
  onDone,
}: {
  start: FireSafety;
  exists: boolean;
  clientId: string;
  userId: string;
  onDone: () => void;
}) {
  const { form, onSubmit, busy } = useFireSafetyForm({ start, clientId, userId, onDone });
  const formRef = useRevealErrors(form);
  const { errors, isDirty } = form.formState;
  const [wasteKinds, wasteDraft] = useWatch({
    control: form.control,
    name: ['wasteKinds', 'wasteDraft'],
  });

  function addWasteKind() {
    const kind = wasteDraft.trim();
    if (!kind) return;
    const problem = wasteKindProblem(kind, wasteKinds);
    if (problem) {
      form.setError('wasteDraft', { message: problem }, { shouldFocus: true });
      return;
    }
    form.setValue('wasteKinds', [...wasteKinds, kind], { shouldDirty: true });
    form.setValue('wasteDraft', '');
    form.clearErrors('wasteDraft');
  }

  function onDraftKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addWasteKind();
  }

  const select = (
    name:
      | 'periodicTrainingHours'
      | 'administrativeTrainingIntervalMonths'
      | 'workerTrainingIntervalMonths'
      | 'trainingFirstMonth',
    id: string,
    placeholder: string,
    choices: readonly { value: string; label: string }[],
    describedById?: string
  ) => (
    <ProgramField
      id={id}
      label={fieldLabels[name]}
      error={errors[name]}
      describedById={describedById}
    >
      {(aria) => (
        <NativeSelect id={id} data-testid={id} disabled={busy} {...aria} {...form.register(name)}>
          <NativeSelectOption value="">{placeholder}</NativeSelectOption>
          {choices.map((choice) => (
            <NativeSelectOption key={choice.value} value={choice.value}>
              {choice.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
    </ProgramField>
  );

  return (
    <form
      ref={formRef}
      data-testid="fire-safety-form"
      onSubmit={(event) => void onSubmit(event)}
      aria-busy={busy}
      noValidate
      className="grid gap-6"
    >
      {!exists && (
        <p data-testid="fire-safety-starting" className="text-sm text-muted-foreground">
          Valori de pornire; salvează pentru a le păstra.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
        <section className="grid content-start gap-4" aria-labelledby="fire-training-title">
          <h3 id="fire-training-title" className="font-semibold">
            Instruirea periodică
          </h3>
          {select('periodicTrainingHours', 'fire-training-hours', 'Alege durata', fireHourChoices)}
          {select(
            'workerTrainingIntervalMonths',
            'fire-worker-interval',
            'Alege intervalul',
            fireIntervalChoices,
            'fire-interval-law'
          )}
          {select(
            'administrativeTrainingIntervalMonths',
            'fire-administrative-interval',
            'Alege intervalul',
            fireIntervalChoices,
            'fire-interval-law'
          )}
          <p id="fire-interval-law" className="-mt-1 text-xs text-muted-foreground">
            Cel mult la 6 luni, după OMAI 712/2005 art. 26.
          </p>
        </section>

        <section
          className="grid content-start gap-4 border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8"
          aria-labelledby="fire-dates-title"
        >
          <h3 id="fire-dates-title" className="font-semibold">
            Programarea instruirii
          </h3>
          {select('trainingFirstMonth', 'fire-first-month', 'Alege luna', monthChoices)}
          <div className="grid gap-4 sm:grid-cols-2">
            {(['trainingDayFrom', 'trainingDayTo'] as const).map((name) => {
              const id = name === 'trainingDayFrom' ? 'fire-day-from' : 'fire-day-to';
              return (
                <ProgramField key={name} id={id} label={fieldLabels[name]} error={errors[name]}>
                  {(aria) => (
                    <Input
                      id={id}
                      data-testid={id}
                      inputMode="numeric"
                      autoComplete="off"
                      disabled={busy}
                      {...aria}
                      {...form.register(name)}
                    />
                  )}
                </ProgramField>
              );
            })}
          </div>
        </section>
      </div>

      <section className="grid gap-4 border-t pt-6" aria-labelledby="fire-rules-title">
        <h3 id="fire-rules-title" className="font-semibold">
          Fumat și deșeuri
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="fire-smoking" label="Fumatul" mark="optional" error={errors.smokingPolicy}>
            <NativeSelect
              id="fire-smoking"
              data-testid="fire-smoking-select"
              disabled={busy}
              aria-invalid={Boolean(errors.smokingPolicy)}
              {...form.register('smokingPolicy')}
            >
              <NativeSelectOption value="">Nestabilit</NativeSelectOption>
              {Object.entries(fireSmokingChoices).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field
            id="fire-waste-contractor-input"
            label="Firma care preia deșeurile"
            mark="optional"
            error={errors.wasteContractor}
          >
            <Input
              id="fire-waste-contractor-input"
              data-testid="fire-waste-contractor-input"
              autoComplete="off"
              disabled={busy}
              aria-invalid={Boolean(errors.wasteContractor)}
              aria-describedby={describedBy('fire-waste-contractor-input', errors.wasteContractor)}
              {...form.register('wasteContractor')}
            />
          </Field>
        </div>
        <Field
          id="fire-waste-input"
          label="Deșeuri colectate"
          mark="required"
          hint={`Scrie un tip de deșeu și apasă Enter. Cel mult ${maxWasteKinds}.`}
          error={errors.wasteDraft}
        >
          {wasteKinds.length > 0 && (
            <WasteChips
              kinds={wasteKinds}
              disabled={busy}
              onRemove={(kind) =>
                form.setValue(
                  'wasteKinds',
                  wasteKinds.filter((item) => item !== kind),
                  { shouldDirty: true }
                )
              }
            />
          )}
          <div className="flex gap-2">
            <Input
              id="fire-waste-input"
              data-testid="fire-waste-input"
              autoComplete="off"
              placeholder="de exemplu, deșeuri de carton, hârtie și plastic"
              disabled={busy}
              aria-invalid={Boolean(errors.wasteDraft)}
              aria-describedby={describedBy('fire-waste-input', errors.wasteDraft, true)}
              onKeyDown={onDraftKey}
              {...form.register('wasteDraft')}
            />
            <Button
              type="button"
              variant="outline"
              className="h-11 shrink-0"
              data-testid="fire-waste-add"
              disabled={busy || !wasteDraft.trim()}
              onClick={addWasteKind}
            >
              <Plus aria-hidden="true" />
              Adaugă
            </Button>
          </div>
        </Field>
      </section>

      {errors.root?.server && (
        <Notice variant="destructive" data-testid="fire-safety-error">
          {errors.root.server.message}
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          data-testid="fire-safety-save"
          disabled={busy || (exists && !isDirty)}
        >
          {busy ? 'Se salvează…' : 'Salvează'}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onDone}>
          Renunță
        </Button>
      </div>
    </form>
  );
}

const fieldLabels = {
  periodicTrainingHours: 'Durata',
  workerTrainingIntervalMonths: staffCategoryLabels.execution,
  administrativeTrainingIntervalMonths: staffCategoryLabels.technical_administrative,
  trainingFirstMonth: 'Prima lună',
  trainingDayFrom: 'Din ziua',
  trainingDayTo: 'Până în ziua',
} as const;
