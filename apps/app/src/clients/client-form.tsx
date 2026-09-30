import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { Input } from '@ssm-usor/ui/components/input';
import { Link } from '@tanstack/react-router';
import type { ComponentProps } from 'react';

import { Field } from '../components/form-field';
import { FormSection } from '../components/form-section';
import { Notice } from '../components/notice';
import { useRevealErrors } from '../components/use-reveal-errors';
import {
  ContactFields,
  IdentificationFields,
  RegisteredOfficeFields,
  RegistrationFields,
} from './client-fields';
import type { Client, ClientStage } from './client-form-schema';
import { useClientForm } from './use-client-form';

const describedBy = (id: string, error: unknown, hint?: boolean) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

const wording = {
  client: { new: 'Client nou', save: 'Salvează clientul', testId: 'client' },
  lead: { new: 'Client potențial nou', save: 'Salvează clientul potențial', testId: 'lead' },
} as const;

// With a lead, the form corrects what was entered about it; without, it adds a client, or a
// lead when asked to.
export function ClientForm({ lead, newStage }: { lead?: Client; newStage?: ClientStage }) {
  const { form, onSubmit, lookup, lookupCui, stage, isSaving } = useClientForm(lead, newStage);
  const formRef = useRevealErrors(form);
  const words = wording[stage];
  const {
    register,
    formState: { errors },
  } = form;
  const busy = isSaving || lookup.status === 'loading';
  const input = (name: keyof typeof errors, hint?: boolean): Partial<ComponentProps<'input'>> => ({
    disabled: busy,
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': describedBy(name, errors[name], hint),
  });

  // For a lead the contact is what there is to know first; for a client it comes last.
  const contactSection = (
    <FormSection
      title="Persoană de contact"
      description={
        stage === 'lead'
          ? 'Poate fi altcineva decât reprezentantul legal. La această adresă vei putea trimite contractul.'
          : 'Poate fi altcineva decât reprezentantul legal.'
      }
    >
      <ContactFields form={form} busy={busy} />
    </FormSection>
  );

  return (
    <div data-testid={lead ? 'edit-lead-page' : `new-${words.testId}-page`} className="space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {lead ? `Modifică: ${lead.legalName}` : words.new}
        </h1>
      </div>
      <form
        ref={formRef}
        className="grid gap-6"
        aria-busy={busy}
        aria-describedby={errors.root?.server ? 'client-form-error' : undefined}
        noValidate
        onSubmit={onSubmit}
      >
        <Card className="gap-0 divide-y py-0">
          <FormSection
            title="Identificare"
            description="Introdu CUI-ul ca să preiei datele publice. Le poți corecta înainte să le salvezi."
          >
            <IdentificationFields
              form={form}
              busy={busy}
              lookup={lookup}
              onLookup={() => void lookupCui()}
            />
          </FormSection>

          {stage === 'lead' && contactSection}

          <FormSection title="Înregistrare">
            <RegistrationFields form={form} busy={busy} />
          </FormSection>

          <FormSection title="Sediu social">
            <RegisteredOfficeFields form={form} busy={busy} />
          </FormSection>

          <FormSection title="Alte informații">
            {!lead && (
              <Field
                id="legalRepresentativeName"
                label="Reprezentant legal"
                mark="optional"
                hint="Numele și prenumele, așa cum apar în decizii."
                error={errors.legalRepresentativeName}
              >
                <Input
                  id="legalRepresentativeName"
                  data-testid="client-representative"
                  className="h-11"
                  {...register('legalRepresentativeName')}
                  autoComplete="off"
                  {...input('legalRepresentativeName', true)}
                />
              </Field>
            )}
            {stage === 'lead' && (
              <Field
                id="declaredEmployeeCount"
                label="Număr de angajați"
                mark="optional"
                hint="Cât declară firma. Ca client, numărul vine din lista de angajați."
                error={errors.declaredEmployeeCount}
              >
                <Input
                  id="declaredEmployeeCount"
                  data-testid="client-employees"
                  className="h-11"
                  {...register('declaredEmployeeCount')}
                  inputMode="numeric"
                  {...input('declaredEmployeeCount', true)}
                />
              </Field>
            )}
          </FormSection>
          {stage === 'client' && contactSection}
        </Card>

        {errors.root?.server && (
          <Notice variant="destructive" id="client-form-error" data-testid="client-form-error">
            {errors.root.server.message}
          </Notice>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" className="h-11" data-testid="client-submit" disabled={busy}>
            {isSaving ? 'Se salvează…' : lead ? 'Salvează modificările' : words.save}
          </Button>
          <Button asChild type="button" variant="ghost" className="h-11">
            {lead ? (
              <Link to="/leads/$leadId" params={{ leadId: lead.id }}>
                Renunță
              </Link>
            ) : (
              <Link to={stage === 'lead' ? '/leads' : '/clients'}>Renunță</Link>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
