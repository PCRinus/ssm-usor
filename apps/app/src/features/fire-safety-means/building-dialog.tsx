import { zodResolver } from '@hookform/resolvers/zod';
import { fireBuildingClassificationLabels, fireBuildingClassifications } from '@ssm-usor/contracts';
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
import type { ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';

import {
  getListFireBuildingsQueryKey,
  getListWorkplacesQueryKey,
  useDeleteFireBuilding,
  useUpdateFireBuilding,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { DatePicker } from '@/components/date-picker';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { useRevealErrors } from '@/components/use-reveal-errors';
import type { Workplace } from '@/features/clients/workplace-schema';
import { useSavedToast } from '@/features/missing-data/saved-toast';

import {
  buildingFormSchema,
  type BuildingFormValues,
  buildingIsEmpty,
  type FireBuilding,
  toBuildingForm,
  toBuildingRequest,
} from './fire-means-schema';
import { saveFailure } from './save-failure';

// `null` is closed; otherwise the fixed space whose card asked, and its building or null.
export type BuildingEditing = { workplace: Workplace; building: FireBuilding | null } | null;

type TextName =
  | 'yearBuilt'
  | 'builtAreaM2'
  | 'levels'
  | 'structure'
  | 'heatingFuel'
  | 'gasUse'
  | 'electricalMaintainer'
  | 'waterReserveM3';

export function BuildingDialog({
  clientId,
  editing,
  onClose,
}: {
  clientId: string;
  editing: BuildingEditing;
  onClose: () => void;
}) {
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      {editing && (
        <BuildingForm
          key={editing.workplace.id}
          clientId={clientId}
          workplace={editing.workplace}
          building={editing.building}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function BuildingForm({
  clientId,
  workplace,
  building,
  onClose,
}: {
  clientId: string;
  workplace: Workplace;
  building: FireBuilding | null;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const savedToast = useSavedToast();
  const update = useUpdateFireBuilding({ request: apiRequest });
  const clear = useDeleteFireBuilding({ request: apiRequest });
  const form = useForm<BuildingFormValues>({
    resolver: zodResolver(buildingFormSchema),
    defaultValues: toBuildingForm(building),
  });
  const formRef = useRevealErrors(form);
  const { errors } = form.formState;
  const busy = update.isPending || clear.isPending;

  const onSubmit = form.handleSubmit(async (values) => {
    const data = toBuildingRequest(values);
    try {
      // Saving every field empty clears the building, so the card reads as never filled in.
      if (buildingIsEmpty(data)) {
        if (building) await clear.mutateAsync({ clientId, workplaceId: workplace.id });
      } else {
        await update.mutateAsync({ clientId, workplaceId: workplace.id, data });
      }
      await queryClient.invalidateQueries({ queryKey: getListFireBuildingsQueryKey(clientId) });
      if (building || !buildingIsEmpty(data)) savedToast('Datele clădirii au fost salvate.');
      onClose();
    } catch (cause) {
      const status = cause instanceof ApiHttpError ? cause.status : null;
      const body = cause instanceof ApiHttpError ? (cause.body as { reason?: string }) : null;
      if (status === 404 || (status === 409 && !body?.reason)) {
        await queryClient.invalidateQueries({ queryKey: getListWorkplacesQueryKey(clientId) });
        form.setError('root.server', {
          message:
            status === 404
              ? 'Locul de muncă a fost arhivat între timp.'
              : 'Locul de muncă a devenit un șantier temporar sau mobil, care nu are clădire.',
        });
        return;
      }
      form.setError('root.server', { message: saveFailure(cause, 'datele clădirii').message });
    }
  });

  const text = (
    name: TextName,
    id: string,
    label: string,
    options: {
      placeholder?: string;
      hint?: string;
      inputMode?: 'numeric' | 'decimal';
      wide?: boolean;
    } = {}
  ) => (
    <Field
      id={id}
      label={label}
      mark="optional"
      hint={options.hint}
      error={errors[name]}
      className={options.wide ? 'sm:col-span-2' : undefined}
    >
      <Input
        id={id}
        data-testid={id}
        autoComplete="off"
        inputMode={options.inputMode}
        placeholder={options.placeholder}
        disabled={busy}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${id}-error` : options.hint ? `${id}-hint` : undefined}
        {...form.register(name)}
      />
    </Field>
  );

  return (
    <DialogContent data-testid="fire-building-dialog" className="sm:max-w-2xl">
      <form ref={formRef} onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>Clădirea, {workplace.name}</DialogTitle>
          <DialogDescription>
            Ce apare în fișa obiectivului, cerută de la 10 angajați. Toate câmpurile sunt opționale:
            ce lași gol apare în fișă ca de completat. Instalațiile și stingătoarele se iau din
            inventar.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-5 grid gap-6">
          <Group id="fire-building-construction" title="Construcția">
            {text('yearBuilt', 'fire-building-year', 'Anul construirii', {
              placeholder: 'de exemplu, 1987',
              inputMode: 'numeric',
              hint: 'Anul punerii în funcțiune.',
            })}
            {text('builtAreaM2', 'fire-building-area', 'Suprafața construită (m²)', {
              placeholder: 'de exemplu, 412,5',
              inputMode: 'decimal',
            })}
            {text('levels', 'fire-building-levels', 'Regimul de înălțime', {
              placeholder: 'de exemplu, P+1E',
            })}
            <Field
              id="fire-building-classification"
              label="Clasificarea"
              mark="optional"
              error={errors.classification}
            >
              <NativeSelect
                id="fire-building-classification"
                data-testid="fire-building-classification"
                disabled={busy}
                {...form.register('classification')}
              >
                <NativeSelectOption value="">Nespecificată</NativeSelectOption>
                {fireBuildingClassifications.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {capitalized(fireBuildingClassificationLabels[value])}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            {text('structure', 'fire-building-structure', 'Structura de rezistență', {
              placeholder: 'de exemplu, cadre din beton armat, închideri din zidărie',
              wide: true,
            })}
          </Group>
          <Group id="fire-building-utilities" title="Utilități">
            {text('heatingFuel', 'fire-building-heating-fuel', 'Combustibilul pentru încălzire', {
              placeholder: 'de exemplu, gaze naturale',
            })}
            {text('gasUse', 'fire-building-gas-use', 'Gaze naturale sau GPL', {
              placeholder: 'de exemplu, încălzire și prepararea hranei',
              hint: 'Pentru ce se folosesc, sau „nu se folosesc”.',
            })}
            {text(
              'electricalMaintainer',
              'fire-building-electrical-maintainer',
              'Firma care întreține instalația electrică'
            )}
            <Field
              id="fire-building-electrical-check"
              label="Ultima verificare a instalației electrice"
              mark="optional"
              error={errors.electricalLastCheckOn}
            >
              <Controller
                control={form.control}
                name="electricalLastCheckOn"
                render={({ field }) => (
                  <DatePicker
                    id="fire-building-electrical-check"
                    testId="fire-building-electrical-check"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    disabled={busy}
                    invalid={Boolean(errors.electricalLastCheckOn)}
                    describedBy={
                      errors.electricalLastCheckOn
                        ? 'fire-building-electrical-check-error'
                        : undefined
                    }
                  />
                )}
              />
            </Field>
          </Group>
          <Group id="fire-building-water" title="Apa pentru stingere">
            {text('waterReserveM3', 'fire-building-water-reserve', 'Rezerva de apă (m³)', {
              placeholder: 'de exemplu, 54',
              inputMode: 'decimal',
              hint: '0 dacă nu are o rezervă proprie. Hidranții se trec la instalații.',
            })}
          </Group>
          <Group id="fire-building-notes-group" title="Observații">
            <Field
              id="fire-building-notes"
              label="Alte date despre clădire"
              mark="optional"
              hint="Apar în fișa obiectivului sub datele clădirii."
              error={errors.notes}
              className="sm:col-span-2"
            >
              <Textarea
                id="fire-building-notes"
                data-testid="fire-building-notes"
                rows={3}
                disabled={busy}
                aria-invalid={Boolean(errors.notes)}
                aria-describedby={
                  errors.notes ? 'fire-building-notes-error' : 'fire-building-notes-hint'
                }
                {...form.register('notes')}
              />
            </Field>
          </Group>
        </DialogBody>
        {errors.root?.server && (
          <Notice variant="destructive" data-testid="fire-building-error" className="mt-4">
            {errors.root.server.message}
          </Notice>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="fire-building-save" disabled={busy}>
            {busy ? 'Se salvează…' : 'Salvează'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-5 sm:grid-cols-2">
      <h3 id={`${id}-title`} className="font-semibold sm:col-span-2">
        {title}
      </h3>
      {children}
    </section>
  );
}

const capitalized = (text: string) => text.charAt(0).toLocaleUpperCase('ro') + text.slice(1);
