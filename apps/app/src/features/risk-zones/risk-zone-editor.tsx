import { zodResolver } from '@hookform/resolvers/zod';
import {
  type RiskZone,
  type RiskZoneFactor,
  riskZoneNameMaxLength,
  type RiskZoneRequest,
  type RiskZonesResponse,
  type RiskZoneSuggestion,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@ssm-usor/ui/components/drawer';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Notice } from '@ssm-usor/ui/components/notice';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@ssm-usor/ui/components/sheet';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { Search, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import {
  getListRiskZoneNamesQueryKey,
  getListWorkplacesQueryKey,
  useListRiskZoneNames,
  useListWorkplaces,
} from '@/api/generated/api';
import { apiErrorReason, ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { replayShow } from '@/app/observability/replay-masking';
import { useCloseGuard, useHoldOpen } from '@/components/close-guard';
import { CloseGuard } from '@/components/form-dialog';
import { Field } from '@/components/form-field';
import { type ComboboxItem, SearchCombobox } from '@/components/search-combobox';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { measureKindLabels } from '@/features/risk-evaluations/risk-evaluation-schema';
import { RiskLevelTile } from '@/features/risk-evaluations/risk-level-tile';
import { normalizeSearch } from '@/lib/normalize-search';

import { factorGroups, nameTakenMessage, printedMeasures, zoneFailure } from './risk-zone-model';
import type { RiskZonesStore } from './use-risk-zones';

export type ZoneEditing =
  | { kind: 'new' }
  | { kind: 'edit'; zone: RiskZone }
  | { kind: 'suggestion'; suggestion: RiskZoneSuggestion };

export const noFactorNorMeasures =
  'Alege cel puțin un factor de risc sau scrie măsurile proprii ale zonei.';

const zoneFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Scrie denumirea zonei, de cel puțin două caractere.')
      .max(riskZoneNameMaxLength, `Denumirea are cel mult ${riskZoneNameMaxLength} de caractere.`),
    workplaceId: z.string(),
    location: z.string().trim().max(300, 'Localizarea are cel mult 300 de caractere.'),
    measures: z.string().trim().max(2000, 'Măsurile au cel mult 2000 de caractere.'),
    factorIds: z.array(z.string()),
  })
  .superRefine((values, context) => {
    if (values.factorIds.length === 0 && !values.measures) {
      context.addIssue({ code: 'custom', path: ['measures'], message: noFactorNorMeasures });
    }
  });

type ZoneFormValues = z.input<typeof zoneFormSchema>;

function defaults(editing: ZoneEditing): ZoneFormValues {
  if (editing.kind === 'edit') {
    const { zone } = editing;
    return {
      name: zone.name,
      workplaceId: zone.workplace?.id ?? '',
      location: zone.location ?? '',
      measures: zone.measures ?? '',
      factorIds: zone.factors.map((factor) => factor.id),
    };
  }
  return {
    name: editing.kind === 'suggestion' ? editing.suggestion.name : '',
    workplaceId: '',
    location: '',
    measures: '',
    factorIds: editing.kind === 'suggestion' ? editing.suggestion.factors.map((f) => f.id) : [],
  };
}

const toRequest = (values: ZoneFormValues): RiskZoneRequest => ({
  name: values.name.trim(),
  workplaceId: values.workplaceId || null,
  location: values.location.trim() || null,
  measures: values.measures.trim() || null,
  factorIds: values.factorIds,
});

const labels = {
  new: { title: 'Zonă nouă', save: 'Adaugă zona', saved: 'Zona a fost adăugată.' },
  edit: { title: 'Modifică zona', save: 'Salvează', saved: 'Zona a fost salvată.' },
  suggestion: { title: 'Zonă nouă', save: 'Confirmă zona', saved: 'Zona a fost confirmată.' },
};

export function RiskZoneEditor({
  clientId,
  clientName,
  data,
  store,
  editing,
  onClose,
}: {
  clientId: string;
  clientName: string;
  data: RiskZonesResponse;
  store: RiskZonesStore;
  editing: ZoneEditing | null;
  onClose: () => void;
}) {
  const phone = useIsMobile();
  // Kept until the panel has slid out, after the parent has already let go of it.
  const [shown, setShown] = useState(editing);
  if (editing !== null && editing !== shown) setShown(editing);
  const open = editing !== null;
  const { savingRef, onOpenChange } = useCloseGuard(onClose);

  const form = shown && (
    <CloseGuard savingRef={savingRef}>
      <RiskZoneForm
        key={shown.kind === 'edit' ? shown.zone.id : shown.kind}
        phone={phone}
        clientId={clientId}
        clientName={clientName}
        data={data}
        store={store}
        editing={shown}
        onClose={onClose}
      />
    </CloseGuard>
  );

  if (phone) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        {form && <DrawerContent data-testid="risk-zone-editor">{form}</DrawerContent>}
      </Drawer>
    );
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {form && (
        <SheetContent
          data-testid="risk-zone-editor"
          side="right"
          showCloseButton={false}
          overlayClassName="bg-foreground/20"
          className="w-180 max-w-full gap-0 shadow-[-12px_0_40px_rgb(24_52_46/0.18)] sm:max-w-full"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById('risk-zone-name')?.focus();
          }}
        >
          {form}
        </SheetContent>
      )}
    </Sheet>
  );
}

