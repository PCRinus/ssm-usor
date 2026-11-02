import { zodResolver } from '@hookform/resolvers/zod';
import { defaultExposure } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { useForm } from 'react-hook-form';

import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { EditAction, Fact, FactList, FormActions, SectionCard } from '@/components/section-card';
import { useInPlaceEdit } from '@/components/use-in-place-edit';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { employeeCountLabel, type JobPosition } from '@/features/job-positions/job-position-schema';
import { useSavedToast } from '@/features/missing-data/saved-toast';

import { failureReason } from './evaluation-failure';
import {
  evaluationNameSchema,
  libraryWorkSystemFormSchema,
  toWorkSystemForm,
  type WorkSystem,
  workSystemFormSchema,
  type WorkSystemFormValues,
} from './risk-evaluation-schema';
import type { WorkSystemStore } from './work-system-store';

const multiline = (text: string | null) =>
  text && <span className="whitespace-pre-line">{text}</span>;

const isClientLevel = (kind: WorkSystem['kind']) => kind === 'sensitive_groups' || kind === 'other';

const descriptions: Partial<Record<WorkSystem['kind'], string>> = {
  job_position:
    'Sarcina de muncă și persoanele expuse se iau din post: activitățile și angajații lui.',
  library: 'Când aplici evaluarea, aceste texte completează doar câmpurile goale ale fișei.',
};

const formSchemas: Partial<Record<WorkSystem['kind'], typeof workSystemFormSchema>> = {
  other: workSystemFormSchema.extend({ name: evaluationNameSchema }),
  library: libraryWorkSystemFormSchema,
};

export function WorkSystemCard({
  id,
  workSystem,
  store,
  position,
  readOnly,
}: {
  id: string;
  workSystem: WorkSystem;
  store: WorkSystemStore;
  position?: JobPosition;
  readOnly: boolean;
}) {
  const { editing, editRef, open, close } = useInPlaceEdit();
  const clientLevel = isClientLevel(workSystem.kind);

  return (
    <SectionCard
      id={id}
      headingLevel={3}
      data-testid="work-system-card"
      title="Sistemul de muncă"
      description={descriptions[workSystem.kind]}
      action={
        !readOnly &&
        !editing && <EditAction ref={editRef} data-testid="work-system-edit" onClick={open} />
      }
    >
      {editing && !readOnly ? (
        <WorkSystemForm workSystem={workSystem} store={store} onClose={close} />
      ) : (
        <FactList>
          {workSystem.kind === 'other' && (
            <Fact label="Denumire" testId="work-system-name">
              {workSystem.name}
            </Fact>
          )}
          {clientLevel ? (
            <>
              <Fact label="Persoane expuse" testId="work-system-exposed-persons">
                {workSystem.exposedPersons}
              </Fact>
              <Fact label="Sarcina de muncă" wide testId="work-system-work-task">
                {multiline(workSystem.workTask)}
              </Fact>
            </>
          ) : (
            position && (
              <>
                <Fact label="Persoane expuse">{employeeCountLabel(position.employeeCount)}</Fact>
                <Fact label="Sarcina de muncă (activitățile postului)" wide>
                  {multiline(position.activities)}
                </Fact>
              </>
            )
          )}
          <Fact label="Mijloace de producție" wide testId="work-system-means">
            {multiline(workSystem.meansOfProduction)}
          </Fact>
          <Fact label="Mediul de muncă" wide testId="work-system-environment">
            {multiline(workSystem.workEnvironment)}
          </Fact>
          <Fact label="Expunere" testId="work-system-exposure">
            {workSystem.exposure}
          </Fact>
        </FactList>
      )}
    </SectionCard>
  );
}

