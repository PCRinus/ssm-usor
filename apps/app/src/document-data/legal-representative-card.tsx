import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';

import { Field } from '../components/form-field';
import { Notice } from '../components/notice';
import { EditAction, Fact, FactList, FormActions, SectionCard } from '../components/section-card';
import { useInPlaceEdit } from '../components/use-in-place-edit';
import { useRevealErrors } from '../components/use-reveal-errors';
import { type LegalRepresentativeFocus, useFocusRequest } from '../missing-data/focus';
import {
  type ClientSummary,
  describedBy,
  type DocumentDetails,
  useDocumentDetails,
  useDocumentDetailsForm,
} from './use-document-details-form';

const fields = ['legalRepresentativeName', 'legalRepresentativeRole'] as const;

export function LegalRepresentativeCard({
  client,
  userId,
  focus,
}: {
  client: ClientSummary;
  userId: string;
  focus?: LegalRepresentativeFocus;
}) {
  const details = useDocumentDetails(client.id, userId);
  const { editing, editRef, open, close } = useInPlaceEdit();
  const readOnly = client.archivedAt !== null;
  const saved = details.data?.documentDetails;
  const empty = !saved?.legalRepresentativeName && !saved?.legalRepresentativeRole;
  useFocusRequest(focus !== undefined, {
    ready: !details.isPending,
    anchor: () => editRef.current,
    open: readOnly ? undefined : open,
    field:
      readOnly || !saved
        ? undefined
        : focus === 'legal-representative-role'
          ? 'details-representative-role'
          : 'details-representative-name',
  });

  return (
    <SectionCard
      data-testid="legal-representative-card"
      title="Reprezentant legal"
      description="Numele și funcția vor apărea în deciziile generate."
      action={
        saved &&
        !readOnly &&
        !editing && (
          <EditAction
            ref={editRef}
            empty={empty}
            data-testid="legal-representative-edit"
            onClick={open}
          />
        )
      }
    >
      {details.isPending ? (
        <Skeleton className="h-12 w-full" />
      ) : details.isError ? (
        <Notice
          variant="destructive"
          data-testid="legal-representative-unavailable"
          action={
            <Button
              variant="outline"
              disabled={details.isFetching}
              onClick={() => void details.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca reprezentantul legal.
        </Notice>
      ) : editing && !readOnly ? (
        <LegalRepresentativeForm
          saved={details.data.documentDetails}
          client={client}
          userId={userId}
          onClose={close}
        />
      ) : empty ? (
        <p data-testid="legal-representative-empty" className="text-sm text-muted-foreground">
          Niciun reprezentant legal încă.
        </p>
      ) : (
        <FactList>
          <Fact label="Nume și prenume" testId="legal-representative-name">
            {details.data.documentDetails.legalRepresentativeName}
          </Fact>
          <Fact label="Funcția" testId="legal-representative-role">
            {details.data.documentDetails.legalRepresentativeRole}
          </Fact>
        </FactList>
      )}
    </SectionCard>
  );
}

function LegalRepresentativeForm({
  saved,
  client,
  userId,
  onClose,
}: {
  saved: DocumentDetails;
  client: ClientSummary;
  userId: string;
  onClose: () => void;
}) {
  const { form, onSubmit, busy, locked } = useDocumentDetailsForm({
    saved,
    client,
    userId,
    fields,
    successMessage: 'Reprezentantul legal a fost salvat.',
    onSaved: onClose,
  });
  const formRef = useRevealErrors(form);
  const { errors, isDirty } = form.formState;

  return (
    <form
      ref={formRef}
      data-testid="legal-representative-form"
      onSubmit={(event) => void onSubmit(event)}
      aria-busy={busy}
      noValidate
      className="grid gap-5 sm:grid-cols-2"
    >
      <Field
        id="details-representative-name"
        label="Nume și prenume"
        hint="Așa cum apar în decizii."
        error={errors.legalRepresentativeName}
      >
        <Input
          id="details-representative-name"
          data-testid="details-representative-name"
          className="h-11"
          autoComplete="off"
          autoFocus
          disabled={locked}
          aria-invalid={Boolean(errors.legalRepresentativeName)}
          aria-describedby={describedBy(
            'details-representative-name',
            errors.legalRepresentativeName,
            true
          )}
          {...form.register('legalRepresentativeName')}
        />
      </Field>
      <Field
        id="details-representative-role"
        label="Funcția"
        hint="De exemplu „Administrator”."
        error={errors.legalRepresentativeRole}
      >
        <Input
          id="details-representative-role"
          data-testid="details-representative-role"
          className="h-11"
          autoComplete="off"
          disabled={locked}
          aria-invalid={Boolean(errors.legalRepresentativeRole)}
          aria-describedby={describedBy(
            'details-representative-role',
            errors.legalRepresentativeRole,
            true
          )}
          {...form.register('legalRepresentativeRole')}
        />
      </Field>
      {errors.root?.server && (
        <Notice
          variant="destructive"
          data-testid="legal-representative-error"
          className="sm:col-span-2"
        >
          {errors.root.server.message}
        </Notice>
      )}
      <FormActions>
        <Button type="submit" data-testid="legal-representative-save" disabled={busy || !isDirty}>
          {busy ? 'Se salvează…' : 'Salvează'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          data-testid="legal-representative-cancel"
          disabled={busy}
          onClick={onClose}
        >
          Renunță
        </Button>
      </FormActions>
    </form>
  );
}