function RiskZoneForm({
  phone,
  clientId,
  clientName,
  data,
  store,
  editing,
  onClose,
}: {
  phone: boolean;
  clientId: string;
  clientName: string;
  data: RiskZonesResponse;
  store: RiskZonesStore;
  editing: ZoneEditing;
  onClose: () => void;
}) {
  const { request, key } = useApi();
  const form = useForm<ZoneFormValues>({
    resolver: zodResolver(zoneFormSchema),
    defaultValues: defaults(editing),
  });
  const formRef = useRevealErrors(form);
  const { errors, isSubmitting: busy } = form.formState;
  useHoldOpen(busy);
  const [factorIds, ownMeasures] = useWatch({
    control: form.control,
    name: ['factorIds', 'measures'],
  });

  const workplaces = useListWorkplaces(clientId, {
    request,
    query: { queryKey: key(getListWorkplacesQueryKey(clientId)) },
  });
  const namesParams = { exceptClientId: clientId };
  const names = useListRiskZoneNames(namesParams, {
    request,
    query: { queryKey: key(getListRiskZoneNamesQueryKey(namesParams)), staleTime: 30_000 },
  });

  const zone = editing.kind === 'edit' ? editing.zone : null;
  const linked = zone?.factors ?? (editing.kind === 'suggestion' ? editing.suggestion.factors : []);
  const groups = factorGroups(data.factors, linked);
  const byId = new Map(groups.flatMap((group) => group.factors).map((f) => [f.id, f]));
  const chosen = factorIds.flatMap((id) => byId.get(id) ?? []);
  const preview = printedMeasures(chosen, ownMeasures);
  const label = labels[editing.kind];

  const places = workplaces.data?.items ?? [];
  const archivedPlace =
    zone?.workplace && !places.some((place) => place.id === zone.workplace?.id)
      ? zone.workplace
      : null;

  const nameItems: ComboboxItem[] = (names.data?.items ?? []).map((item) => ({
    value: item.name,
    label: item.name,
    description: item.measures ? `Cu măsuri proprii: ${item.measures}` : 'Fără măsuri proprii',
    search: item.name,
  }));
  const knownNames = nameItems.map((item) => normalizeSearch(item.value));

  const onSubmit = (event: FormEvent<HTMLFormElement>) =>
    form.handleSubmit(async (values) => {
      try {
        await store.save(zone?.id ?? null, toRequest(values), label.saved);
        onClose();
      } catch (cause) {
        if (cause instanceof ApiHttpError && apiErrorReason(cause) === 'risk_zone_name_taken') {
          form.setError('name', { type: 'server', message: nameTakenMessage });
          return;
        }
        form.setError('root.server', {
          message: zoneFailure(
            cause,
            'Nu am putut salva zona. Verifică conexiunea și încearcă din nou.'
          ),
        });
      }
    })(event);

  const describedBy = (id: string, invalid: boolean) => (invalid ? `${id}-error` : undefined);
  const Title = phone ? DrawerTitle : SheetTitle;
  const Description = phone ? DrawerDescription : SheetDescription;
  const close = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={phone ? 'size-11 shrink-0' : 'shrink-0'}
      aria-label={phone ? 'Renunță' : 'Închide'}
      disabled={busy}
      onClick={onClose}
    >
      <X aria-hidden="true" />
    </Button>
  );
  const heading = (
    <div className="mr-auto grid min-w-0 gap-0.5">
      <Title className={phone ? undefined : 'text-lg leading-snug'}>{label.title}</Title>
      <Description className="truncate">{clientName}</Description>
    </div>
  );
  const submit = (
    <Button
      type="submit"
      data-testid="risk-zone-save"
      disabled={busy}
      className={phone ? 'h-11 w-full' : undefined}
    >
      {busy ? 'Se salvează…' : label.save}
    </Button>
  );

  const fields = (
    <div className="grid gap-6 @container">
      <div className="grid gap-5 pt-3 @md:grid-cols-2">
        <Field
          id="risk-zone-name"
          label="Denumire"
          mark="required"
          error={errors.name}
          className="@md:col-span-2"
        >
          <Controller
            control={form.control}
            name="name"
            render={({ field }) => (
              <SearchCombobox
                id="risk-zone-name"
                testId="risk-zone-name"
                items={[]}
                section={{
                  heading: 'Folosite la ceilalți clienți ai organizației',
                  items: nameItems,
                }}
                value={field.value}
                onChange={(name) => {
                  field.onChange(name);
                  const used = names.data?.items.find((item) => item.name === name);
                  if (used?.measures && !form.getValues('measures').trim()) {
                    form.setValue('measures', used.measures, { shouldValidate: true });
                  }
                }}
                onBlur={field.onBlur}
                filter={(value, search) => {
                  const query = normalizeSearch(search).trim();
                  return !query || normalizeSearch(value).includes(query) ? 1 : 0;
                }}
                placeholder="Alege sau scrie denumirea"
                searchPlaceholder="Caută sau scrie denumirea"
                emptyMessage="Scrie denumirea zonei."
                clearLabel="Șterge denumirea"
                descriptionClassName="line-clamp-2 text-muted-foreground"
                descriptionInTrigger={false}
                unknownValue={(search) => {
                  const text = search.trim();
                  if (!text) return null;
                  return knownNames.includes(normalizeSearch(text)) ? null : text;
                }}
                disabled={busy}
                invalid={Boolean(errors.name)}
                describedBy={describedBy('risk-zone-name', Boolean(errors.name))}
              />
            )}
          />
        </Field>
        <Field
          id="risk-zone-workplace"
          label="Loc de muncă"
          mark="optional"
          error={errors.workplaceId}
        >
          <NativeSelect
            id="risk-zone-workplace"
            data-testid="risk-zone-workplace"
            disabled={busy}
            {...form.register('workplaceId')}
          >
            <NativeSelectOption value="">Alege locul de muncă</NativeSelectOption>
            {places.map((place) => (
              <NativeSelectOption key={place.id} value={place.id}>
                {place.name}
              </NativeSelectOption>
            ))}
            {archivedPlace && (
              <NativeSelectOption value={archivedPlace.id}>
                {archivedPlace.name} (arhivat)
              </NativeSelectOption>
            )}
          </NativeSelect>
        </Field>
        <Field id="risk-zone-location" label="Localizare" mark="optional" error={errors.location}>
          <Input
            id="risk-zone-location"
            data-testid="risk-zone-location"
            autoComplete="off"
            maxLength={300}
            disabled={busy}
            aria-invalid={Boolean(errors.location)}
            aria-describedby={describedBy('risk-zone-location', Boolean(errors.location))}
            {...form.register('location')}
          />
        </Field>
      </div>

      <Controller
        control={form.control}
        name="factorIds"
        render={({ field }) => (
          <FactorChecklist
            groups={groups}
            value={field.value}
            onChange={(next) => {
              field.onChange(next);
              if (errors.measures) void form.trigger('measures');
            }}
            disabled={busy}
            invalid={Boolean(errors.measures)}
          />
        )}
      />

      <Field id="risk-zone-measures" label="Măsuri proprii" mark="optional" error={errors.measures}>
        <Textarea
          id="risk-zone-measures"
          data-testid="risk-zone-measures"
          rows={3}
          maxLength={2000}
          disabled={busy}
          aria-invalid={Boolean(errors.measures)}
          aria-describedby={describedBy('risk-zone-measures', Boolean(errors.measures))}
          {...form.register('measures')}
        />
      </Field>

      <section
        aria-labelledby="risk-zone-preview-title"
        className="grid gap-3 border-t pt-5"
        data-testid="risk-zone-preview"
      >
        <h3 id="risk-zone-preview-title" className="text-sm font-semibold">
          Ce scrie evidența la Măsuri
        </h3>
        {preview.byKind.length === 0 && preview.own.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nicio măsură încă: alege un factor de risc cu măsuri sau scrie măsurile proprii.
          </p>
        ) : (
          <dl className="grid gap-3.5 rounded-lg border bg-card p-4 text-sm">
            {preview.byKind.map((group) => (
              <PreviewGroup key={group.kind} label={measureKindLabels[group.kind]}>
                {group.texts}
              </PreviewGroup>
            ))}
            {preview.own.length > 0 && (
              <PreviewGroup label="Proprii zonei">{preview.own}</PreviewGroup>
            )}
          </dl>
        )}
      </section>

      {errors.root?.server && (
        <Notice variant="destructive" data-testid="risk-zone-editor-error">
          {errors.root.server.message}
        </Notice>
      )}
    </div>
  );

  return (
    <form
      {...replayShow}
      ref={formRef}
      onSubmit={(event) => void onSubmit(event)}
      aria-busy={busy}
      noValidate
      className="flex min-h-0 flex-1 flex-col"
    >
      {phone ? (
        <>
          <DrawerHeader>
            {heading}
            {close}
          </DrawerHeader>
          <DrawerBody className="pb-5">{fields}</DrawerBody>
          <DrawerFooter>{submit}</DrawerFooter>
        </>
      ) : (
        <>
          <div className="flex shrink-0 items-start gap-3 px-6 pt-5 pb-3">
            {heading}
            {close}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-1 pb-6">{fields}</div>
          <div className="flex shrink-0 items-center gap-2 border-t bg-background px-6 py-3.5">
            <Button
              type="button"
              variant="ghost"
              className="mr-auto"
              disabled={busy}
              onClick={onClose}
            >
              Renunță
            </Button>
            {submit}
          </div>
        </>
      )}
    </form>
  );
}

