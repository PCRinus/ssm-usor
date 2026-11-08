import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent } from '@ssm-usor/ui/components/card';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useRouteContext } from '@tanstack/react-router';
import { Plus, X } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import {
  Controller,
  type FieldValues,
  useForm,
  type UseFormReturn,
  useWatch,
} from 'react-hook-form';

import {
  type ApiErrorResponse,
  type ClientFireSafetyResponse,
  getGetClientFireSafetyQueryKey,
  type UpdateClientFireSafetyRequest,
  useGetClientFireSafety,
  useUpdateClientFireSafety,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { EditAction, Fact, FactList, SectionCard } from '@/components/section-card';
import { useInPlaceEdit } from '@/components/use-in-place-edit';
import { useRevealErrors } from '@/components/use-reveal-errors';
import type { JobPosition } from '@/features/job-positions/job-position-schema';
import { useJobPositionOptions } from '@/features/job-positions/use-job-position-options';
import { type FireTrainingFocus, useFocusRequest } from '@/features/missing-data/focus';
import { useSavedToast } from '@/features/missing-data/saved-toast';

import {
  completeFireSchedule,
  fireCategoryInterval,
  fireIntervalField,
  fireRulesChange,
  fireRulesFormSchema,
  type FireRulesFormValues,
  type FireSafety,
  fireSafetyRequest,
  fireScheduleChange,
  fireScheduleFormSchema,
  type FireScheduleFormValues,
  fireSmokingChoices,
  firstFireScheduleField,
  maxWasteKinds,
  startingFireSchedule,
  toFireRulesForm,
  toFireScheduleForm,
  wasteKindProblem,
} from './fire-safety-schema';
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
  legalMaxInterval,
} from './schedule-rules';
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
  const positions = useJobPositionOptions(client.id, userId);
  if (fireSafety.isPending || details.isPending || positions.isPending) {
    return <Skeleton className="h-56 w-full rounded-xl" />;
  }
  if (fireSafety.isError || positions.isError) {
    const failed = fireSafety.isError ? fireSafety : positions;
    return (
      <Card data-testid="fire-safety-unavailable">
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
            Nu am putut încărca instruirea SU.
          </Notice>
        </CardContent>
      </Card>
    );
  }
  const { fireSafety: saved, exists } = fireSafety.data;
  return (
    <>
      <FireScheduleCard
        saved={saved}
        exists={exists}
        occupational={details.data?.documentDetails ?? null}
        positions={positions.data.items}
        client={client}
        userId={userId}
        focus={focus === 'fire-training-schedule'}
      />
      <FireRulesCard
        saved={saved}
        exists={exists}
        client={client}
        userId={userId}
        focus={focus === 'fire-smoking' || focus === 'fire-waste' ? focus : undefined}
      />
    </>
  );
}

// The route replaces every field and two cards edit the row, so each sends its own fields over
// what is saved when it saves.
function useFireSafetySave<Values extends FieldValues>({
  form,
  saved,
  clientId,
  userId,
  change,
  successMessage,
  onDone,
}: {
  form: UseFormReturn<Values>;
  saved: FireSafety;
  clientId: string;
  userId: string;
  change: (values: Values) => Partial<UpdateClientFireSafetyRequest>;
  successMessage: string;
  onDone: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const savedToast = useSavedToast();
  const update = useUpdateClientFireSafety({ request: apiRequest });

  const queryKey = [...getGetClientFireSafetyQueryKey(clientId), userId];
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      // `saved` is from the last render, and the other card may have saved since.
      const latest = queryClient.getQueryData<ClientFireSafetyResponse>(queryKey)?.fireSafety;
      const response = await update.mutateAsync({
        clientId,
        data: { ...fireSafetyRequest(latest ?? saved), ...change(values) },
      });
      queryClient.setQueryData(queryKey, response);
      await queryClient.invalidateQueries({ queryKey });
      savedToast(successMessage);
      onDone();
    } catch (cause) {
      const status = cause instanceof ApiHttpError ? cause.status : null;
      const reason =
        cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>).reason : null;
      form.setError('root.server' as never, {
        message:
          status === 409 && reason === 'client_archived'
            ? 'Clientul este arhivat; datele lui nu se mai schimbă.'
            : status === 404
              ? 'Clientul nu mai există în organizația ta.'
              : status === 401
                ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
                : 'Nu am putut salva instruirea SU. Verifică conexiunea și încearcă din nou.',
      });
    }
  });

  return { onSubmit, busy: update.isPending };
}

