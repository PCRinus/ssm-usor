import { zodResolver } from '@hookform/resolvers/zod';
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
import { useRouteContext } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';

import {
  getListFireMaintenanceItemsQueryKey,
  getListWorkplacesQueryKey,
  useCreateFireMaintenanceItem,
  useUpdateFireMaintenanceItem,
} from '@/api/generated/api';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { useRevealErrors } from '@/components/use-reveal-errors';
import type { Workplace } from '@/features/clients/workplace-schema';
import { useSavedToast } from '@/features/missing-data/saved-toast';

import {
  type FireMaintenanceItem,
  maintenanceItemFormSchema,
  type MaintenanceItemFormValues,
  newMaintenanceItemForm,
  toMaintenanceItemForm,
  toMaintenanceItemRequest,
} from './fire-means-schema';
import { saveFailure } from './save-failure';

// `null` is closed; otherwise the workplace whose card asked, and the row to edit or null.
export type MaintenanceItemEditing = {
  workplaceId: string;
  item: FireMaintenanceItem | null;
} | null;

export function MaintenanceItemDialog({
  clientId,
  workplaces,
  editing,
  onClose,
}: {
  clientId: string;
  workplaces: readonly Workplace[];
  editing: MaintenanceItemEditing;
  onClose: () => void;
}) {
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      {editing && (
        <MaintenanceItemForm
          key={editing.item?.id ?? `new-${editing.workplaceId}`}
          clientId={clientId}
          workplaces={workplaces}
          workplaceId={editing.workplaceId}
          item={editing.item}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function MaintenanceItemForm({
  clientId,
  workplaces,
  workplaceId,
  item,
  onClose,
}: {
  clientId: string;
  workplaces: readonly Workplace[];
  workplaceId: string;
  item: FireMaintenanceItem | null;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const savedToast = useSavedToast();
  const create = useCreateFireMaintenanceItem({ request: apiRequest });
  const update = useUpdateFireMaintenanceItem({ request: apiRequest });
  const form = useForm<MaintenanceItemFormValues>({
    resolver: zodResolver(maintenanceItemFormSchema),
    defaultValues: item ? toMaintenanceItemForm(item) : newMaintenanceItemForm(workplaceId),
  });
  const formRef = useRevealErrors(form);
  const { errors } = form.formState;
  const busy = create.isPending || update.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    const data = toMaintenanceItemRequest(values);
    try {
      if (item) {
        await update.mutateAsync({ clientId, itemId: item.id, data });
      } else {
        await create.mutateAsync({ clientId, data });
      }
      await queryClient.invalidateQueries({
        queryKey: getListFireMaintenanceItemsQueryKey(clientId),
      });
      savedToast(item ? 'Verificarea a fost salvată.' : 'Verificarea a fost adăugată.');
      onClose();
    } catch (cause) {
      const failure = saveFailure(cause, 'verificarea');
      if (failure.field === 'workplaceId') {
        await queryClient.invalidateQueries({ queryKey: getListWorkplacesQueryKey(clientId) });
      }
      form.setError(failure.field ?? 'root.server', { message: failure.message });
    }
  });

  const text = (
    name: 'subject' | 'intervalLabel' | 'checkedBy',
    id: string,
    label: string,
    placeholder: string,
    wide: boolean
  ) => (
    <Field
      id={id}
      label={label}
      mark="required"
      error={errors[name]}
      className={wide ? 'sm:col-span-2' : undefined}
    >
      <Input
        id={id}
        data-testid={id}
        autoComplete="off"
        placeholder={placeholder}
        disabled={busy}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${id}-error` : undefined}
        {...form.register(name)}
      />
    </Field>
  );

  return (
    <DialogContent data-testid="fire-maintenance-dialog" className="sm:max-w-2xl">
      <form ref={formRef} onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>
            {item ? 'Modifică verificarea' : 'Adaugă o verificare periodică'}
          </DialogTitle>
          <DialogDescription>
            Ce nu reiese din stingătoare și instalații, de exemplu verificarea anuală a instalației
            de gaze sau a coșului de fum. Apare în graficele de întreținere și verificare.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-5 grid gap-5 sm:grid-cols-2">
          {workplaces.length > 1 && (
            <Field
              id="fire-maintenance-workplace"
              label="Loc de muncă"
              mark="required"
              error={errors.workplaceId}
              className="sm:col-span-2"
            >
              <NativeSelect
                id="fire-maintenance-workplace"
                data-testid="fire-maintenance-workplace"
                disabled={busy}
                aria-invalid={Boolean(errors.workplaceId)}
                aria-describedby={
                  errors.workplaceId ? 'fire-maintenance-workplace-error' : undefined
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
          {text(
            'subject',
            'fire-maintenance-subject',
            'Ce se verifică',
            'de exemplu, coșul de fum al centralei termice',
            true
          )}
          {text(
            'intervalLabel',
            'fire-maintenance-interval',
            'Periodicitatea',
            'de exemplu, anual sau la 6 luni',
            false
          )}
          {text(
            'checkedBy',
            'fire-maintenance-checked-by',
            'Cine efectuează',
            'de exemplu, o firmă autorizată',
            false
          )}
        </DialogBody>
        {errors.root?.server && (
          <Notice variant="destructive" data-testid="fire-maintenance-error" className="mt-4">
            {errors.root.server.message}
          </Notice>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="fire-maintenance-save" disabled={busy}>
            {busy ? 'Se salvează…' : item ? 'Salvează' : 'Adaugă'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