function PreviewGroup({ label, children }: { label: string; children: string[] }) {
  return (
    <div data-testid="risk-zone-preview-group">
      <dt className="text-[13px] leading-[18px] font-semibold text-section-tab-foreground">
        {label}
      </dt>
      <dd className="mt-1">
        <ul className="grid gap-1">
          {children.map((text) => (
            <li key={text} className="flex gap-2 wrap-anywhere">
              <span aria-hidden="true" className="text-muted-foreground">
                –
              </span>
              {text}
            </li>
          ))}
        </ul>
      </dd>
    </div>
  );
}

function FactorChecklist({
  groups,
  value,
  onChange,
  disabled,
  invalid,
}: {
  groups: ReturnType<typeof factorGroups>;
  value: string[];
  onChange: (next: string[]) => void;
  disabled: boolean;
  invalid: boolean;
}) {
  const [query, setQuery] = useState('');
  const search = normalizeSearch(query).trim();
  const matches = (factor: RiskZoneFactor) =>
    !search ||
    normalizeSearch(factor.description).includes(search) ||
    normalizeSearch(factor.evaluation.title).includes(search);
  const shown = groups
    .map((group) => ({ ...group, factors: group.factors.filter(matches) }))
    .filter((group) => group.factors.length > 0);
  const chosen = new Set(value);
  const count =
    value.length === 0
      ? 'niciunul ales'
      : value.length === 1
        ? 'un factor ales'
        : `${value.length} aleși`;

  return (
    <fieldset className="grid min-w-0 gap-3 border-t pt-5" data-testid="risk-zone-factors">
      <legend className="float-left flex w-full items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">Factori de risc</span>
        <span data-testid="risk-zone-factor-count" className="text-sm text-muted-foreground">
          {count}
        </span>
      </legend>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Fișele de evaluare ale clientului nu au încă factori de risc. Scrie măsurile proprii ale
          zonei.
        </p>
      ) : (
        <div
          aria-invalid={invalid || undefined}
          className="overflow-hidden rounded-md border border-input bg-card shadow-xs aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20"
        >
          <label className="flex h-10 items-center gap-2 border-b px-3 text-muted-foreground">
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">Caută un factor</span>
            <input
              type="search"
              data-testid="risk-zone-factor-search"
              placeholder="Caută un factor"
              value={query}
              disabled={disabled}
              onChange={(event) => setQuery(event.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="max-h-80 overflow-y-auto max-sm:max-h-none">
            {shown.length === 0 && (
              <p className="px-3 py-3 text-sm text-muted-foreground">
                Niciun factor nu se potrivește căutării.
              </p>
            )}
            {shown.map((group) => (
              <div key={group.evaluation.id} role="group" aria-label={group.evaluation.title}>
                <p className="bg-section-tab px-3 pt-2 pb-1 text-[13px] leading-[18px] font-semibold text-section-tab-foreground">
                  {group.evaluation.title}
                </p>
                {group.factors.map((factor) => (
                  <label
                    key={factor.id}
                    data-testid="risk-zone-factor"
                    className="flex cursor-pointer items-center gap-3 border-t px-3 py-2 text-sm first-of-type:border-t-0"
                  >
                    <Checkbox
                      data-testid="risk-zone-factor-check"
                      checked={chosen.has(factor.id)}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        onChange(
                          checked === true
                            ? [...value, factor.id]
                            : value.filter((id) => id !== factor.id)
                        )
                      }
                    />
                    <RiskLevelTile level={factor.riskLevel} />
                    <span className="min-w-0 wrap-anywhere">{factor.description}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </fieldset>
  );
}
