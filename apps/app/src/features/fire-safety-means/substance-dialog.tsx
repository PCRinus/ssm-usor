import { zodResolver } from '@hookform/resolvers/zod';
import {
  type FireSubstanceDetail,
  fireSubstanceDetailLabels,
  fireSubstanceDetails,
  type ReadSafetySheetResponse,
  type SafetySheetDraftField,
  safetySheetDraftFields,
} from '@ssm-usor/contracts';
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
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  type ApiErrorResponse,
  getListFireSubstancesQueryKey,
  useCreateFireSubstance,
  useUpdateFireSubstance,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { Tag } from '@/features/imports/review-parts';
import { useSavedToast } from '@/features/missing-data/saved-toast';

import { SafetySheetReader, type SheetOutcome } from './safety-sheet-reader';
import { saveFailure } from './save-failure';
import {
  type FireSubstance,
  mergeSafetySheetDraft,
  newSubstanceForm,
  substanceDetailHint,
  substanceDetailPlaceholders,
  substanceFormSchema,
  type SubstanceFormValues,
  toSubstanceForm,
  toSubstanceRequest,
} from './substances-schema';

const isSheetField = (name: string): name is SafetySheetDraftField =>
  (safetySheetDraftFields as readonly string[]).includes(name);

// `null` is closed, `'new'` adds an entry, otherwise the entry to edit.
export type SubstanceEditing = FireSubstance | 'new' | null;

const detailIds: Record<FireSubstanceDetail, string> = {
  physicalChemicalProperties: 'fire-substance-properties',
  identificationCodes: 'fire-substance-codes',
  healthEnvironmentRisks: 'fire-substance-risks',
  protectionMeans: 'fire-substance-protection',
  interventionMeasures: 'fire-substance-intervention',
  extinguishingAgents: 'fire-substance-agents',
  storagePlace: 'fire-substance-storage',
  handling: 'fire-substance-handling',
};

