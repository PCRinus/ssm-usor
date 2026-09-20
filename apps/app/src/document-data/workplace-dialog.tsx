import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { Controller, useForm, useWatch } from 'react-hook-form';

import {
  getListWorkplacesQueryKey,
  useCreateWorkplace,
  useUpdateWorkplace,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { CountyCombobox } from '../clients/county-combobox';
import { Field } from '../components/form-field';
import { Notice } from '../components/notice';
import { LocalityCombobox } from '../localities/locality-combobox';
import {
  emptyWorkplaceForm,
  toWorkplaceForm,
  toWorkplaceRequest,
  type Workplace,
  workplaceFormSchema,
  type WorkplaceFormValues,
} from './workplace-schema';

// `null` is closed, 'new' adds a workplace, and a workplace edits it.
export type WorkplaceEditing = Workplace | 'new' | null;

export function WorkplaceDialog({
  clientId,
  editing,
  onClose,
}: {
  clientId: string;
  editing: WorkplaceEditing;
  onClose: () => void;
}) {
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      {editing && (
        <WorkplaceForm
          key={editing === 'new' ? 'new' : editing.id}
          clientId={clientId}
          workplace={editing === 'new' ? null : editing}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function WorkplaceForm({
  clientId,
  workplace,
  onClose,
}: {
  clientId: string;
  workplace: Workplace | null;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const create = useCreateWorkplace({ request: apiRequest });
  const update = useUpdateWorkplace({ request: apiRequest });
  const form = useForm<WorkplaceFormValues>({
    resolver: zodResolver(workplaceFormSchema),
    defaultValues: workplace ? toWorkplaceForm(workplace) : emptyWorkplaceForm,
  });
  const { errors } = form.formState;
  const busy = create.isPending || update.isPending;
  const countyCode = useWatch({ control: form.control, name: 'countyCode' });

  const onSubmit = form.handleSubmit(async (values) => {
    const data = toWorkplaceRequest(values);
    try {
      if (workplace) await update.mutateAsync({ clientId, workplaceId: workplace.id, data });
      else await create.mutateAsync({ clientId, data });
      await queryClient.invalidateQueries({ queryKey: getListWorkplacesQueryKey(clientId) });
      toast.success(
        workplace ? 'Punctul de lucru a fost salvat.' : 'Punctul de lucru a fost adăugat.'
      );
      onClose();
    } catch (cause) {
      if (cause instanceof ApiHttpError && cause.status === 409) {
        // The API answers 409 for an archived client too, which this page shows read-only.
        form.setError('isRegisteredOffice', {
          message: 'Clientul are deja un sediu social. Modifică-l pe acela sau debifează opțiunea.',
        });
        return;
      }
      form.setError('root.server', {
        message:
          cause instanceof ApiHttpError && cause.status === 404
            ? 'Punctul de lucru nu mai există la acest client.'
            : cause instanceof ApiHttpError && cause.status === 401
              ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
              : 'Nu am putut salva punctul de lucru. Verifică conexiunea și încearcă din nou.',
      });
    }
  });

  return (
    <DialogContent data-testid="workplace-dialog" className="sm:max-w-2xl">
      <form onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>
            {workplace ? 'Modifică punctul de lucru' : 'Adaugă un punct de lucru'}
          </DialogTitle>
          <DialogDescription>
            Sediul social și punctele de lucru apar în prezentarea unității din documente.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field
            id="workplace-name"
            label="Denumire"
            mark="required"
            error={errors.name}
            className="sm:col-span-2"
          >
            <Input
              id="workplace-name"
              data-testid="workplace-name"
              autoComplete="off"
              placeholder="Sediu social, Magazin Timișoara…"
              disabled={busy}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'workplace-name-error' : undefined}
              {...form.register('name')}
            />
          </Field>
          <div className="grid gap-2 sm:col-span-2">
            <div className="flex items-center gap-2">
              <Controller
                control={form.control}
                name="isRegisteredOffice"
                render={({ field }) => (
                  <Checkbox
                    id="workplace-registered-office"
                    data-testid="workplace-registered-office"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    disabled={busy}
                    aria-describedby={
                      errors.isRegisteredOffice ? 'workplace-registered-office-error' : undefined
                    }
                  />
                )}
              />
              <Label htmlFor="workplace-registered-office">Este sediul social</Label>
            </div>
            {errors.isRegisteredOffice && (
              <p
                id="workplace-registered-office-error"
                data-testid="workplace-registered-office-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {errors.isRegisteredOffice.message}
              </p>
            )}
          </div>
          <Field
            id="workplace-county"
            label="Județ"
            mark="optional"
            error={errors.countyCode}
            className="sm:col-span-2"
          >
            <Controller
              control={form.control}
              name="countyCode"
              render={({ field }) => (
                <CountyCombobox
                  id="workplace-county"
                  testId="workplace-county"
                  value={field.value}
                  onChange={(code) => {
                    field.onChange(code);
                    form.setValue('locality', '', { shouldDirty: true });
                  }}
                  onBlur={field.onBlur}
                  disabled={busy}
                  invalid={Boolean(errors.countyCode)}
                  describedBy={errors.countyCode ? 'workplace-county-error' : undefined}
                />
              )}
            />
          </Field>
          <Field
            id="workplace-locality"
            label="Localitate"
            mark="optional"
            error={errors.locality}
            className="sm:col-span-2"
          >
            <Controller
              control={form.control}
              name="locality"
              render={({ field }) => (
                <LocalityCombobox
                  id="workplace-locality"
                  testId="workplace-locality"
                  countyCode={countyCode}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={busy}
                  invalid={Boolean(errors.locality)}
                  describedBy={errors.locality ? 'workplace-locality-error' : undefined}
                />
              )}
            />
          </Field>
          <Field
            id="workplace-address"
            label="Adresă"
            mark="optional"
            error={errors.addressLine}
            className="sm:col-span-2"
          >
            <Input
              id="workplace-address"
              data-testid="workplace-address"
              autoComplete="off"
              disabled={busy}
              aria-invalid={Boolean(errors.addressLine)}
              aria-describedby={errors.addressLine ? 'workplace-address-error' : undefined}
              {...form.register('addressLine')}
            />
          </Field>
        </div>
        {errors.root?.server && (
          <Notice variant="destructive" data-testid="workplace-error" className="mt-4">
            {errors.root.server.message}
          </Notice>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="workplace-save" disabled={busy}>
            {busy ? 'Se salvează…' : workplace ? 'Salvează' : 'Adaugă'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