function FireScheduleCard({
  saved,
  exists,
  occupational,
  positions,
  client,
  userId,
  focus,
}: {
  saved: FireSafety;
  exists: boolean;
  occupational: Parameters<typeof startingFireSchedule>[1];
  positions: readonly JobPosition[];
  client: ClientSummary;
  userId: string;
  focus: boolean;
}) {
  const readOnly = client.archivedAt !== null;
  const categories = categoriesWithPosts(positions);
  const { start, starting } = startingFireSchedule(saved, occupational);
  const { editing, editRef, open, close } = useInPlaceEdit();
  useFocusRequest(focus, {
    anchor: () => editRef.current,
    open: readOnly ? undefined : open,
    field: readOnly ? undefined : firstFireScheduleField(start, categories),
  });
  const empty = !exists || starting;

  return (
    <SectionCard
      data-testid="fire-safety-card"
      title="Instruire SU"
      action={
        !readOnly &&
        !editing && (
          <EditAction ref={editRef} empty={empty} data-testid="fire-safety-edit" onClick={open} />
        )
      }
    >
      {editing ? (
        <FireScheduleForm
          saved={saved}
          start={start}
          starting={starting}
          categories={categories}
          clientId={client.id}
          userId={userId}
          onDone={close}
        />
      ) : empty ? (
        <p data-testid="fire-schedule-empty" className="text-sm text-muted-foreground">
          Programul instruirii SU nu a fost completat.
        </p>
      ) : (
        <FireScheduleSummary saved={saved} categories={categories} clientId={client.id} />
      )}
    </SectionCard>
  );
}

function FireScheduleSummary({
  saved,
  categories,
  clientId,
}: {
  saved: FireSafety;
  categories: readonly CategoryPosts[];
  clientId: string;
}) {
  const schedule = completeFireSchedule(saved, categories);
  return (
    <div className="grid gap-4">
      {categories.length === 0 ? (
        <NoPostsBlock action={<PositionsButton clientId={clientId} />} />
      ) : (
        <div className="grid gap-3">
          {categories.map(({ category, positions }) => (
            <CategoryBlock
              key={category}
              testId={`fire-schedule-${category === 'execution' ? 'execution' : 'administrative'}`}
              category={category}
              positions={positions}
              interval={fireCategoryInterval(saved, category)}
              firstMonth={saved.trainingFirstMonth}
            />
          ))}
        </div>
      )}
      {schedule ? (
        <p data-testid="fire-schedule-session" className="text-sm">
          <SessionSentence
            duration={durationText('su', schedule.periodicTrainingHours)}
            dayFrom={schedule.trainingDayFrom}
            dayTo={schedule.trainingDayTo}
          />
        </p>
      ) : (
        <p data-testid="fire-schedule-incomplete" className="text-sm text-muted-foreground">
          Programul nu e complet: alege la Modifică ce lipsește dintre intervale, prima lună, zile
          și durată.
        </p>
      )}
    </div>
  );
}

