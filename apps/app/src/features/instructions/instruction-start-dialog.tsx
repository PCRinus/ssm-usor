import { zodResolver } from '@hookform/resolvers/zod';
import {
  categoryFitsDomain,
  instructionCategoriesByDomain,
  type InstructionDomain,
  instructionDomains,
  type InstructionModuleGroup,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { useRouteContext } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import {
  getListInstructionModuleChoicesQueryKey,
  useListInstructionModuleChoices,
} from '@/api/generated/api';
import { replayShow } from '@/app/observability/replay-masking';
import { Field } from '@/components/form-field';
import { useRevealErrors } from '@/components/use-reveal-errors';

import {
  domainHints,
  domainLabels,
  groupHint,
  groupLabels,
  moduleFormSchema,
} from './instruction-schema';

export type StartValues = {
  title: string;
  domain: InstructionDomain;
  group: InstructionModuleGroup;
  // A library module whose body the new one starts as a copy of.
  from?: string;
};

const startSchema = moduleFormSchema.extend({ from: z.string() });

type StartForm = z.infer<typeof startSchema>;

const guided = '';

export function InstructionStartDialog({
  open,
  initial,
  editing = false,
  userId,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial: Partial<StartValues> & { domain: InstructionDomain };
  // The new module's form changes its title, domain and category; its text is already there.
  editing?: boolean;
  userId: string;
  onClose: () => void;
  onSubmit: (values: StartValues) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      {open && (
        <StartContent
          initial={initial}
          editing={editing}
          userId={userId}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      )}
    </Dialog>
  );
}

function StartContent({
  initial,
  editing,
  userId,
  onClose,
  onSubmit,
}: {
  initial: Partial<StartValues> & { domain: InstructionDomain };
  editing: boolean;
  userId: string;
  onClose: () => void;
  onSubmit: (values: StartValues) => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const library = useListInstructionModuleChoices(undefined, {
    request: apiRequest,
    query: { queryKey: [...getListInstructionModuleChoicesQueryKey(), userId] },
  });
  const form = useForm<StartForm>({
    resolver: zodResolver(startSchema),
    defaultValues: {
      title: initial.title ?? '',
      domain: initial.domain,
      group: initial.group ?? instructionCategoriesByDomain[initial.domain][0],
      from: guided,
    },
  });
  const formRef = useRevealErrors(form);
  const { errors } = form.formState;
  const group = useWatch({ control: form.control, name: 'group' });
  const domain = useWatch({ control: form.control, name: 'domain' });
  const from = useWatch({ control: form.control, name: 'from' });
  const modules = useMemo(() => library.data?.items ?? [], [library.data]);
  const sources = modules.filter((module) => module.domain === domain);

  useEffect(() => {
    if (!categoryFitsDomain(group, domain)) {
      form.setValue('group', instructionCategoriesByDomain[domain][0]);
    }
  }, [form, group, domain]);

  useEffect(() => {
    const source = modules.find((module) => module.id === from);
    if (source && source.domain !== domain) form.setValue('from', guided);
    else if (source) form.setValue('group', source.group);
  }, [form, modules, from, domain]);

  const submit = form.handleSubmit((values) => {
    const taken = modules.find(
      (module) =>
        module.title.toLocaleLowerCase('ro') === values.title.toLocaleLowerCase('ro') &&
        module.title !== initial.title
    );
    if (taken) {
      form.setError('title', {
        message:
          'Biblioteca are deja o instrucțiune cu acest titlu. Deosebește-le prin nume: „Scări metalice – șantier”.',
      });
      return;
    }
    onSubmit({
      title: values.title,
      domain: values.domain,
      group: values.group,
      ...(values.from ? { from: values.from } : {}),
    });
  });

  return (
    <DialogContent data-testid="instruction-start-dialog" className="sm:max-w-lg">
      <form {...replayShow} ref={formRef} onSubmit={(event) => void submit(event)} noValidate>
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Titlu, categorie și domeniu' : 'Scrie o instrucțiune'}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? 'Textul scris rămâne cum este. Instrucțiunea se adaugă în bibliotecă la prima salvare.'
              : 'Instrucțiunea pornește de la secțiunile propuse pentru categoria ei, fiecare cu un îndemn și un exemplu. Se adaugă în bibliotecă la prima salvare.'}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-5 grid gap-5">
          <Field id="instruction-start-title" label="Titlu" mark="required" error={errors.title}>
            <Input
              id="instruction-start-title"
              data-testid="instruction-start-title"
              autoComplete="off"
              placeholder="Scări metalice, Activități de birou, Aparat de sudură…"
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'instruction-start-title-error' : undefined}
              {...form.register('title')}
            />
          </Field>
          <Field
            id="instruction-start-domain"
            label="Domeniu"
            mark="required"
            hint={domainHints[domain]}
          >
            <NativeSelect
              id="instruction-start-domain"
              data-testid="instruction-start-domain"
              aria-describedby="instruction-start-domain-hint"
              {...form.register('domain')}
            >
              {instructionDomains.map((each) => (
                <NativeSelectOption key={each} value={each}>
                  {domainLabels[each]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field
            id="instruction-start-group"
            label="Categoria instrucțiunii"
            mark="required"
            hint={groupHint(group)}
          >
            <NativeSelect
              id="instruction-start-group"
              data-testid="instruction-start-group"
              aria-describedby="instruction-start-group-hint"
              {...form.register('group')}
            >
              {instructionCategoriesByDomain[domain].map((each) => (
                <NativeSelectOption key={each} value={each}>
                  {groupLabels[each]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {!editing && (
            <Field
              id="instruction-start-from"
              label="Pornește de la"
              hint={
                from
                  ? 'Textul ei se copiază în instrucțiunea nouă, ca să-l adaptezi. Instrucțiunea din bibliotecă rămâne cum este.'
                  : 'Secțiunile propuse pentru categorie, cu un îndemn la fiecare.'
              }
            >
              <NativeSelect
                id="instruction-start-from"
                data-testid="instruction-start-from"
                aria-describedby="instruction-start-from-hint"
                {...form.register('from')}
              >
                <NativeSelectOption value={guided}>Structura propusă</NativeSelectOption>
                {sources.length > 0 && (
                  <optgroup label="O instrucțiune existentă">
                    {sources.map((module) => (
                      <NativeSelectOption key={module.id} value={module.id}>
                        {module.title}
                      </NativeSelectOption>
                    ))}
                  </optgroup>
                )}
              </NativeSelect>
            </Field>
          )}
        </div>
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="instruction-start-submit">
            {editing ? 'Aplică' : 'Începe să scrii'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
