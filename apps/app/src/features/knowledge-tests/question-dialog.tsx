import { zodResolver } from '@hookform/resolvers/zod';
import {
  type KnowledgeTest,
  knowledgeTestCodeOf,
  knowledgeTestLabels,
  knowledgeTestsByDomain,
  type TrainingDomain,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
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
import { Label } from '@ssm-usor/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { Plus, X } from 'lucide-react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';

import { useCreateTestQuestion, useUpdateTestQuestion } from '@/api/generated/api';
import { Field, FieldMessage } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { useRevealErrors } from '@/components/use-reveal-errors';

import {
  maximumOptions,
  minimumOptions,
  newOption,
  questionFormSchema,
  type QuestionFormValues,
  questionFormValues,
  toNewQuestionRequest,
  toQuestionRequest,
} from './question-schema';
import { type BankQuestion, invalidateTestBank, optionLetter, testFailure } from './test-format';

export type QuestionEditing =
  | { kind: 'new'; domain: TrainingDomain; test: KnowledgeTest }
  | { kind: 'edit'; question: BankQuestion }
  | null;

export function QuestionDialog({
  editing,
  onClose,
}: {
  editing: QuestionEditing;
  onClose: () => void;
}) {
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      {editing && (
        <QuestionForm
          key={editing.kind === 'edit' ? editing.question.id : `new-${editing.test}`}
          editing={editing}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function QuestionForm({
  editing,
  onClose,
}: {
  editing: NonNullable<QuestionEditing>;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const create = useCreateTestQuestion({ request: apiRequest });
  const update = useUpdateTestQuestion({ request: apiRequest });
  const question = editing.kind === 'edit' ? editing.question : null;
  const domain = editing.kind === 'edit' ? editing.question.domain : editing.domain;
  const form = useForm<QuestionFormValues>({
    resolver: zodResolver(questionFormSchema),
    defaultValues: questionFormValues(
      question,
      editing.kind === 'new' ? editing.test : editing.question.test
    ),
  });
  const formRef = useRevealErrors(form);
  const { errors } = form.formState;
  const options = useFieldArray({ control: form.control, name: 'options' });
  const busy = create.isPending || update.isPending;
  const tests = knowledgeTestsByDomain[domain];

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (question) {
        await update.mutateAsync({
          questionId: question.id,
          data: { ...toQuestionRequest(values), replacesQuestionId: question.replacesQuestionId },
        });
      } else {
        await create.mutateAsync({ data: toNewQuestionRequest(domain, values) });
      }
      await invalidateTestBank(queryClient);
      toast.success(question ? 'Întrebarea a fost salvată.' : 'Întrebarea a fost adăugată.');
      onClose();
    } catch (cause) {
      form.setError('root.server', {
        message: testFailure(
          cause,
          'Nu am putut salva întrebarea. Verifică conexiunea și încearcă din nou.'
        ),
      });
    }
  });

  return (
    <DialogContent data-testid="test-question-dialog" className="sm:max-w-2xl">
      <form ref={formRef} onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>{question ? 'Modifică întrebarea' : 'Adaugă o întrebare'}</DialogTitle>
          <DialogDescription>
            Angajatul o primește în portal, cu variantele amestecate, iar testul tipărit o cuprinde
            cu răspunsul corect. Conținutul este al tău: aplicația nu verifică dacă afirmațiile sunt
            corecte.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-5 grid gap-5">
          <Field id="test-question-test" label="Testul" mark="required">
            {question || tests.length === 1 ? (
              <Input
                id="test-question-test"
                data-testid="test-question-test"
                readOnly
                value={`${knowledgeTestLabels[form.getValues('test')]} (${knowledgeTestCodeOf(domain, form.getValues('test'))})`}
              />
            ) : (
              <NativeSelect
                id="test-question-test"
                data-testid="test-question-test"
                disabled={busy}
                {...form.register('test')}
              >
                {tests.map((test) => (
                  <NativeSelectOption key={test} value={test}>
                    {knowledgeTestLabels[test]} ({knowledgeTestCodeOf(domain, test)})
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field id="test-question-text" label="Întrebarea" mark="required" error={errors.text}>
            <Textarea
              id="test-question-text"
              data-testid="test-question-text"
              rows={3}
              disabled={busy}
              aria-invalid={Boolean(errors.text)}
              aria-describedby={errors.text ? 'test-question-text-error' : undefined}
              {...form.register('text')}
            />
          </Field>
          <fieldset className="grid gap-3" aria-describedby="test-question-options-hint">
            <legend className="mb-2 text-sm font-medium">
              Variantele de răspuns
              <span aria-hidden="true" className="text-destructive">
                {' '}
                *
              </span>
            </legend>
            <p id="test-question-options-hint" className="-mt-1 text-xs text-muted-foreground">
              Între două și patru variante. Bifează-le pe cele corecte: întrebarea e corectă doar
              când angajatul le alege exact pe ele.
            </p>
            <ol className="grid gap-2">
              {options.fields.map((option, index) => {
                const error = errors.options?.[index]?.text;
                const id = `test-question-option-${index}`;
                return (
                  <li key={option.id} data-testid="test-question-option" className="grid gap-1">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="w-5 shrink-0 text-sm font-medium text-muted-foreground"
                      >
                        {optionLetter(index)}.
                      </span>
                      <Input
                        id={id}
                        data-testid="test-question-option-text"
                        aria-label={`Varianta ${optionLetter(index)}`}
                        disabled={busy}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? `${id}-error` : undefined}
                        {...form.register(`options.${index}.text`)}
                      />
                      <Controller
                        control={form.control}
                        name={`options.${index}.correct`}
                        render={({ field }) => (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <Checkbox
                              id={`${id}-correct`}
                              data-testid="test-question-option-correct"
                              checked={field.value}
                              disabled={busy}
                              onCheckedChange={(checked) => field.onChange(checked === true)}
                              onBlur={field.onBlur}
                            />
                            <Label htmlFor={`${id}-correct`} className="text-sm font-normal">
                              corect
                            </Label>
                          </div>
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        data-testid="test-question-option-remove"
                        aria-label={`Scoate varianta ${optionLetter(index)}`}
                        disabled={busy || options.fields.length <= minimumOptions}
                        onClick={() => options.remove(index)}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </div>
                    <div className="pl-7">
                      <FieldMessage id={`${id}-error`} error={error} />
                    </div>
                  </li>
                );
              })}
            </ol>
            {options.fields.length < maximumOptions && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit"
                data-testid="test-question-option-add"
                disabled={busy}
                onClick={() => options.append(newOption())}
              >
                <Plus aria-hidden="true" />
                Adaugă o variantă
              </Button>
            )}
            <FieldMessage id="test-question-options-error" error={errors.options?.root} />
          </fieldset>
          <Field
            id="test-question-explanation"
            label="Explicația"
            mark="optional"
            error={errors.explanation}
            hint="Două-trei propoziții pe înțelesul angajatului. O vede pe cardul de studiu dinaintea testului și după un răspuns greșit."
          >
            <Textarea
              id="test-question-explanation"
              data-testid="test-question-explanation"
              rows={3}
              disabled={busy}
              aria-invalid={Boolean(errors.explanation)}
              aria-describedby={
                errors.explanation
                  ? 'test-question-explanation-error'
                  : 'test-question-explanation-hint'
              }
              {...form.register('explanation')}
            />
          </Field>
          <Field
            id="test-question-citation"
            label="Temeiul"
            mark="optional"
            error={errors.citation}
            hint="Articolul pe care se sprijină întrebarea, de exemplu „HG 1425/2006, art. 89”."
          >
            <Input
              id="test-question-citation"
              data-testid="test-question-citation"
              autoComplete="off"
              disabled={busy}
              aria-invalid={Boolean(errors.citation)}
              aria-describedby={
                errors.citation ? 'test-question-citation-error' : 'test-question-citation-hint'
              }
              {...form.register('citation')}
            />
          </Field>
          {errors.root?.server && (
            <Notice variant="destructive" data-testid="test-question-error">
              {errors.root.server.message}
            </Notice>
          )}
        </DialogBody>
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="test-question-submit" disabled={busy}>
            {busy ? 'Se salvează…' : question ? 'Salvează' : 'Adaugă întrebarea'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