function WorkSystemForm({
  workSystem,
  store,
  onClose,
}: {
  workSystem: WorkSystem;
  store: WorkSystemStore;
  onClose: () => void;
}) {
  const savedToast = useSavedToast();
  const form = useForm<WorkSystemFormValues>({
    resolver: zodResolver(formSchemas[workSystem.kind] ?? workSystemFormSchema),
    defaultValues: toWorkSystemForm(workSystem),
  });
  const formRef = useRevealErrors(form);
  const { errors, isDirty, isSubmitting: busy } = form.formState;
  const clientLevel = isClientLevel(workSystem.kind);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await store.save(values);
      savedToast('Sistemul de muncă a fost salvat.');
      onClose();
    } catch (cause) {
      const message = store.failure(
        cause,
        'Nu am putut salva sistemul de muncă. Verifică conexiunea și încearcă din nou.'
      );
      if (failureReason(cause) === 'risk_evaluation_name_taken') {
        form.setError('name', { message });
      } else {
        form.setError('root.server', { message });
      }
    }
  });

  const textField = (
    name: 'workTask' | 'meansOfProduction' | 'workEnvironment',
    label: string,
    hint: string
  ) => {
    const id = `work-system-${name}`;
    return (
      <Field
        id={id}
        label={label}
        mark="optional"
        hint={hint}
        error={errors[name]}
        className="sm:col-span-2"
      >
        <Textarea
          id={id}
          data-testid={id}
          rows={3}
          maxLength={2000}
          disabled={busy}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? `${id}-error` : `${id}-hint`}
          {...form.register(name)}
        />
      </Field>
    );
  };

  return (
    <form
      ref={formRef}
      data-testid="work-system-form"
      onSubmit={(event) => void onSubmit(event)}
      aria-busy={busy}
      noValidate
      className="grid gap-5 sm:grid-cols-2"
    >
      {workSystem.kind === 'other' && (
        <Field id="work-system-name" label="Denumire" mark="required" error={errors.name}>
          <Input
            id="work-system-name"
            data-testid="work-system-name-input"
            autoComplete="off"
            maxLength={160}
            disabled={busy}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'work-system-name-error' : undefined}
            {...form.register('name')}
          />
        </Field>
      )}
      {clientLevel && (
        <>
          <Field
            id="work-system-exposedPersons"
            label="Persoane expuse"
            mark="optional"
            hint="„Min. 3 persoane”, „Vizitatorii punctului de lucru”."
            error={errors.exposedPersons}
            className={workSystem.kind === 'other' ? undefined : 'sm:col-span-2'}
          >
            <Input
              id="work-system-exposedPersons"
              data-testid="work-system-exposedPersons"
              autoComplete="off"
              maxLength={120}
              disabled={busy}
              aria-invalid={Boolean(errors.exposedPersons)}
              aria-describedby={
                errors.exposedPersons
                  ? 'work-system-exposedPersons-error'
                  : 'work-system-exposedPersons-hint'
              }
              {...form.register('exposedPersons')}
            />
          </Field>
          {textField('workTask', 'Sarcina de muncă', 'Ce fac persoanele evaluate aici.')}
        </>
      )}
      {textField(
        'meansOfProduction',
        'Mijloace de producție',
        'Echipamentele de muncă, uneltele și materialele folosite.'
      )}
      {textField(
        'workEnvironment',
        'Mediul de muncă',
        'Spațiul, microclimatul, iluminatul, zgomotul.'
      )}
      <Field
        id="work-system-exposure"
        label="Expunere"
        mark={workSystem.kind === 'library' ? 'optional' : 'required'}
        hint={
          workSystem.kind === 'library'
            ? 'Lasă gol ca fiecare fișă să-și păstreze expunerea.'
            : `De obicei „${defaultExposure}”.`
        }
        error={errors.exposure}
      >
        <Input
          id="work-system-exposure"
          data-testid="work-system-exposure-input"
          autoComplete="off"
          maxLength={120}
          disabled={busy}
          aria-invalid={Boolean(errors.exposure)}
          aria-describedby={
            errors.exposure ? 'work-system-exposure-error' : 'work-system-exposure-hint'
          }
          {...form.register('exposure')}
        />
      </Field>
      {errors.root?.server && (
        <Notice variant="destructive" data-testid="work-system-error" className="sm:col-span-2">
          {errors.root.server.message}
        </Notice>
      )}
      <FormActions>
        <Button type="submit" data-testid="work-system-save" disabled={busy || !isDirty}>
          {busy ? 'Se salvează…' : 'Salvează'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          data-testid="work-system-cancel"
          disabled={busy}
          onClick={onClose}
        >
          Renunță
        </Button>
      </FormActions>
    </form>
  );
}
