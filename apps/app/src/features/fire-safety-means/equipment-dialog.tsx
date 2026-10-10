import { zodResolver } from '@hookform/resolvers/zod';
import {
  extinguisherCode,
  fireEquipmentKindLabels,
  fireEquipmentKinds,
  type FireExtinguishingAgent,
  fireExtinguishingAgentLabels,
  fireExtinguishingAgents,
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
import { useRouteContext } from '@tanstack/react-router';
import { Controller, useForm, useWatch } from 'react-hook-form';

import {
  getListFireEquipmentQueryKey,
  getListWorkplacesQueryKey,
  useCreateFireEquipment,
  useUpdateFireEquipment,
} from '@/api/generated/api';
import { DatePicker } from '@/components/date-picker';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { useRevealErrors } from '@/components/use-reveal-errors';
import type { Workplace } from '@/features/clients/workplace-schema';
import { useSavedToast } from '@/features/missing-data/saved-toast';

import { ExtinguisherCode } from './extinguisher-code';
import {
  capacityUnits,
  equipmentFormSchema,
  type EquipmentFormValues,
  type FireEquipment,
  newEquipmentForm,
  toEquipmentForm,
  toEquipmentRequest,
} from './fire-means-schema';
import { saveFailure } from './save-failure';

// `null` is closed; otherwise the workplace whose card asked, and the unit to edit or null.
export type EquipmentEditing = { workplaceId: string; unit: FireEquipment | null } | null;

export function EquipmentDialog({
  clientId,
  workplaces,
  editing,
  onClose,
}: {
  clientId: string;
  workplaces: readonly Workplace[];
  editing: EquipmentEditing;
  onClose: () => void;
}) {
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      {editing && (
        <EquipmentForm
          key={editing.unit?.id ?? `new-${editing.workplaceId}`}
          clientId={clientId}
          workplaces={workplaces}
          workplaceId={editing.workplaceId}
          unit={editing.unit}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function EquipmentForm({
  clientId,
  workplaces,
  workplaceId,
  unit,
  onClose,
}: {
  clientId: string;
  workplaces: readonly Workplace[];
  workplaceId: string;
  unit: FireEquipment | null;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const savedToast = useSavedToast();
  const create = useCreateFireEquipment({ request: apiRequest });
  const update = useUpdateFireEquipment({ request: apiRequest });
  const form = useForm<EquipmentFormValues>({
    resolver: zodResolver(equipmentFormSchema),
    defaultValues: unit ? toEquipmentForm(unit) : newEquipmentForm(workplaceId),
  });
  const formRef = useRevealErrors(form);
  const { errors } = form.formState;
  const busy = create.isPending || update.isPending;
  const [kind, agent, capacity] = useWatch({
    control: form.control,
    name: ['kind', 'agent', 'capacity'],
  });
  const extinguisher = kind === 'extinguisher';
  const chosenAgent = (fireExtinguishingAgents as readonly string[]).includes(agent)
    ? (agent as FireExtinguishingAgent)
    : null;
  const capacityValue = /^[0-9]+$/.test(capacity.trim()) ? Number(capacity) : null;
  const code =
    chosenAgent && capacityValue !== null && capacityValue >= 1 && capacityValue <= 250
      ? extinguisherCode(chosenAgent, capacityValue)
      : null;

  const onSubmit = form.handleSubmit(async (values) => {
    const data = toEquipmentRequest(values);
    try {
      if (unit) await update.mutateAsync({ clientId, equipmentId: unit.id, data });
      else await create.mutateAsync({ clientId, data });
      await queryClient.invalidateQueries({ queryKey: getListFireEquipmentQueryKey(clientId) });
      savedToast(unit ? 'Echipamentul a fost salvat.' : 'Echipamentul a fost adăugat.');
      onClose();
    } catch (cause) {
      const failure = saveFailure(cause, 'echipamentul');
      if (failure.field === 'workplaceId') {
        await queryClient.invalidateQueries({ queryKey: getListWorkplacesQueryKey(clientId) });
      }
      form.setError(failure.field ?? 'root.server', { message: failure.message });
    }
  });

  const text = (
    name: 'label' | 'location' | 'manufacturedYear' | 'maintainer',
    id: string,
    label: string,
    extra: { placeholder?: string; numeric?: boolean; wide?: boolean } = {}
  ) => (
    <Field
      id={id}
      label={label}
      mark="optional"
      error={errors[name]}
      className={extra.wide ? 'sm:col-span-2' : undefined}
    >
      <Input
        id={id}
        data-testid={id}
        autoComplete="off"
        inputMode={extra.numeric ? 'numeric' : undefined}
        placeholder={extra.placeholder}
        disabled={busy}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${id}-error` : undefined}
        {...form.register(name)}
      />
    </Field>
  );

  const date = (name: 'lastServiceOn' | 'nextServiceOn', id: string, label: string) => (
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
    <DialogContent data-testid="fire-equipment-dialog" className="sm:max-w-2xl">
      <form ref={formRef} onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>{unit ? 'Modifică echipamentul' : 'Adaugă echipament'}</DialogTitle>
          <DialogDescription>
            Fiecare stingător se trece separat, cu datele lui de service. Documentele PSI le numără
            pe tipuri.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-5 grid gap-5 sm:grid-cols-2">
          {workplaces.length > 1 && (
            <Field
              id="fire-equipment-workplace"
              label="Loc de muncă"
              mark="required"
              error={errors.workplaceId}
              className="sm:col-span-2"
            >
              <NativeSelect
                id="fire-equipment-workplace"
                data-testid="fire-equipment-workplace"
                disabled={busy}
                aria-invalid={Boolean(errors.workplaceId)}
                aria-describedby={errors.workplaceId ? 'fire-equipment-workplace-error' : undefined}
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
          <Field id="fire-equipment-kind" label="Tipul" mark="required" className="sm:col-span-2">
            <NativeSelect
              id="fire-equipment-kind"
              data-testid="fire-equipment-kind"
              disabled={busy}
              {...form.register('kind')}
            >
              {fireEquipmentKinds.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {fireEquipmentKindLabels[value]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {extinguisher && (
            <fieldset
              data-testid="fire-equipment-extinguisher"
              className="grid gap-4 rounded-lg border bg-muted/40 p-4 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]"
            >
              <legend className="sr-only">Stingătorul</legend>
              <Field
                id="fire-equipment-agent"
                label="Agentul de stingere"
                mark="required"
                error={errors.agent}
              >
                <NativeSelect
                  id="fire-equipment-agent"
                  data-testid="fire-equipment-agent"
                  className="bg-card"
                  disabled={busy}
                  aria-invalid={Boolean(errors.agent)}
                  aria-describedby={errors.agent ? 'fire-equipment-agent-error' : undefined}
                  {...form.register('agent')}
                >
                  <NativeSelectOption value="">Alege agentul</NativeSelectOption>
                  {fireExtinguishingAgents.map((value) => (
                    <NativeSelectOption key={value} value={value}>
                      {fireExtinguishingAgentLabels[value]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field
                id="fire-equipment-capacity"
                label="Capacitatea"
                mark="required"
                error={errors.capacity}
              >
                <div className="relative">
                  <Input
                    id="fire-equipment-capacity"
                    data-testid="fire-equipment-capacity"
                    inputMode="numeric"
                    autoComplete="off"
                    className="bg-card pr-12"
                    disabled={busy}
                    aria-invalid={Boolean(errors.capacity)}
                    aria-describedby={errors.capacity ? 'fire-equipment-capacity-error' : undefined}
                    {...form.register('capacity')}
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground"
                  >
                    {chosenAgent ? capacityUnits[chosenAgent] : 'kg/l'}
                  </span>
                </div>
              </Field>
              <div className="grid content-start justify-items-start gap-2" aria-live="polite">
                <span className="text-sm font-medium">Codul</span>
                {code ? (
                  <ExtinguisherCode code={code} large />
                ) : (
                  <span className="flex h-11 items-center text-sm text-muted-foreground">—</span>
                )}
              </div>
              <div className="flex items-center gap-2 sm:col-span-full">
                <Controller
                  control={form.control}
                  name="wheeled"
                  render={({ field }) => (
                    <Checkbox
                      id="fire-equipment-wheeled"
                      data-testid="fire-equipment-wheeled"
                      className="bg-card"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      disabled={busy}
                    />
                  )}
                />
                <Label htmlFor="fire-equipment-wheeled">Stingător carosabil (pe roți)</Label>
              </div>
            </fieldset>
          )}
          {text('label', 'fire-equipment-label', 'Numărul de inventar')}
          {text('manufacturedYear', 'fire-equipment-year', 'Anul fabricației', {
            numeric: true,
          })}
          {text('location', 'fire-equipment-location', 'Amplasamentul', {
            placeholder: 'de exemplu, lângă casa de marcat',
            wide: true,
          })}
          {date('lastServiceOn', 'fire-equipment-last-service', 'Ultimul service')}
          {date('nextServiceOn', 'fire-equipment-next-service', 'Următorul service')}
          {text('maintainer', 'fire-equipment-maintainer', 'Firma de service', { wide: true })}
        </DialogBody>
        {errors.root?.server && (
          <Notice variant="destructive" data-testid="fire-equipment-error" className="mt-4">
            {errors.root.server.message}
          </Notice>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="fire-equipment-save" disabled={busy}>
            {busy ? 'Se salvează…' : unit ? 'Salvează' : 'Adaugă'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
