import { zodResolver } from '@hookform/resolvers/zod';
import { equipmentAllocations } from '@ssm-usor/contracts';
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
  getListEquipmentQueryKey,
  getListEquipmentSuggestionsQueryKey,
  getListJobPositionsQueryKey,
  type ListEquipmentSuggestionsField,
  useCreateEquipmentEntry,
  useListEquipmentSuggestions,
  useUpdateEquipmentEntry,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { Field } from '../components/form-field';
import { Notice } from '../components/notice';
import {
  allocationHints,
  allocationLabels,
  emptyEquipmentForm,
  type EquipmentEntry,
  equipmentFormSchema,
  type EquipmentFormValues,
  toEquipmentForm,
  toEquipmentRequest,
} from './equipment-schema';

// `null` is closed, 'new' adds an entry, and an entry edits it.
export type EquipmentEditing = EquipmentEntry | 'new' | null;

export function EquipmentEntryDialog({
  clientId,
  jobPositionId,
  editing,
  onClose,
}: {
  clientId: string;
  jobPositionId: string;
  editing: EquipmentEditing;
  onClose: () => void;
}) {
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      {editing && (
        <EquipmentEntryForm
          key={editing === 'new' ? 'new' : editing.id}
          clientId={clientId}
          jobPositionId={jobPositionId}
          entry={editing === 'new' ? null : editing}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

// What the organization typed before on any client, so a provider types an item once.
function Suggestions({
  id,
  field,
  query,
}: {
  id: string;
  field: ListEquipmentSuggestionsField;
  query: string;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const params = { field, query: query.trim() };
  const suggestions = useListEquipmentSuggestions(params, {
    request: apiRequest,
    query: { queryKey: getListEquipmentSuggestionsQueryKey(params), staleTime: 30_000 },
  });
  return (
    <datalist id={id}>
      {suggestions.data?.items.map((value) => (
        <option key={value} value={value} />
      ))}
    </datalist>
  );
}

function EquipmentEntryForm({
  clientId,
  jobPositionId,
  entry,
  onClose,
}: {
  clientId: string;
  jobPositionId: string;
  entry: EquipmentEntry | null;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const create = useCreateEquipmentEntry({ request: apiRequest });
  const update = useUpdateEquipmentEntry({ request: apiRequest });
  const form = useForm<EquipmentFormValues>({
    resolver: zodResolver(equipmentFormSchema),
    defaultValues: entry ? toEquipmentForm(entry) : emptyEquipmentForm,
  });
  const { errors } = form.formState;
  const busy = create.isPending || update.isPending;
  const allocation = useWatch({ control: form.control, name: 'allocation' });
  const risk = useWatch({ control: form.control, name: 'risk' });
  const item = useWatch({ control: form.control, name: 'item' });
  const consumable = allocation === 'consumable';

  const onSubmit = form.handleSubmit(async (values) => {
    const data = toEquipmentRequest(values);
    try {
      if (entry) {
        await update.mutateAsync({ clientId, jobPositionId, entryId: entry.id, data });
      } else {
        await create.mutateAsync({ clientId, jobPositionId, data });
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getListEquipmentQueryKey(clientId, jobPositionId),
        }),
        // The first entry decides the position; the list shows the count.
        queryClient.invalidateQueries({ queryKey: getListJobPositionsQueryKey(clientId) }),
      ]);
      toast.success(entry ? 'Articolul a fost salvat.' : 'Articolul a fost adăugat.');
      onClose();
    } catch (cause) {
      form.setError('root.server', {
        message:
          cause instanceof ApiHttpError && cause.status === 404
            ? 'Postul sau articolul nu mai există la acest client.'
            : cause instanceof ApiHttpError && cause.status === 409
              ? 'Clientul este arhivat; echipamentul lui nu se mai schimbă.'
              : cause instanceof ApiHttpError && cause.status === 401
                ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
                : 'Nu am putut salva articolul. Verifică conexiunea și încearcă din nou.',
      });
    }
  });

  return (
    <DialogContent data-testid="equipment-dialog" className="sm:max-w-2xl">
      <form onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>
            {entry ? 'Modifică articolul' : 'Adaugă un articol de echipament'}
          </DialogTitle>
          <DialogDescription>
            Ce primește oricine ocupă postul, împotriva cărui risc, și cum se acordă. Lista internă
            de dotare se generează din aceste articole.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-5 grid gap-5">
          <Field
            id="equipment-risk"
            label="Riscul"
            mark="required"
            error={errors.risk}
            hint="Împotriva a ce protejează, cu partea corpului: „Înțepături, tăieturi (mâini)”."
          >
            <Input
              id="equipment-risk"
              data-testid="equipment-risk"
              list="equipment-risk-suggestions"
              autoComplete="off"
              disabled={busy}
              aria-invalid={Boolean(errors.risk)}
              aria-describedby={errors.risk ? 'equipment-risk-error' : 'equipment-risk-hint'}
              {...form.register('risk')}
            />
            <Suggestions id="equipment-risk-suggestions" field="risk" query={risk} />
          </Field>
          <Field
            id="equipment-item"
            label="Articolul"
            mark="required"
            error={errors.item}
            hint="Sortimentul, cu clasa lui dacă are: „Bocanci S3”, „Mănuși de protecție mecanică”."
          >
            <Input
              id="equipment-item"
              data-testid="equipment-item"
              list="equipment-item-suggestions"
              autoComplete="off"
              disabled={busy}
              aria-invalid={Boolean(errors.item)}
              aria-describedby={errors.item ? 'equipment-item-error' : 'equipment-item-hint'}
              {...form.register('item')}
            />
            <Suggestions id="equipment-item-suggestions" field="item" query={item} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field
              id="equipment-allocation"
              label="Mod de acordare"
              mark="required"
              hint={allocationHints[allocation]}
            >
              <NativeSelect
                id="equipment-allocation"
                data-testid="equipment-allocation"
                disabled={busy}
                aria-describedby="equipment-allocation-hint"
                className="w-full"
                {...form.register('allocation')}
              >
                {equipmentAllocations.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {allocationLabels[value]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field
              id="equipment-quantity"
              label="Cantitate"
              mark="required"
              error={errors.quantity}
              hint="Bucăți sau perechi acordate deodată."
            >
              <Input
                id="equipment-quantity"
                data-testid="equipment-quantity"
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                disabled={busy}
                aria-invalid={Boolean(errors.quantity)}
                aria-describedby={
                  errors.quantity ? 'equipment-quantity-error' : 'equipment-quantity-hint'
                }
                {...form.register('quantity')}
              />
            </Field>
            <Field
              id="equipment-duration"
              label="Durata de folosire"
              mark={consumable ? undefined : 'required'}
              error={errors.durationMonths}
              hint={consumable ? 'Un consumabil nu are durată.' : 'În luni, până la înlocuire.'}
            >
              <Input
                id="equipment-duration"
                data-testid="equipment-duration"
                type="number"
                inputMode="numeric"
                min={1}
                max={120}
                placeholder={consumable ? '—' : '12'}
                disabled={busy || consumable}
                aria-invalid={Boolean(errors.durationMonths)}
                aria-describedby={
                  errors.durationMonths ? 'equipment-duration-error' : 'equipment-duration-hint'
                }
                {...form.register('durationMonths')}
              />
            </Field>
          </div>
        </div>
        {errors.root?.server && (
          <Notice variant="destructive" data-testid="equipment-error" className="mt-4">
            {errors.root.server.message}
          </Notice>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="equipment-save" disabled={busy}>
            {busy ? 'Se salvează…' : entry ? 'Salvează' : 'Adaugă'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
