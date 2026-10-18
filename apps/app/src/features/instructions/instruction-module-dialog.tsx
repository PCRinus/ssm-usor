import { zodResolver } from '@hookform/resolvers/zod';
import {
  type InstructionDomain,
  instructionDomains,
  instructionModuleGroups,
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
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useForm, useWatch } from 'react-hook-form';

import {
  type ApiErrorResponse,
  useCreateInstructionModule,
  useUpdateInstructionModule,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { useRevealErrors } from '@/components/use-reveal-errors';

import {
  domainHints,
  domainLabels,
  groupHint,
  groupLabels,
  type InstructionModule,
  invalidateLibrary,
  moduleFormSchema,
  type ModuleFormValues,
  positionCountLabel,
} from './instruction-schema';

// `null` is closed, 'new' starts a module from the skeleton, and a module renames it.
export type ModuleEditing = InstructionModule | 'new' | null;

export function InstructionModuleDialog({
  editing,
  defaultDomain,
  onClose,
  onSaved,
}: {
  editing: ModuleEditing;
  defaultDomain: InstructionDomain;
  onClose: () => void;
  /** The module as saved, for a caller that goes on to open it. */
  onSaved?: (module: InstructionModule) => void;
}) {
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      {editing && (
        <ModuleForm
          key={editing === 'new' ? 'new' : editing.id}
          module={editing === 'new' ? null : editing}
          defaultDomain={defaultDomain}
          onSaved={onSaved}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function ModuleForm({
  module,
  defaultDomain,
  onSaved,
  onClose,
}: {
  module: InstructionModule | null;
  defaultDomain: InstructionDomain;
  onSaved?: (module: InstructionModule) => void;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const create = useCreateInstructionModule({ request: apiRequest });
  const update = useUpdateInstructionModule({ request: apiRequest });
  const form = useForm<ModuleFormValues>({
    resolver: zodResolver(moduleFormSchema),
    defaultValues: module
      ? { title: module.title, group: module.group, domain: module.domain }
      : { title: '', group: 'work_activity', domain: defaultDomain },
  });
  const formRef = useRevealErrors(form);
  const { errors } = form.formState;
  const busy = create.isPending || update.isPending;
  const group = useWatch({ control: form.control, name: 'group' });
  const domain = useWatch({ control: form.control, name: 'domain' });
  // The API refuses moving a module a current position applies (409); the field says so first.
  const domainLocked = module !== null && module.appliedCount > 0;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = module
        ? await update.mutateAsync({
            moduleId: module.id,
            data: {
              title: values.title,
              group: values.group,
              ...(values.domain === module.domain ? {} : { domain: values.domain }),
            },
          })
        : await create.mutateAsync({ data: values });
      await invalidateLibrary(queryClient);
      toast.success(module ? 'Instrucțiunea a fost salvată.' : 'Instrucțiunea a fost creată.');
      onSaved?.(saved.module);
      onClose();
    } catch (cause) {
      const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
      if (body?.reason === 'instruction_module_title_taken') {
        form.setError('title', {
          message:
            'Biblioteca are deja o instrucțiune cu acest titlu. Deosebește-le prin nume: „Scări metalice – șantier”.',
        });
        return;
      }
      if (body?.reason === 'instruction_module_domain_applied') {
        form.setError('domain', {
          message:
            'Un post de lucru aplică instrucțiunea ca parte a deciziei lui pentru acest domeniu. Scoate-o de la posturile care o aplică, apoi mut-o în celălalt domeniu.',
        });
        return;
      }
      form.setError('root.server', {
        message:
          cause instanceof ApiHttpError && cause.status === 404
            ? 'Instrucțiunea nu mai există în bibliotecă.'
            : cause instanceof ApiHttpError && cause.status === 401
              ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
              : 'Nu am putut salva instrucțiunea. Verifică conexiunea și încearcă din nou.',
      });
    }
  });

  return (
    <DialogContent data-testid="instruction-module-dialog" className="sm:max-w-lg">
      <form ref={formRef} onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>{module ? 'Modifică instrucțiunea' : 'Scrie o instrucțiune'}</DialogTitle>
          <DialogDescription>
            {module
              ? 'Titlul, categoria și domeniul apar în bibliotecă și în documentele care o anexează; textul se modifică din editor.'
              : 'Instrucțiunea pornește de la un schelet cu capitolele cerute de Inspecția Muncii și se scrie în editor.'}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-5 grid gap-5">
          <Field id="instruction-module-title" label="Titlu" mark="required" error={errors.title}>
            <Input
              id="instruction-module-title"
              data-testid="instruction-module-title"
              autoComplete="off"
              placeholder="Scări metalice, Activități de birou, Aparat de sudură…"
              disabled={busy}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'instruction-module-title-error' : undefined}
              {...form.register('title')}
            />
          </Field>
          <Field
            id="instruction-module-group"
            label="Categoria instrucțiunii"
            mark="required"
            hint={groupHint(group)}
          >
            <NativeSelect
              id="instruction-module-group"
              data-testid="instruction-module-group"
              disabled={busy}
              aria-describedby="instruction-module-group-hint"
              {...form.register('group')}
            >
              {instructionModuleGroups.map((group) => (
                <NativeSelectOption key={group} value={group}>
                  {groupLabels[group]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field
            id="instruction-module-domain"
            label="Domeniu"
            mark="required"
            error={errors.domain}
            hint={
              domainLocked
                ? `Aplicată la ${positionCountLabel(module.appliedCount).toLowerCase()} ca instrucțiune ${domainLabels[module.domain]}; se mută în celălalt domeniu după ce o scoți de acolo.`
                : domainHints[domain]
            }
          >
            {domainLocked ? (
              <Input
                id="instruction-module-domain"
                data-testid="instruction-module-domain"
                readOnly
                value={domainLabels[module.domain]}
                aria-describedby="instruction-module-domain-hint"
              />
            ) : (
              <NativeSelect
                id="instruction-module-domain"
                data-testid="instruction-module-domain"
                disabled={busy}
                aria-invalid={Boolean(errors.domain)}
                aria-describedby={
                  errors.domain
                    ? 'instruction-module-domain-error'
                    : 'instruction-module-domain-hint'
                }
                {...form.register('domain')}
              >
                {instructionDomains.map((each) => (
                  <NativeSelectOption key={each} value={each}>
                    {domainLabels[each]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </Field>
          {errors.root?.server && (
            <Notice variant="destructive" data-testid="instruction-module-error">
              {errors.root.server.message}
            </Notice>
          )}
        </div>
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="instruction-module-submit" disabled={busy}>
            {busy ? 'Se salvează…' : module ? 'Salvează' : 'Creează și deschide'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
