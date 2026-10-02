import { zodResolver } from '@hookform/resolvers/zod';
import {
  isUnacceptableRiskLevel,
  preventionMeasureKinds,
  riskLevel,
  sheetComponents,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useRouteContext } from '@tanstack/react-router';
import { Plus, X } from 'lucide-react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import {
  getListRiskFactorSuggestionsQueryKey,
  type ListRiskFactorSuggestionsField,
  useListRiskFactorSuggestions,
} from '@/api/generated/api';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { useSavedToast } from '@/features/missing-data/saved-toast';

import type { FactorStore } from './factor-store';
import {
  componentLabels,
  emptyFactorForm,
  factorFormSchema,
  type FactorFormValues,
  gravityClasses,
  gravityOptionLabel,
  measureKindLabels,
  probabilityClasses,
  probabilityOptionLabel,
  type RiskFactor,
  toFactorForm,
  toFactorRequest,
} from './risk-evaluation-schema';

// `null` is closed, 'new' adds a factor, and a factor edits it.
export type FactorEditing = RiskFactor | 'new' | null;

// Floated so the legend is an ordinary grid item: a rendered legend sits on the fieldset's top
// border and cuts it.
const legendClass = 'float-left col-span-full text-sm font-semibold';

export function RiskFactorDialog({
  factors,
  store,
  editing,
  onClose,
}: {
  factors: RiskFactor[];
  store: FactorStore;
  editing: FactorEditing;
  onClose: () => void;
}) {
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      {editing && (
        <RiskFactorForm
          key={editing === 'new' ? 'new' : editing.id}
          after={factors.at(-1)}
          store={store}
          factor={editing === 'new' ? null : editing}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function Suggestions({
  id,
  field,
  query,
}: {
  id: string;
  field: ListRiskFactorSuggestionsField;
  query: string;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const params = { field, query: query.trim() };
  const suggestions = useListRiskFactorSuggestions(params, {
    request: apiRequest,
    query: { queryKey: getListRiskFactorSuggestionsQueryKey(params), staleTime: 30_000 },
  });
  return (
    <datalist id={id}>
      {suggestions.data?.items.map((value) => (
        <option key={value} value={value} />
      ))}
    </datalist>
  );
}

function RiskFactorForm({
  after,
  store,
  factor,
  onClose,
}: {
  after: RiskFactor | undefined;
  store: FactorStore;
  factor: RiskFactor | null;
  onClose: () => void;
}) {
  const savedToast = useSavedToast();
  const form = useForm<FactorFormValues>({
    resolver: zodResolver(factorFormSchema),
    defaultValues: factor ? toFactorForm(factor) : emptyFactorForm(after),
  });
  const measures = useFieldArray({ control: form.control, name: 'measures' });
  const formRef = useRevealErrors(form);
  const { errors, isSubmitting: busy } = form.formState;
  const [group, actions, deadline, responsiblePerson, observations, gravity, probability] =
    useWatch({
      control: form.control,
      name: [
        'group',
        'actions',
        'deadline',
        'responsiblePerson',
        'observations',
        'gravityClass',
        'probabilityClass',
      ],
    });
  const level = gravity && probability ? riskLevel(Number(gravity), Number(probability)) : null;
  const unacceptable = level !== null && isUnacceptableRiskLevel(level);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await store.save(factor?.id ?? null, toFactorRequest(values));
      savedToast(factor ? 'Factorul a fost salvat.' : 'Factorul a fost adăugat.');
      onClose();
    } catch (cause) {
      form.setError('root.server', {
        message: store.failure(
          cause,
          'Nu am putut salva factorul. Verifică conexiunea și încearcă din nou.'
        ),
      });
    }
  });

  const describedBy = (id: string, invalid: boolean, note: string | null = `${id}-hint`) =>
    invalid ? `${id}-error` : (note ?? undefined);

  return (
    <DialogContent
      data-testid="risk-factor-dialog"
      className="sm:max-w-3xl"
      aria-describedby={undefined}
    >
      <form ref={formRef} onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>
            {factor ? 'Modifică factorul de risc' : 'Adaugă un factor de risc'}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="mt-5 grid gap-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="risk-factor-component"
              label="Componenta sistemului de muncă"
              mark="required"
            >
              <NativeSelect
                id="risk-factor-component"
                data-testid="risk-factor-component"
                disabled={busy}
                {...form.register('component')}
              >
                {sheetComponents.map((component) => (
                  <NativeSelectOption key={component} value={component}>
                    {componentLabels[component]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field
              id="risk-factor-group"
              label="Grupa"
              mark="required"
              error={errors.group}
              hint="„Factori de risc mecanic”, „Acțiuni greșite”."
            >
              <Input
                id="risk-factor-group"
                data-testid="risk-factor-group"
                list="risk-factor-group-suggestions"
                autoComplete="off"
                disabled={busy}
                aria-invalid={Boolean(errors.group)}
                aria-describedby={describedBy('risk-factor-group', Boolean(errors.group))}
                {...form.register('group')}
              />
              <Suggestions id="risk-factor-group-suggestions" field="group" query={group} />
            </Field>
            <Field
              id="risk-factor-description"
              label="Descrierea factorului"
              mark="required"
              error={errors.description}
              hint="Forma concretă de manifestare la acest loc de muncă."
              className="sm:col-span-2"
            >
              <Textarea
                id="risk-factor-description"
                data-testid="risk-factor-description"
                rows={2}
                maxLength={1000}
                disabled={busy}
                aria-invalid={Boolean(errors.description)}
                aria-describedby={describedBy(
                  'risk-factor-description',
                  Boolean(errors.description)
                )}
                {...form.register('description')}
              />
            </Field>
          </div>

          <fieldset className="grid gap-5 border-t pt-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem]">
            <legend className={legendClass}>Evaluarea</legend>
            <Field
              id="risk-factor-gravity"
              label="Clasa de gravitate"
              mark="required"
              error={errors.gravityClass}
              hint="Consecința maximă previzibilă."
            >
              <NativeSelect
                id="risk-factor-gravity"
                data-testid="risk-factor-gravity"
                disabled={busy}
                aria-invalid={Boolean(errors.gravityClass)}
                aria-describedby={describedBy('risk-factor-gravity', Boolean(errors.gravityClass))}
                {...form.register('gravityClass')}
              >
                <NativeSelectOption value="">Alege clasa…</NativeSelectOption>
                {gravityClasses.map((value) => (
                  <NativeSelectOption key={value} value={String(value)}>
                    {gravityOptionLabel(value)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field
              id="risk-factor-probability"
              label="Clasa de probabilitate"
              mark="required"
              error={errors.probabilityClass}
            >
              <NativeSelect
                id="risk-factor-probability"
                data-testid="risk-factor-probability"
                disabled={busy}
                aria-invalid={Boolean(errors.probabilityClass)}
                aria-describedby={describedBy(
                  'risk-factor-probability',
                  Boolean(errors.probabilityClass),
                  null
                )}
                {...form.register('probabilityClass')}
              >
                <NativeSelectOption value="">Alege clasa…</NativeSelectOption>
                {probabilityClasses.map((value) => (
                  <NativeSelectOption key={value} value={String(value)}>
                    {probabilityOptionLabel(value)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <div className="grid min-w-0 content-start gap-2">
              <p className="text-sm leading-none font-medium">Nivel de risc</p>
              <div
                data-testid="risk-factor-level"
                data-unacceptable={unacceptable || undefined}
                aria-live="polite"
                className="grid gap-1"
              >
                {level === null ? (
                  <p className="flex h-11 items-center text-2xl text-muted-foreground">
                    <span aria-hidden="true">–</span>
                    <span className="sr-only">Alege cele două clase.</span>
                  </p>
                ) : (
                  <>
                    <p className="flex h-11 items-center gap-2">
                      <span
                        className={cn(
                          'text-2xl font-semibold tabular-nums',
                          unacceptable && 'text-destructive-foreground'
                        )}
                      >
                        <span className="sr-only">Nivel </span>
                        {level}
                      </span>
                      <span
                        className={cn(
                          'text-sm',
                          unacceptable
                            ? 'font-medium text-destructive-foreground'
                            : 'text-muted-foreground'
                        )}
                      >
                        {unacceptable ? 'Inacceptabil' : 'Acceptabil'}
                      </span>
                    </p>
                    {unacceptable && measures.fields.length === 0 && (
                      <p className="text-xs text-destructive-foreground">
                        Are nevoie de cel puțin o măsură de prevenire.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </fieldset>

          <fieldset className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 border-t pt-5">
            <legend className="float-left text-sm font-semibold">Măsuri de prevenire</legend>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="risk-factor-measure-add"
              disabled={busy || measures.fields.length >= 30}
              onClick={() => measures.append({ kind: 'technical', description: '' })}
            >
              <Plus aria-hidden="true" />
              Adaugă o măsură
            </Button>
            {measures.fields.length === 0 ? (
              <p className="col-span-2 text-sm text-muted-foreground">
                Un factor fără măsuri nu intră în planul de prevenire.
              </p>
            ) : (
              <ol className="col-span-2 grid gap-4 sm:gap-3">
                {measures.fields.map((measure, index) => {
                  const error = errors.measures?.[index]?.description;
                  const id = `risk-factor-measure-${index}`;
                  return (
                    <li
                      key={measure.id}
                      data-testid="risk-factor-measure"
                      className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 [grid-template-areas:'kind_remove'_'text_text'] sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-start sm:[grid-template-areas:'kind_text_remove']"
                    >
                      <div className="[grid-area:kind]">
                        <NativeSelect
                          aria-label={`Felul măsurii ${index + 1}`}
                          data-testid="risk-factor-measure-kind"
                          disabled={busy}
                          {...form.register(`measures.${index}.kind`)}
                        >
                          {preventionMeasureKinds.map((kind) => (
                            <NativeSelectOption key={kind} value={kind}>
                              {measureKindLabels[kind]}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      </div>
                      <div className="grid gap-2 [grid-area:text]">
                        <Textarea
                          id={id}
                          aria-label={`Măsura ${index + 1}`}
                          data-testid="risk-factor-measure-description"
                          rows={1}
                          maxLength={2000}
                          disabled={busy}
                          className="min-h-11 py-3"
                          aria-invalid={Boolean(error)}
                          aria-describedby={error ? `${id}-error` : undefined}
                          {...form.register(`measures.${index}.description`)}
                        />
                        {error && (
                          <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
                            {error.message}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11 [grid-area:remove]"
                        data-testid="risk-factor-measure-remove"
                        aria-label={`Scoate măsura ${index + 1}`}
                        disabled={busy}
                        onClick={() => measures.remove(index)}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </li>
                  );
                })}
              </ol>
            )}
          </fieldset>

          <fieldset className="grid gap-5 border-t pt-5 sm:grid-cols-2">
            <legend className={legendClass}>Planul de prevenire</legend>
            <p
              id="risk-factor-plan-note"
              className="-mt-3 text-sm text-muted-foreground sm:col-span-2"
            >
              Termenul și persoana care răspunde sunt cerute când factorul are măsuri.
            </p>
            <Field
              id="risk-factor-actions"
              label="Acțiuni în vederea realizării măsurilor"
              mark="optional"
              error={errors.actions}
              className="sm:col-span-2"
            >
              <Input
                id="risk-factor-actions"
                data-testid="risk-factor-actions"
                list="risk-factor-actions-suggestions"
                autoComplete="off"
                disabled={busy}
                aria-invalid={Boolean(errors.actions)}
                aria-describedby={describedBy('risk-factor-actions', Boolean(errors.actions), null)}
                {...form.register('actions')}
              />
              <Suggestions id="risk-factor-actions-suggestions" field="actions" query={actions} />
            </Field>
            <Field id="risk-factor-deadline" label="Termen" error={errors.deadline}>
              <Input
                id="risk-factor-deadline"
                data-testid="risk-factor-deadline"
                list="risk-factor-deadline-suggestions"
                autoComplete="off"
                disabled={busy}
                aria-invalid={Boolean(errors.deadline)}
                aria-describedby={describedBy(
                  'risk-factor-deadline',
                  Boolean(errors.deadline),
                  'risk-factor-plan-note'
                )}
                {...form.register('deadline')}
              />
              <Suggestions
                id="risk-factor-deadline-suggestions"
                field="deadline"
                query={deadline}
              />
            </Field>
            <Field
              id="risk-factor-responsible"
              label="Persoana care răspunde"
              error={errors.responsiblePerson}
            >
              <Input
                id="risk-factor-responsible"
                data-testid="risk-factor-responsible"
                list="risk-factor-responsible-suggestions"
                autoComplete="off"
                disabled={busy}
                aria-invalid={Boolean(errors.responsiblePerson)}
                aria-describedby={describedBy(
                  'risk-factor-responsible',
                  Boolean(errors.responsiblePerson),
                  'risk-factor-plan-note'
                )}
                {...form.register('responsiblePerson')}
              />
              <Suggestions
                id="risk-factor-responsible-suggestions"
                field="responsiblePerson"
                query={responsiblePerson}
              />
            </Field>
            <Field
              id="risk-factor-observations"
              label="Observații"
              mark="optional"
              error={errors.observations}
              className="sm:col-span-2"
            >
              <Input
                id="risk-factor-observations"
                data-testid="risk-factor-observations"
                list="risk-factor-observations-suggestions"
                autoComplete="off"
                disabled={busy}
                aria-invalid={Boolean(errors.observations)}
                aria-describedby={describedBy(
                  'risk-factor-observations',
                  Boolean(errors.observations),
                  null
                )}
                {...form.register('observations')}
              />
              <Suggestions
                id="risk-factor-observations-suggestions"
                field="observations"
                query={observations}
              />
            </Field>
          </fieldset>
          {errors.root?.server && (
            <Notice variant="destructive" data-testid="risk-factor-error">
              {errors.root.server.message}
            </Notice>
          )}
        </DialogBody>
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="risk-factor-save" disabled={busy}>
            {busy ? 'Se salvează…' : factor ? 'Salvează' : 'Adaugă'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
