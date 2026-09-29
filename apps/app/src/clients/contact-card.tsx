import { Button } from '@ssm-usor/ui/components/button';

import { Notice } from '../components/notice';
import { EditAction, Fact, FactList, FormActions, SectionCard } from '../components/section-card';
import { useInPlaceEdit } from '../components/use-in-place-edit';
import { useRevealErrors } from '../components/use-reveal-errors';
import { ContactFields } from './client-fields';
import type { Client, ClientFormValues } from './client-form-schema';
import { useClientFieldsForm } from './use-client-fields-form';

const fields: readonly (keyof ClientFormValues)[] = ['contactName', 'contactEmail', 'contactPhone'];

// `readOnly` is an archived company, whose data is not edited.
export function ContactCard({ client, readOnly }: { client: Client; readOnly: boolean }) {
  const { editing, editRef, open, close } = useInPlaceEdit();
  const empty = !client.contactName && !client.contactEmail && !client.contactPhone;

  return (
    <SectionCard
      data-testid="contact-card"
      title="Persoană de contact"
      action={
        !readOnly &&
        !editing && (
          <EditAction ref={editRef} empty={empty} data-testid="contact-edit" onClick={open} />
        )
      }
    >
      {editing && !readOnly ? (
        <ContactForm client={client} onClose={close} />
      ) : empty ? (
        <p data-testid="contact-empty" className="text-sm text-muted-foreground">
          Nicio persoană de contact încă.
        </p>
      ) : (
        <FactList>
          <Fact label="Nume" testId="contact-name">
            {client.contactName}
          </Fact>
          <Fact label="Email" testId="contact-email">
            {client.contactEmail && (
              <a
                className="underline-offset-4 hover:underline"
                href={`mailto:${client.contactEmail}`}
              >
                {client.contactEmail}
              </a>
            )}
          </Fact>
          <Fact label="Telefon" testId="contact-phone">
            {client.contactPhone && (
              <a
                className="tabular-nums underline-offset-4 hover:underline"
                href={`tel:${client.contactPhone.replace(/\s+/g, '')}`}
              >
                {client.contactPhone}
              </a>
            )}
          </Fact>
        </FactList>
      )}
    </SectionCard>
  );
}

function ContactForm({ client, onClose }: { client: Client; onClose: () => void }) {
  const { form, onSubmit, isSaving } = useClientFieldsForm({
    client,
    fields,
    successMessage: 'Persoana de contact a fost salvată.',
    onSaved: onClose,
  });
  const formRef = useRevealErrors(form);
  const { errors, isDirty } = form.formState;

  return (
    <form
      ref={formRef}
      data-testid="contact-form"
      onSubmit={(event) => void onSubmit(event)}
      aria-busy={isSaving}
      noValidate
      className="grid gap-5 sm:grid-cols-2"
    >
      <ContactFields form={form} busy={isSaving} autoFocus />
      {errors.root?.server && (
        <Notice variant="destructive" data-testid="contact-error" className="sm:col-span-2">
          {errors.root.server.message}
        </Notice>
      )}
      <FormActions>
        <Button type="submit" data-testid="contact-save" disabled={isSaving || !isDirty}>
          {isSaving ? 'Se salvează…' : 'Salvează'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          data-testid="contact-cancel"
          disabled={isSaving}
          onClick={onClose}
        >
          Renunță
        </Button>
      </FormActions>
    </form>
  );
}
