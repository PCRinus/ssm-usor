import { caenClassName, type CountyCode, countyNames, formatCui } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';

import { Notice } from '@/components/notice';
import { EditAction, Fact, FactList, FormActions, SectionCard } from '@/components/section-card';
import { useInPlaceEdit } from '@/components/use-in-place-edit';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { type CompanyFocus, useFocusRequest } from '@/features/missing-data/focus';

import { IdentificationFields, RegisteredOfficeFields, RegistrationFields } from './client-fields';
import type { Client, ClientFormValues } from './client-form-schema';
import { useClientFieldsForm } from './use-client-fields-form';
import { useCompanyLookup } from './use-company-lookup';

const fields: readonly (keyof ClientFormValues)[] = [
  'cui',
  'vatPayer',
  'legalName',
  'caenCode',
  'tradeRegisterNumber',
  'countyCode',
  'locality',
  'addressLine',
];

function addressField(client: Client) {
  if (!client.countyCode) return 'countyCode';
  return client.locality ? 'addressLine' : 'locality';
}

// `readOnly` is an archived client, whose data is not edited.
export function CompanyCard({
  client,
  readOnly,
  focus,
}: {
  client: Client;
  readOnly: boolean;
  focus?: CompanyFocus;
}) {
  const { editing, editRef, open, close } = useInPlaceEdit();
  useFocusRequest(focus !== undefined, {
    anchor: () => editRef.current,
    open: readOnly ? undefined : open,
    field: readOnly
      ? undefined
      : focus === 'company-trade-register'
        ? 'tradeRegisterNumber'
        : addressField(client),
  });
  const caen = client.caenCode ? caenClassName(client.caenCode) : null;

  return (
    <SectionCard
      data-testid="company-card"
      title="Date firmă"
      action={
        !readOnly &&
        !editing && <EditAction ref={editRef} data-testid="company-edit" onClick={open} />
      }
    >
      {editing && !readOnly ? (
        <CompanyForm client={client} onClose={close} />
      ) : (
        <FactList>
          <Fact label="Denumire" testId="company-legal-name" wide>
            {client.legalName}
          </Fact>
          <Fact label="CUI" testId="company-cui">
            <span className="tabular-nums">{formatCui(client.cui, client.vatPayer)}</span>
          </Fact>
          <Fact label="Nr. Registrul Comerțului" testId="company-trade-register">
            {client.tradeRegisterNumber}
          </Fact>
          <Fact label="Cod CAEN" testId="company-caen">
            {client.caenCode && (
              <>
                <span className="tabular-nums">{client.caenCode}</span>
                {caen && <span className="block font-normal text-muted-foreground">{caen}</span>}
              </>
            )}
          </Fact>
          <Fact label="Județ" testId="company-county">
            {client.countyCode && countyNames[client.countyCode as CountyCode]}
          </Fact>
          <Fact label="Localitate" testId="company-locality">
            {client.locality}
          </Fact>
          <Fact label="Adresă" testId="company-address">
            {client.addressLine}
          </Fact>
        </FactList>
      )}
    </SectionCard>
  );
}

function CompanyForm({ client, onClose }: { client: Client; onClose: () => void }) {
  const { form, onSubmit, isSaving } = useClientFieldsForm({
    client,
    fields,
    successMessage: 'Datele firmei au fost salvate.',
    onSaved: onClose,
  });
  const { lookup, lookupCui } = useCompanyLookup(form);
  const formRef = useRevealErrors(form);
  const { errors, isDirty } = form.formState;
  const busy = isSaving || lookup.status === 'loading';

  return (
    <form
      ref={formRef}
      data-testid="company-form"
      onSubmit={(event) => void onSubmit(event)}
      aria-busy={busy}
      noValidate
      className="grid gap-5 sm:grid-cols-2"
    >
      <IdentificationFields
        form={form}
        busy={busy}
        lookup={lookup}
        onLookup={() => void lookupCui()}
        autoFocus
      />
      <RegistrationFields form={form} busy={busy} />
      <RegisteredOfficeFields form={form} busy={busy} />
      {errors.root?.server && (
        <Notice variant="destructive" data-testid="company-error" className="sm:col-span-2">
          {errors.root.server.message}
        </Notice>
      )}
      <FormActions>
        <Button type="submit" data-testid="company-save" disabled={busy || !isDirty}>
          {isSaving ? 'Se salvează…' : 'Salvează'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          data-testid="company-cancel"
          disabled={isSaving}
          onClick={onClose}
        >
          Renunță
        </Button>
      </FormActions>
    </form>
  );
}
