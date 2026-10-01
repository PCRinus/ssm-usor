import { zodResolver } from '@hookform/resolvers/zod';
import { defaultExposure } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { useRouteContext } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';

import { useUpdateRiskEvaluation } from '@/api/generated/api';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { EditAction, Fact, FactList, FormActions, SectionCard } from '@/components/section-card';
import { useInPlaceEdit } from '@/components/use-in-place-edit';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { employeeCountLabel, type JobPosition } from '@/features/job-positions/job-position-schema';
import { useSavedToast } from '@/features/missing-data/saved-toast';

import { evaluationFailure, failureReason } from './evaluation-failure';
import {
  evaluationNameSchema,
  type RiskEvaluation,
  toWorkSystemForm,
  toWorkSystemRequest,
  workSystemFormSchema,
  type WorkSystemFormValues,
} from './risk-evaluation-schema';
import { useEvaluationCache } from './use-evaluation-cache';

const multiline = (text: string | null) =>
  text && <span className="whitespace-pre-line">{text}</span>;

export function WorkSystemCard({
  id,
  evaluation,
  position,
  readOnly,
}: {
  id: string;
  evaluation: RiskEvaluation;
  position?: JobPosition;
  readOnly: boolean;
}) {
  const { editing, editRef, open, close } = useInPlaceEdit();
  const clientLevel = evaluation.kind !== 'job_position';

  return (
    <SectionCard
      id={id}
      headingLevel={3}
      data-testid="work-system-card"
      title="Sistemul de muncă"
      description={
        !clientLevel &&
        'Sarcina de muncă și persoanele expuse se iau din post: activitățile și angajații lui.'
      }
      action={
        !readOnly &&
        !editing && <EditAction ref={editRef} data-testid="work-system-edit" onClick={open} />
      }
    >
      {editing && !readOnly ? (
        <WorkSystemForm evaluation={evaluation} onClose={close} />
      ) : (
        <FactList>
          {evaluation.kind === 'other' && (
            <Fact label="Denumire" testId="work-system-name">
              {evaluation.name}
            </Fact>
          )}
          {clientLevel ? (
            <>
              <Fact label="Persoane expuse" testId="work-system-exposed-persons">
                {evaluation.exposedPersons}
              </Fact>
              <Fact label="Sarcina de muncă" wide testId="work-system-work-task">
                {multiline(evaluation.workTask)}
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
            {multiline(evaluation.meansOfProduction)}
          </Fact>
          <Fact label="Mediul de muncă" wide testId="work-system-environment">
            {multiline(evaluation.workEnvironment)}
          </Fact>
          <Fact label="Expunere" testId="work-system-exposure">
            {evaluation.exposure}
          </Fact>
        </FactList>
      )}
    </SectionCard>
  );
}

function WorkSystemForm({
  evaluation,
  onClose,
}: {
  evaluation: RiskEvaluation;
  onClose: () => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const savedToast = useSavedToast();
  const cache = useEvaluationCache(evaluation.clientId);
  const update = useUpdateRiskEvaluation({ request: apiRequest });
  const schema =
    evaluation.kind === 'other'
      ? workSystemFormSchema.extend({ name: evaluationNameSchema })
      : workSystemFormSchema;
  const form = useForm<WorkSystemFormValues>({
    resolver: zodResolver(schema),
    defaultValues: toWorkSystemForm(evaluation),
  });
  const formRef = useRevealErrors(form);
  const { errors, isDirty } = form.formState;
  const busy = update.isPending;
  const clientLevel = evaluation.kind !== 'job_position';

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await update.mutateAsync({
        clientId: evaluation.clientId,
        evaluationId: evaluation.id,
        data: toWorkSystemRequest(evaluation.kind, values),
      });
      await cache.saved(result.evaluation);
      savedToast('Sistemul de muncă a fost salvat.');
      onClose();
    } catch (cause) {
      const message = evaluationFailure(
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
      {evaluation.kind === 'other' && (
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
            className={evaluation.kind === 'other' ? undefined : 'sm:col-span-2'}
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
        mark="required"
        hint={`De obicei „${defaultExposure}”.`}
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
