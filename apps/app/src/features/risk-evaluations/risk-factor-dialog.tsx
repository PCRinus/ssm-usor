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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Textarea } from '@ssm-usor/ui/components/textarea';
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
import { RiskLevelBadge } from './risk-level-badge';

// `null` is closed, 'new' adds a factor, and a factor edits it.
export type FactorEditing = RiskFactor | 'new' | null;

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

  const describedBy = (id: string, invalid: boolean, hint = true) =>
    invalid ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <DialogContent data-testid="risk-factor-dialog" className="sm:max-w-3xl">
      <form ref={formRef} onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>
            {factor ? 'Modifică factorul de risc' : 'Adaugă un factor de risc'}
          </DialogTitle>
          <DialogDescription>
            Clasele le alegi tu; nivelul de risc se citește din grila metodei.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-5 grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="risk-factor-component"
              label="Componenta sistemului de muncă"
              mark="required"
            >
              <NativeSelect
                id="risk-factor-component"
                data-testid="risk-factor-component"
                className="w-full"
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
          </div>
          <Field
            id="risk-factor-description"
            label="Descrierea factorului"
            mark="required"
            error={errors.description}
            hint="Forma concretă în care apare la acest loc de muncă."
          >
            <Textarea
              id="risk-factor-description"
              data-testid="risk-factor-description"
              rows={2}
              maxLength={1000}
              disabled={busy}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={describedBy('risk-factor-description', Boolean(errors.description))}
              {...form.register('description')}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
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
                className="w-full"
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
              hint="Cât de des se poate produce consecința."
            >
              <NativeSelect
                id="risk-factor-probability"
                data-testid="risk-factor-probability"
                className="w-full"
                disabled={busy}
                aria-invalid={Boolean(errors.probabilityClass)}
                aria-describedby={describedBy(
                  'risk-factor-probability',
                  Boolean(errors.probabilityClass)
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
          </div>
          <p
            data-testid="risk-factor-level"
            aria-live="polite"
            className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          >
            {level === null ? (
              'Nivelul de risc apare după ce alegi cele două clase.'
            ) : (
              <>
                <RiskLevelBadge level={level} />
                {isUnacceptableRiskLevel(level)
                  ? 'Inacceptabil: are nevoie de cel puțin o măsură de prevenire.'
                  : 'Acceptabil.'}
              </>
            )}
          </p>

          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-medium">Măsuri de prevenire</legend>
            {measures.fields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nicio măsură încă. Planul de prevenire cuprinde factorii care au măsuri.
              </p>
            )}
            <ol className="grid gap-3">
              {measures.fields.map((measure, index) => {
                const error = errors.measures?.[index]?.description;
                const id = `risk-factor-measure-${index}`;
                return (
                  <li
                    key={measure.id}
                    data-testid="risk-factor-measure"
                    className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-start"
                  >
                    <NativeSelect
                      aria-label={`Felul măsurii ${index + 1}`}
                      data-testid="risk-factor-measure-kind"
                      className="w-full"
                      disabled={busy}
                      {...form.register(`measures.${index}.kind`)}
                    >
                      {preventionMeasureKinds.map((kind) => (
                        <NativeSelectOption key={kind} value={kind}>
                          {measureKindLabels[kind]}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <div className="grid gap-1">
                      <Textarea
                        id={id}
                        aria-label={`Măsura ${index + 1}`}
                        data-testid="risk-factor-measure-description"
                        rows={1}
                        maxLength={2000}
                        disabled={busy}
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
                      className="justify-self-end"
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              data-testid="risk-factor-measure-add"
              disabled={busy || measures.fields.length >= 30}
              onClick={() => measures.append({ kind: 'technical', description: '' })}
            >
              <Plus aria-hidden="true" />
              Adaugă o măsură
            </Button>
          </fieldset>

          <fieldset className="grid gap-5 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-medium">Pentru planul de prevenire</legend>
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
                aria-describedby={describedBy(
                  'risk-factor-actions',
                  Boolean(errors.actions),
                  false
                )}
                {...form.register('actions')}
              />
              <Suggestions id="risk-factor-actions-suggestions" field="actions" query={actions} />
            </Field>
            <Field
              id="risk-factor-deadline"
              label="Termen"
              mark="optional"
              error={errors.deadline}
              hint="Cerut când factorul are măsuri: „Permanent”, „Trimestrial”."
            >
              <Input
                id="risk-factor-deadline"
                data-testid="risk-factor-deadline"
                list="risk-factor-deadline-suggestions"
                autoComplete="off"
                disabled={busy}
                aria-invalid={Boolean(errors.deadline)}
                aria-describedby={describedBy('risk-factor-deadline', Boolean(errors.deadline))}
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
              mark="optional"
              error={errors.responsiblePerson}
              hint="Cerută când factorul are măsuri."
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
                  Boolean(errors.responsiblePerson)
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
                  false
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