function FireScheduleForm({
  saved,
  start,
  starting,
  categories,
  clientId,
  userId,
  onDone,
}: {
  saved: FireSafety;
  start: FireSafety;
  starting: boolean;
  categories: readonly CategoryPosts[];
  clientId: string;
  userId: string;
  onDone: () => void;
}) {
  const unsaved = categories
    .map(({ category }) => category)
    .filter((category) => fireCategoryInterval(start, category) === null);
  const form = useForm<FireScheduleFormValues>({
    resolver: zodResolver(fireScheduleFormSchema),
    defaultValues: {
      ...toFireScheduleForm(start),
      ...Object.fromEntries(
        unsaved.map((category) => [
          fireIntervalField[category],
          String(legalMaxInterval('su', category)),
        ])
      ),
    },
  });
  const { onSubmit, busy } = useFireSafetySave({
    form,
    saved,
    clientId,
    userId,
    change: (values) => fireScheduleChange(values, categories),
    successMessage: 'Instruirea SU a fost salvată.',
    onDone,
  });
  const formRef = useRevealErrors(form);
  const { errors, isDirty, isSubmitted } = form.formState;
  const values = useWatch({ control: form.control });
  const set = (field: keyof FireScheduleFormValues, value: string) =>
    form.setValue(field, value, { shouldDirty: true, shouldValidate: isSubmitted });
  // Each day's message depends on the other day.
  const setDay = (field: 'trainingDayFrom' | 'trainingDayTo', value: string) => {
    form.setValue(field, value, { shouldDirty: true });
    if (isSubmitted) void form.trigger(['trainingDayFrom', 'trainingDayTo']);
  };
  const number = (value: string | undefined) => (value ? Number(value) : null);

  return (
    <form
      ref={formRef}
      data-testid="fire-safety-form"
      onSubmit={(event) => void onSubmit(event)}
      aria-busy={busy}
      noValidate
      className="grid gap-8"
    >
      {starting && (
        <p data-testid="fire-safety-starting" className="-mb-4 text-sm text-muted-foreground">
          Valori de pornire: durata minimă, intervalul cel mai lung permis de lege și calendarul
          instruirii SSM. Salvează programul ca să le păstrezi.
        </p>
      )}
      <TrainingScheduleFields
        domain="su"
        idPrefix="fire"
        categories={categories.map((entry) => ({
          ...entry,
          interval: number(values[fireIntervalField[entry.category]]),
          error: errors[fireIntervalField[entry.category]],
          blockNote:
            !starting && unsaved.includes(entry.category) ? (
              <p
                data-testid={`fire-safety-new-category-${entry.category}`}
                className="text-xs text-muted-foreground"
              >
                Intervalul nu e salvat încă. Am ales intervalul cel mai lung permis de lege;
                salvează programul ca să-l păstrezi.
              </p>
            ) : null,
        }))}
        firstMonth={number(values.trainingFirstMonth)}
        dayFrom={values.trainingDayFrom ?? ''}
        dayTo={values.trainingDayTo ?? ''}
        duration={number(values.periodicTrainingHours)}
        disabled={busy}
        errors={{
          firstMonth: errors.trainingFirstMonth,
          dayFrom: errors.trainingDayFrom,
          dayTo: errors.trainingDayTo,
          duration: errors.periodicTrainingHours,
        }}
        postsLink={<PositionsLink clientId={clientId} />}
        noPostsAction={<PositionsButton clientId={clientId} />}
        onIntervalChange={(category, months) => set(fireIntervalField[category], String(months))}
        onFirstMonthChange={(month) =>
          set('trainingFirstMonth', month === null ? '' : String(month))
        }
        onDayFromChange={(day) => setDay('trainingDayFrom', day)}
        onDayToChange={(day) => setDay('trainingDayTo', day)}
        onDurationChange={(hours) => set('periodicTrainingHours', String(hours))}
      />

      {errors.root?.server && (
        <Notice variant="destructive" data-testid="fire-safety-error">
          {errors.root.server.message}
        </Notice>
      )}
      <div className="grid gap-2 sm:flex sm:flex-wrap">
        <Button
          type="submit"
          data-testid="fire-safety-save"
          disabled={busy || (!starting && !isDirty && unsaved.length === 0)}
        >
          {busy ? 'Se salvează…' : 'Salvează programul'}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onDone}>
          Renunță
        </Button>
      </div>
    </form>
  );
}

const unset = (label = 'Necompletat') => (
  <span className="font-normal text-muted-foreground">{label}</span>
);

