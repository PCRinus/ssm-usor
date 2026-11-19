import { countOf } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import type { RefObject } from 'react';
import { Controller, type UseFormReturn, useFormState } from 'react-hook-form';

import {
  getGetClientDocumentDetailsQueryKey,
  getGetClientQueryKey,
  type ServiceContractResponse,
  type useSaveServiceContract,
} from '@/api/generated/api';
import { apiErrorBody } from '@/api/http';
import { DatePicker } from '@/components/date-picker';
import { Field } from '@/components/form-field';
import { Masked } from '@/components/replay';
import { EditAction, Fact, FactList, FormActions, SectionCard } from '@/components/section-card';
import { useInPlaceEdit } from '@/components/use-in-place-edit';
import type { Client } from '@/features/clients/client-form-schema';
import { isOffersNotInPlanError, offersNotInPlanMessage } from '@/features/clients/offers-plan';
import { type ContractFocus, useFocusRequest } from '@/features/missing-data/focus';
import { commonFailure } from '@/lib/api-errors';
import { formatRoDate } from '@/lib/dates';

import {
  type ServiceContractFormValues,
  toServiceContractRequest,
} from './service-contract-schema';

const contractFields: Record<ContractFocus, string> = {
  'contract-details': 'contract-contractNumber',
  'contract-representative-name': 'contract-clientRepresentativeName',
  'contract-representative-role': 'contract-clientRepresentativeRole',
};

