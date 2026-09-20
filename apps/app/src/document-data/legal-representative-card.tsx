import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import { Input } from '@ssm-usor/ui/components/input';

import { Field } from '../components/form-field';
import {
  type ClientSummary,
  describedBy,
  type DocumentDetails,
  useDocumentDetailsForm,
} from './use-document-details-form';

const fields = ['legalRepresentativeName', 'legalRepresentativeRole'] as const;

export function LegalRepresentativeCard({
  saved,
  client,
  userId,
}: {
  saved: DocumentDetails;
  client: ClientSummary;
  userId: string;
}) {
  return (
    <Card data-testid="legal-representative-card">
      <CardHeader>
        <h2 className="text-lg font-semibold">Reprezentant legal</h2>
        <p className="text-sm text-muted-foreground">
          Deciziile sunt emise de reprezentantul legal, cu numele și funcția de mai jos. Generarea
          documentelor le cere pe amândouă.
        </p>
      </CardHeader>
      <CardContent>
        {/* Keyed by what is saved, so the form starts again from what the server holds. */}
        <LegalRepresentativeForm
          key={fields.map((field) => saved[field]).join('|')}
          saved={saved}
          client={client}
          userId={userId}
        />
      </CardContent>
    </Card>
  );
}

function LegalRepresentativeForm({
  saved,
  client,
  userId,
}: {
  saved: DocumentDetails;
  client: ClientSummary;
  userId: string;
}) {
  const { form, onSubmit, busy, locked } = useDocumentDetailsForm({
    saved,
    client,
    userId,
    fields,
    successMessage: 'Reprezentantul legal a fost salvat.',
  });
  const { errors, isDirty } = form.formState;

  return (
    <form
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
          autoComplete="off"
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
        <p
          data-testid="legal-representative-error"
          role="alert"
          className="rounded-md border border-destructive/30 p-3 text-sm text-destructive sm:col-span-2"
        >
          {errors.root.server.message}
        </p>
      )}
      {client.archivedAt === null && (
        <div className="sm:col-span-2">
          <Button type="submit" data-testid="legal-representative-save" disabled={busy || !isDirty}>
            {busy ? 'Se salvează…' : 'Salvează'}
          </Button>
        </div>
      )}
    </form>
  );
}
