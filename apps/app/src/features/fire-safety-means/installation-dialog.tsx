import { zodResolver } from '@hookform/resolvers/zod';
import { fireInstallationKindLabels, fireInstallationKinds } from '@ssm-usor/contracts';
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
import { Controller, useForm, useWatch } from 'react-hook-form';

import {
  getListFireInstallationsQueryKey,
  getListWorkplacesQueryKey,
  useCreateFireInstallation,
  useUpdateFireInstallation,
} from '@/api/generated/api';
import { DatePicker } from '@/components/date-picker';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { useRevealErrors } from '@/components/use-reveal-errors';
import type { Workplace } from '@/features/clients/workplace-schema';
import { useSavedToast } from '@/features/missing-data/saved-toast';

import {
  type FireInstallation,
  installationFormSchema,
  type InstallationFormValues,
  newInstallationForm,
  toInstallationForm,
  toInstallationRequest,
} from './fire-means-schema';
import { saveFailure } from './save-failure';

// `null` is closed; otherwise the workplace whose card asked, and the installation to edit or
// null.
export type InstallationEditing = {
  workplaceId: string;
  installation: FireInstallation | null;
} | null;

export function InstallationDialog({
  clientId,
  workplaces,
  editing,
  onClose,
}: {
  clientId: string;
  workplaces: readonly Workplace[];
  editing: InstallationEditing;
  onClose: () => void;
}) {
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      {editing && (
        <InstallationForm
          key={editing.installation?.id ?? `new-${editing.workplaceId}`}
          clientId={clientId}
          workplaces={workplaces}
          workplaceId={editing.workplaceId}
          installation={editing.installation}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function InstallationForm({
  clientId,
  workplaces,
  workplaceId,
  installation,
  onClose,
}: {
  clientId: string;
  workplaces: readonly Workplace[];
  workplaceId: string;
  installation: FireInstallation | null;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const savedToast = useSavedToast();
  const create = useCreateFireInstallation({ request: apiRequest });
  const update = useUpdateFireInstallation({ request: apiRequest });
  const form = useForm<InstallationFormValues>({
    resolver: zodResolver(installationFormSchema),
    defaultValues: installation
      ? toInstallationForm(installation)
      : newInstallationForm(workplaceId),
  });
  const formRef = useRevealErrors(form);
  const { errors } = form.formState;
  const busy = create.isPending || update.isPending;
  const kind = useWatch({ control: form.control, name: 'kind' });

  const onSubmit = form.handleSubmit(async (values) => {
    const data = toInstallationRequest(values);
    try {
      if (installation) {
        await update.mutateAsync({ clientId, installationId: installation.id, data });
      } else {
        await create.mutateAsync({ clientId, data });
      }
      await queryClient.invalidateQueries({
        queryKey: getListFireInstallationsQueryKey(clientId),
      });
      savedToast(installation ? 'Instalația a fost salvată.' : 'Instalația a fost adăugată.');
      onClose();
    } catch (cause) {
      const failure = saveFailure(cause, 'instalația');
      if (failure.field === 'workplaceId') {
        await queryClient.invalidateQueries({ queryKey: getListWorkplacesQueryKey(clientId) });
      }
      form.setError(failure.field ?? 'root.server', { message: failure.message });
    }
  });

  const date = (name: 'lastCheckOn' | 'nextCheckOn', id: string, label: string) => (
    <Field id={id} label={label} mark="optional" error={errors[name]}>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <DatePicker
            id={id}
            testId={id}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            disabled={busy}
            invalid={Boolean(errors[name])}
            describedBy={errors[name] ? `${id}-error` : undefined}
          />
        )}
      />
    </Field>
  );

  return (
    <DialogContent data-testid="fire-installation-dialog" className="sm:max-w-2xl">
      <form ref={formRef} onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>{installation ? 'Modifică instalația' : 'Adaugă o instalație'}</DialogTitle>
          <DialogDescription>
            Instalațiile de semnalizare, limitare și stingere a incendiilor de la acest loc de
            muncă.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-5 grid gap-5 sm:grid-cols-2">
          {workplaces.length > 1 && (
            <Field
              id="fire-installation-workplace"
              label="Loc de muncă"
              mark="required"
              error={errors.workplaceId}
              className="sm:col-span-2"
            >
              <NativeSelect
                id="fire-installation-workplace"
                data-testid="fire-installation-workplace"
                disabled={busy}
                aria-invalid={Boolean(errors.workplaceId)}
                aria-describedby={
                  errors.workplaceId ? 'fire-installation-workplace-error' : undefined
                }
                {...form.register('workplaceId')}
              >
                {workplaces.map((workplace) => (
                  <NativeSelectOption key={workplace.id} value={workplace.id}>
                    {workplace.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}
          {workplaces.length <= 1 && errors.workplaceId && (
            <Notice variant="destructive" className="sm:col-span-2">
              {errors.workplaceId.message}
            </Notice>
          )}
          <Field
            id="fire-installation-kind"
            label="Tipul"
            mark="required"
            error={errors.kind}
            className="sm:col-span-2"
          >
            <NativeSelect
              id="fire-installation-kind"
              data-testid="fire-installation-kind"
              disabled={busy}
              aria-invalid={Boolean(errors.kind)}
              aria-describedby={errors.kind ? 'fire-installation-kind-error' : undefined}
              {...form.register('kind')}
            >
              <NativeSelectOption value="">Alege tipul</NativeSelectOption>
              {fireInstallationKinds.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {fireInstallationKindLabels[value]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field
            id="fire-installation-description"
            label="Descrierea"
            mark={kind === 'other' ? 'required' : 'optional'}
            error={errors.description}
            className="sm:col-span-2"
          >
            <Textarea
              id="fire-installation-description"
              data-testid="fire-installation-description"
              rows={2}
              placeholder="de exemplu, 4 hidranți interiori, la parter și la etaj"
              disabled={busy}
              aria-invalid={Boolean(errors.description)}
              aria-describedby={
                errors.description ? 'fire-installation-description-error' : undefined
              }
              {...form.register('description')}
            />
          </Field>
          {date('lastCheckOn', 'fire-installation-last-check', 'Ultima verificare')}
          {date('nextCheckOn', 'fire-installation-next-check', 'Următoarea verificare')}
          <Field
            id="fire-installation-maintainer"
            label="Firma de service"
            mark="optional"
            error={errors.maintainer}
            className="sm:col-span-2"
          >
            <Input
              id="fire-installation-maintainer"
              data-testid="fire-installation-maintainer"
              autoComplete="off"
              disabled={busy}
              aria-invalid={Boolean(errors.maintainer)}
              aria-describedby={
                errors.maintainer ? 'fire-installation-maintainer-error' : undefined
              }
              {...form.register('maintainer')}
            />
          </Field>
        </DialogBody>
        {errors.root?.server && (
          <Notice variant="destructive" data-testid="fire-installation-error" className="mt-4">
            {errors.root.server.message}
          </Notice>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="fire-installation-save" disabled={busy}>
            {busy ? 'Se salvează…' : installation ? 'Salvează' : 'Adaugă'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