// The form lives in the card's body, which also needs to know whether it holds unsaved changes.
// `busy` also counts the work on the contract file, which prints these details.
export function ContractDetailsSection({
  client,
  saved,
  form,
  formRef,
  save,
  busy,
  readOnly,
  focus,
  refresh,
  onError,
}: {
  client: Client;
  saved: ServiceContractResponse;
  form: UseFormReturn<ServiceContractFormValues>;
  formRef: RefObject<HTMLFormElement | null>;
  save: ReturnType<typeof useSaveServiceContract>;
  busy: boolean;
  readOnly: boolean;
  focus: ContractFocus | undefined;
  refresh: (response?: ServiceContractResponse) => Promise<void>;
  onError: (error: string | null) => void;
}) {
  const { queryClient } = useRouteContext({ from: '__root__' });
  const { errors, isDirty } = useFormState({ control: form.control });
  const { editing, editRef, open, close } = useInPlaceEdit();
  const locked = busy || readOnly;
  const summarized = saved.contract !== null && !editing;

  useFocusRequest(focus !== undefined, {
    anchor: () => editRef.current,
    open: readOnly ? undefined : open,
    field: focus && !readOnly ? contractFields[focus] : undefined,
  });

  const onSubmit = form.handleSubmit(async (values) => {
    onError(null);
    try {
      await refresh(
        await save.mutateAsync({ clientId: client.id, data: toServiceContractRequest(values) })
      );
      // Who signs is the client's legal representative, which the Detalii tab and the
      // documentation set read from their own queries.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getGetClientDocumentDetailsQueryKey(client.id),
        }),
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(client.id) }),
      ]);
      toast.success('Detaliile contractului au fost salvate.');
    } catch (cause) {
      const body = apiErrorBody(cause);
      if (body?.reason === 'contract_number_taken') {
        form.setError('contractNumber', {
          message: 'Alt contract din același an are acest număr.',
        });
        return;
      }
      onError(
        commonFailure(cause) ??
          (body?.reason === 'client_archived'
            ? 'Firma este arhivată; contractul ei nu mai poate fi modificat.'
            : isOffersNotInPlanError(cause)
              ? offersNotInPlanMessage
              : 'Nu am putut salva detaliile contractului. Verifică conexiunea și încearcă din nou.')
      );
    }
  });

  const text = (
    name:
      'contractNumber' | 'durationMonths' | 'clientRepresentativeName' | 'clientRepresentativeRole',
    label: string,
    options: { hint?: string; inputMode?: 'numeric'; mark?: 'required' } = {}
  ) => {
    const id = `contract-${name}`;
    return (
      <Field id={id} label={label} mark={options.mark} hint={options.hint} error={errors[name]}>
        <Input
          id={id}
          data-testid={id}
          inputMode={options.inputMode}
          autoComplete="off"
          disabled={locked}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? `${id}-error` : options.hint ? `${id}-hint` : undefined}
          {...form.register(name)}
        />
      </Field>
    );
  };
  const date = (name: 'contractDate' | 'startDate', label: string) => (
    <Field id={`contract-${name}`} label={label} mark="required" error={errors[name]}>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <DatePicker
            id={`contract-${name}`}
            testId={`contract-${name}`}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            disabled={locked}
            invalid={Boolean(errors[name])}
            describedBy={errors[name] ? `contract-${name}-error` : undefined}
            required
          />
        )}
      />
    </Field>
  );
  const checkbox = (name: 'renewsAutomatically', label: string) => (
    <div className="flex items-center gap-3">
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <Checkbox
            id={`contract-${name}`}
            data-testid={`contract-${name}`}
            checked={field.value}
            disabled={locked}
            onCheckedChange={(checked) => field.onChange(checked === true)}
            onBlur={field.onBlur}
          />
        )}
      />
      <Label htmlFor={`contract-${name}`} className="leading-snug">
        {label}
      </Label>
    </div>
  );

  return (
    <SectionCard
      data-testid="contract-details-card"
      title="Detaliile contractului"
      action={
        summarized &&
        !readOnly && (
          <EditAction
            ref={editRef}
            data-testid="contract-details-edit"
            disabled={busy}
            onClick={open}
          />
        )
      }
    >
      {summarized && saved.contract ? (
        <FactList data-testid="contract-details-summary">
          <Fact label="Număr și dată">
            Nr. {saved.contract.contractNumber} din {formatRoDate(saved.contract.contractDate)}
          </Fact>
          <Fact label="Perioada" testId="contract-end">
            {formatRoDate(saved.contract.startDate)} – {formatRoDate(saved.contract.endDate)}
            <span className="block font-normal text-muted-foreground">
              {countOf(saved.contract.durationMonths, 'lună', 'luni')},{' '}
              {saved.contract.renewsAutomatically
                ? 'se prelungește automat'
                : 'fără prelungire automată'}
            </span>
          </Fact>
          <Fact label="Semnează pentru client" testId="contract-signer">
            {saved.clientRepresentative.name && (
              <>
                <Masked>{saved.clientRepresentative.name}</Masked>
                {saved.clientRepresentative.role && (
                  <span className="block font-normal text-muted-foreground">
                    {saved.clientRepresentative.role}
                  </span>
                )}
              </>
            )}
          </Fact>
        </FactList>
      ) : readOnly && !saved.contract ? (
        <p data-testid="contract-details-none" className="text-sm text-muted-foreground">
          Detaliile contractului nu au fost completate.
        </p>
      ) : (
        <form
          ref={formRef}
          data-testid="service-contract-form"
          onSubmit={(event) => void onSubmit(event)}
          aria-busy={busy}
          noValidate
          className="grid gap-5 sm:grid-cols-2"
        >
          {text('contractNumber', 'Numărul contractului', {
            mark: 'required',
            inputMode: 'numeric',
            hint:
              saved.contract === null && saved.suggestedNumber !== null
                ? 'Propus după ultimul contract din acest an; îl poți schimba.'
                : 'Din registrul tău de contracte. Un număr se folosește o singură dată pe an.',
          })}
          {date('contractDate', 'Data contractului')}
          {date('startDate', 'Începe la')}
          {text('durationMonths', 'Durata, în luni', {
            mark: 'required',
            inputMode: 'numeric',
          })}
          <div className="grid gap-3 sm:col-span-2">
            {checkbox('renewsAutomatically', 'Se prelungește automat, pe aceeași durată')}
          </div>
          <div className="grid gap-1 border-t pt-5 sm:col-span-2">
            <h3 className="font-semibold">Cine semnează pentru client</h3>
            <p data-testid="contract-signer-hint" className="text-sm text-muted-foreground">
              {client.stage === 'lead'
                ? 'Reprezentantul legal al firmei. Rămâne salvat la firmă și după ce devine client.'
                : 'Reprezentantul legal din Detalii: ce schimbi aici se schimbă și acolo.'}
            </p>
          </div>
          {text('clientRepresentativeName', 'Reprezentant legal', {
            hint: 'Numele și prenumele, așa cum apar în contract.',
          })}
          {text('clientRepresentativeRole', 'Funcția', { hint: 'De exemplu „Administrator”.' })}
          {saved.contract && (
            <p data-testid="contract-end" className="text-sm text-muted-foreground sm:col-span-2">
              Prima perioadă se încheie la {formatRoDate(saved.contract.endDate)}.
            </p>
          )}
          {!readOnly && (
            <FormActions>
              <Button
                type="submit"
                variant={saved.contract ? 'outline' : 'default'}
                data-testid="contract-save"
                disabled={busy || (!isDirty && saved.contract !== null)}
              >
                {save.isPending ? 'Se salvează…' : 'Salvează detaliile'}
              </Button>
              {saved.contract && (
                <Button
                  type="button"
                  variant="ghost"
                  data-testid="contract-details-cancel"
                  disabled={busy}
                  onClick={() => {
                    form.reset();
                    close();
                  }}
                >
                  Renunță
                </Button>
              )}
            </FormActions>
          )}
        </form>
      )}
    </SectionCard>
  );
}