function FireRulesCard({
  saved,
  exists,
  client,
  userId,
  focus,
}: {
  saved: FireSafety;
  exists: boolean;
  client: ClientSummary;
  userId: string;
  focus?: 'fire-smoking' | 'fire-waste';
}) {
  const readOnly = client.archivedAt !== null;
  const { editing, editRef, open, close } = useInPlaceEdit();
  const empty =
    !exists ||
    (saved.smokingPolicy === null &&
      saved.wasteKinds.length === 0 &&
      saved.wasteContractor === null &&
      saved.wasteCollectors === null &&
      !saved.hasThirdParties);
  useFocusRequest(focus !== undefined, {
    anchor: () => editRef.current,
    open: readOnly ? undefined : open,
    field: readOnly ? undefined : focus === 'fire-waste' ? 'fire-waste-input' : 'fire-smoking',
  });

  return (
    <SectionCard
      data-testid="fire-rules-card"
      title="Fumat și deșeuri"
      action={
        !readOnly &&
        !editing && (
          <EditAction ref={editRef} empty={empty} data-testid="fire-rules-edit" onClick={open} />
        )
      }
    >
      {editing ? (
        <FireRulesForm saved={saved} clientId={client.id} userId={userId} onDone={close} />
      ) : (
        <FactList>
          <Fact label="Fumatul" testId="fire-smoking">
            {saved.smokingPolicy ? fireSmokingChoices[saved.smokingPolicy] : unset('Nestabilit')}
          </Fact>
          {saved.smokingPolicy === 'designated_places' && (
            <Fact label="Locul pentru fumat" testId="fire-smoking-place">
              {saved.smokingPlace ?? unset()}
            </Fact>
          )}
          <Fact label="Firma care preia deșeurile" testId="fire-waste-contractor">
            {saved.wasteContractor}
          </Fact>
          <Fact label="Cine colectează deșeurile" testId="fire-waste-collectors">
            {saved.wasteCollectors ?? unset('Lucrătorii aflați la program')}
          </Fact>
          <Fact label="Alte firme în spațiile clientului" testId="fire-third-parties">
            {saved.hasThirdParties ? 'Da' : 'Nu'}
          </Fact>
          <Fact label="Deșeuri colectate" wide testId="fire-waste-kinds">
            {saved.wasteKinds.length === 0 ? unset() : <WasteChips kinds={saved.wasteKinds} />}
          </Fact>
        </FactList>
      )}
    </SectionCard>
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

function FireRulesForm({
  saved,
  clientId,
  userId,
  onDone,
}: {
  saved: FireSafety;
  clientId: string;
  userId: string;
  onDone: () => void;
}) {
  const form = useForm<FireRulesFormValues>({
    resolver: zodResolver(fireRulesFormSchema),
    defaultValues: toFireRulesForm(saved),
  });
  const { onSubmit, busy } = useFireSafetySave({
    form,
    saved,
    clientId,
    userId,
    change: fireRulesChange,
    successMessage: 'Fumatul și deșeurile au fost salvate.',
    onDone,
  });
  const formRef = useRevealErrors(form);
  const { errors, isDirty } = form.formState;
  const [wasteKinds, wasteDraft, smokingPolicy] = useWatch({
    control: form.control,
    name: ['wasteKinds', 'wasteDraft', 'smokingPolicy'],
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

  return (
    <form
      ref={formRef}
      data-testid="fire-rules-form"
      onSubmit={(event) => void onSubmit(event)}
      aria-busy={busy}
      noValidate
      className="grid gap-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="fire-smoking" label="Fumatul" mark="required" error={errors.smokingPolicy}>
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
        {smokingPolicy === 'designated_places' && (
          <Field
            id="fire-smoking-place-input"
            label="Locul pentru fumat"
            mark="optional"
            hint="Dacă îl lași gol, decizia privind fumatul spune doar că locurile sunt marcate „LOC PENTRU FUMAT”."
            error={errors.smokingPlace}
          >
            <Input
              id="fire-smoking-place-input"
              data-testid="fire-smoking-place-input"
              autoComplete="off"
              placeholder="de exemplu, în curtea interioară, lângă poarta de acces auto"
              disabled={busy}
              aria-invalid={Boolean(errors.smokingPlace)}
              aria-describedby={describedBy('fire-smoking-place-input', errors.smokingPlace, true)}
              {...form.register('smokingPlace')}
            />
          </Field>
        )}
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
        <Field
          id="fire-waste-collectors-input"
          label="Cine colectează deșeurile"
          mark="optional"
          hint="Dacă îl lași gol, decizia privind deșeurile numește „lucrătorii aflați la program din cadrul unității”."
          error={errors.wasteCollectors}
        >
          <Input
            id="fire-waste-collectors-input"
            data-testid="fire-waste-collectors-input"
            autoComplete="off"
            placeholder="de exemplu, muncitorii necalificați și șeful de șantier"
            disabled={busy}
            aria-invalid={Boolean(errors.wasteCollectors)}
            aria-describedby={describedBy(
              'fire-waste-collectors-input',
              errors.wasteCollectors,
              true
            )}
            {...form.register('wasteCollectors')}
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
      <div className="grid gap-1">
        <div className="flex items-center gap-3">
          <Controller
            control={form.control}
            name="hasThirdParties"
            render={({ field }) => (
              <Checkbox
                id="fire-third-parties-input"
                data-testid="fire-third-parties-input"
                checked={field.value}
                disabled={busy}
                aria-describedby="fire-third-parties-hint"
                onCheckedChange={(checked) => field.onChange(checked === true)}
                onBlur={field.onBlur}
              />
            )}
          />
          <Label htmlFor="fire-third-parties-input">
            În spațiile clientului lucrează și alte firme (chiriași, prestatori)
          </Label>
        </div>
        <p id="fire-third-parties-hint" className="pl-7 text-xs text-muted-foreground">
          Decizia privind controlul propriu adaugă controlul trimestrial al acestor firme.
        </p>
      </div>

      {errors.root?.server && (
        <Notice variant="destructive" data-testid="fire-rules-error">
          {errors.root.server.message}
        </Notice>
      )}
      <div className="grid gap-2 sm:flex sm:flex-wrap">
        <Button type="submit" data-testid="fire-rules-save" disabled={busy || !isDirty}>
          {busy ? 'Se salvează…' : 'Salvează'}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onDone}>
          Renunță
        </Button>
      </div>
    </form>
  );
}