export function SubstanceDialog({
  clientId,
  editing,
  onClose,
}: {
  clientId: string;
  editing: SubstanceEditing;
  onClose: () => void;
}) {
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      {editing && (
        <SubstanceForm
          key={editing === 'new' ? 'new' : editing.id}
          clientId={clientId}
          substance={editing === 'new' ? null : editing}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function SubstanceForm({
  clientId,
  substance,
  onClose,
}: {
  clientId: string;
  substance: FireSubstance | null;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const savedToast = useSavedToast();
  const create = useCreateFireSubstance({ request: apiRequest });
  const update = useUpdateFireSubstance({ request: apiRequest });
  const form = useForm<SubstanceFormValues>({
    resolver: zodResolver(substanceFormSchema),
    defaultValues: substance ? toSubstanceForm(substance) : newSubstanceForm(),
  });
  const formRef = useRevealErrors(form);
  const { errors } = form.formState;
  const [readingSheet, setReadingSheet] = useState(false);
  const [fromSheet, setFromSheet] = useState<ReadonlySet<SafetySheetDraftField>>(new Set());
  const [offers, setOffers] = useState<Partial<Record<SafetySheetDraftField, string>>>({});
  const busy = create.isPending || update.isPending;

  const markFromSheet = (field: SafetySheetDraftField, marked: boolean) =>
    setFromSheet((current) => {
      if (current.has(field) === marked) return current;
      const next = new Set(current);
      if (marked) next.add(field);
      else next.delete(field);
      return next;
    });

  const applyDraft = ({ draft, droppedCodes }: ReadSafetySheetResponse): SheetOutcome => {
    const merged = mergeSafetySheetDraft(form.getValues(), draft, fromSheet);
    for (const field of merged.filled) {
      form.setValue(field, draft[field]!, {
        shouldDirty: true,
        shouldValidate: form.formState.isSubmitted,
      });
    }
    setFromSheet(new Set(merged.filled));
    setOffers(merged.offers);
    return {
      filled: merged.filled.length,
      offered: Object.keys(merged.offers).length,
      droppedCodes,
    };
  };

  const takeOffer = (field: SafetySheetDraftField) => {
    form.setValue(field, offers[field]!, {
      shouldDirty: true,
      shouldValidate: form.formState.isSubmitted,
    });
    markFromSheet(field, true);
    setOffers((current) => {
      const rest = { ...current };
      delete rest[field];
      return rest;
    });
  };

  const register = (name: keyof SubstanceFormValues) =>
    form.register(name, {
      onChange: () => {
        if (isSheetField(name)) markFromSheet(name, false);
      },
    });

  const sheetNote = (name: keyof SubstanceFormValues, id: string) => {
    if (!isSheetField(name)) return null;
    const offer = offers[name];
    return (
      <>
        {fromSheet.has(name) && (
          <Tag tone="info" testId={`${id}-from-sheet`} className="w-fit">
            Din fișă
          </Tag>
        )}
        {offer && (
          <div className="grid gap-1 text-sm" data-testid={`${id}-sheet-offer`}>
            <span className="text-muted-foreground">
              Păstrăm textul tău. În fișă: <span className="text-foreground">{offer}</span>
            </span>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto w-fit px-0"
              data-testid={`${id}-take-sheet`}
              disabled={busy}
              onClick={() => takeOffer(name)}
            >
              Folosește textul din fișă
            </Button>
          </div>
        )}
      </>
    );
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const data = toSubstanceRequest(values);
    try {
      if (substance) {
        await update.mutateAsync({ clientId, substanceId: substance.id, data });
      } else {
        await create.mutateAsync({ clientId, data });
      }
      await queryClient.invalidateQueries({ queryKey: getListFireSubstancesQueryKey(clientId) });
      savedToast(substance ? 'Substanța a fost salvată.' : 'Substanța a fost adăugată.');
      onClose();
    } catch (cause) {
      const notListed =
        cause instanceof ApiHttpError &&
        cause.status === 409 &&
        (cause.body as Partial<ApiErrorResponse>).reason === 'substances_not_listed';
      if (notListed) {
        await queryClient.invalidateQueries({
          queryKey: getListFireSubstancesQueryKey(clientId),
        });
      }
      form.setError('root.server', {
        message: notListed
          ? 'Clientul nu mai este marcat ca utilizând substanțe periculoase. Alege din nou „Se utilizează” și adaugă substanța.'
          : saveFailure(cause, 'substanța').message,
      });
    }
  });

  const text = (
    name: 'name' | 'classification' | 'quantity',
    id: string,
    label: string,
    hint?: string
  ) => (
    <Field
      id={id}
      label={label}
      mark={name === 'name' ? 'required' : undefined}
      hint={hint}
      error={errors[name]}
      className={name === 'quantity' ? undefined : 'sm:col-span-2'}
    >
      <Input
        id={id}
        data-testid={id}
        autoComplete="off"
        disabled={busy}
        aria-invalid={Boolean(errors[name])}
        aria-describedby={errors[name] ? `${id}-error` : hint ? `${id}-hint` : undefined}
        {...register(name)}
      />
      {sheetNote(name, id)}
    </Field>
  );

  return (
    <DialogContent data-testid="fire-substance-dialog" className="sm:max-w-2xl">
      <form ref={formRef} onSubmit={(event) => void onSubmit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>{substance ? 'Modifică substanța' : 'Adaugă o substanță'}</DialogTitle>
          <DialogDescription>
            Denumirea, clasificarea și cantitatea se văd pe produs. Restul se copiază din fișa cu
            date de securitate a produsului, de la secțiunea arătată sub fiecare câmp. Documentele
            SU cer câmpurile fără „opțional”. Poți salva și fără ele.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-5 grid gap-5 sm:grid-cols-2">
          <SafetySheetReader
            clientId={clientId}
            disabled={busy}
            onReading={setReadingSheet}
            onDraft={applyDraft}
          />
          {text('name', 'fire-substance-name', 'Denumirea')}
          {text(
            'classification',
            'fire-substance-classification',
            'Clasificarea (CLP)',
            'Din fișa cu date de securitate, secțiunea 2: clasa de pericol și frazele H, de exemplu „Flam. Gas 1, H220”.'
          )}
          {text(
            'quantity',
            'fire-substance-quantity',
            'Cantitatea deținută',
            'de exemplu, 2 butelii de 11 kg'
          )}
          <h3 className="border-t pt-5 font-semibold sm:col-span-2">
            Din fișa cu date de securitate
          </h3>
          {fireSubstanceDetails.map((detail) => {
            const id = detailIds[detail];
            const hint = substanceDetailHint(detail);
            return (
              <Field
                key={detail}
                id={id}
                label={fireSubstanceDetailLabels[detail].label}
                mark="optional"
                hint={hint}
                error={errors[detail]}
                className="sm:col-span-2"
              >
                <Textarea
                  id={id}
                  data-testid={id}
                  rows={2}
                  placeholder={substanceDetailPlaceholders[detail]}
                  disabled={busy}
                  aria-invalid={Boolean(errors[detail])}
                  aria-describedby={errors[detail] ? `${id}-error` : `${id}-hint`}
                  {...register(detail)}
                />
                {sheetNote(detail, id)}
              </Field>
            );
          })}
        </DialogBody>
        {errors.root?.server && (
          <Notice variant="destructive" data-testid="fire-substance-error" className="mt-4">
            {errors.root.server.message}
          </Notice>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="fire-substance-save" disabled={busy || readingSheet}>
            {busy ? 'Se salvează…' : substance ? 'Salvează' : 'Adaugă'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
