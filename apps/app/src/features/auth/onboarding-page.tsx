import { zodResolver } from '@hookform/resolvers/zod';
import { currentTermsVersion, isValidCuiInput, normalizeCui } from '@ssm-usor/contracts';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Input } from '@ssm-usor/ui/components/input';
import { toast } from '@ssm-usor/ui/lib/toast';
import { Navigate, useNavigate, useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import {
  type ApiErrorResponse,
  getGetMeQueryKey,
  getListMyInvitationsQueryKey,
  lookupCompany,
  type MeResponse,
  type UpdateOrganizationCompanyDetailsRequest,
  useCreateOrganization,
  useListMyInvitations,
  useUpdateOrganizationCompanyDetails,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { captureAsMember } from '@/app/observability/posthog';
import { PublicFrame, PublicFrameAction } from '@/app/public-frame';
import { Field, FieldMessage } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { useMe } from '@/features/account/use-me';
import { AnafLookupButton } from '@/features/clients/anaf-lookup-button';
import { roleLabels } from '@/features/organization/labels';

import { useAuth } from './auth-context';
import { OnboardingProgress, SignedInAs } from './onboarding-frame';
import {
  anafFoundMessage,
  type CompanyLookup,
  onboardingSchema,
  type OnboardingValues,
  toOnboardingCompanyDetails,
} from './onboarding-schema';

export function OnboardingPage() {
  const me = useMe();
  // Set once this page creates the organization, whose next steps follow; the refreshed account
  // must not send the new owner straight to the app.
  const [created, setCreated] = useState(false);

  if (me.isPending) {
    return (
      <PublicFrame testId="onboarding-loading" title="Se încarcă…">
        <p role="status" className="sr-only">
          Se încarcă contul…
        </p>
      </PublicFrame>
    );
  }
  if (me.isError) {
    return (
      <PublicFrame
        testId="onboarding-error"
        title="Nu am putut încărca contul"
        description="Verifică conexiunea și încearcă din nou."
      >
        <PublicFrameAction disabled={me.isFetching} onClick={() => void me.refetch()}>
          Încearcă din nou
        </PublicFrameAction>
      </PublicFrame>
    );
  }
  if (me.data.membership && !created) return <Navigate to="/dashboard" replace />;

  return <OnboardingForm me={me.data} onCreated={() => setCreated(true)} />;
}

// Google fills `full_name`, and `name` with the same value, on an account it made (ADR 027).
function googleName(metadata: Record<string, unknown> | undefined) {
  const name = metadata?.full_name ?? metadata?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : undefined;
}

type LookupState =
  | { status: 'idle' | 'loading' }
  | { status: 'found'; company: CompanyLookup }
  | { status: 'error'; message: string };

function OnboardingForm({ me, onCreated }: { me: MeResponse; onCreated: () => void }) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const { session } = useAuth();
  const navigate = useNavigate();
  const create = useCreateOrganization({ request: apiRequest });
  const saveCompanyDetails = useUpdateOrganizationCompanyDetails({ request: apiRequest });
  const [lookup, setLookup] = useState<LookupState>({ status: 'idle' });
  const invitations = useListMyInvitations({
    request: apiRequest,
    query: { queryKey: [...getListMyInvitationsQueryKey(), me.user.id] },
  });
  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      fullName: me.profile?.fullName ?? googleName(session?.user.user_metadata) ?? '',
      cui: '',
      organizationName: '',
      acceptsDataProcessing: false,
      acceptsTerms: false,
    },
  });
  const formRef = useRevealErrors(form);
  const { errors, isSubmitting } = form.formState;
  const busy = isSubmitting || lookup.status === 'loading';

  async function lookupCui() {
    const input = form.getValues('cui');
    if (!isValidCuiInput(input)) {
      form.setError('cui', { message: 'Introdu un CUI valid înainte de căutare.' });
      return;
    }
    form.clearErrors('cui');
    setLookup({ status: 'loading' });
    try {
      const { company } = await lookupCompany({ cui: normalizeCui(input)!.cui }, apiRequest);
      form.setValue('organizationName', company.legalName, { shouldDirty: true });
      form.clearErrors('organizationName');
      setLookup({ status: 'found', company });
    } catch (cause) {
      setLookup({
        status: 'error',
        message:
          cause instanceof ApiHttpError && cause.status === 404
            ? 'Nu am găsit nicio companie cu acest CUI la ANAF. Poți continua fără datele firmei.'
            : 'Serviciul ANAF nu este disponibil momentan. Poți continua și completa datele firmei mai târziu.',
      });
    }
  }

  // The organization exists by now, so a failure here only leaves its details to fill in later.
  async function saveDetails(data: UpdateOrganizationCompanyDetailsRequest) {
    try {
      await saveCompanyDetails.mutateAsync({ data });
    } catch {
      toast.warning(
        'Organizația a fost creată, dar nu am putut salva datele firmei. Le poți completa în Organizație → Date firmă.',
        {
          duration: 10_000,
          action: {
            label: 'Date firmă',
            onClick: () => void navigate({ to: '/organizatie/date-firma' }),
          },
        }
      );
    }
  }

  const onSubmit = form.handleSubmit(async ({ fullName, cui, organizationName }) => {
    let created = false;
    try {
      await create.mutateAsync({
        data: {
          fullName,
          organizationName,
          termsVersion: currentTermsVersion,
          acceptsSpecialClauses: true,
        },
      });
      created = true;
    } catch (cause) {
      const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
      // Already a member, for instance after accepting an invitation in another tab:
      // refreshing the account below sends them into the app.
      if (body?.reason !== 'already_in_organization') {
        form.setError('root.server', {
          message:
            body?.reason === 'email_not_confirmed'
              ? 'Confirmă mai întâi adresa de email, din linkul primit la înregistrare.'
              : 'Nu am putut crea organizația. Verifică conexiunea și încearcă din nou.',
        });
        return;
      }
    }
    if (created) {
      onCreated();
      const details = toOnboardingCompanyDetails(
        cui,
        lookup.status === 'found' ? lookup.company : null
      );
      captureAsMember(me.user.id, 'organization_created', {
        with_cui: details !== null,
        details_from_anaf: details?.fromAnaf ?? false,
      });
      if (details) await saveDetails(details.request);
    }
    await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    // Someone who turned out to be a member already has nothing to set up here.
    await navigate({ to: created ? '/configurare/cine-semneaza' : '/dashboard', replace: true });
  });

  const pending = invitations.data?.items ?? [];
  const searched = lookup.status === 'found' || lookup.status === 'error';

  return (
    <PublicFrame
      testId="onboarding-page"
      progress={<OnboardingProgress step={1} name="Firma" />}
      title="Configurează-ți organizația"
      description="Adaugă datele serviciului tău extern de prevenire și protecție. Vei putea invita echipa după configurare."
    >
      {pending.length > 0 && (
        <Notice
          variant="info"
          data-testid="onboarding-invitations"
          title="Ai o invitație în așteptare"
        >
          <ul className="grid gap-1">
            {pending.map((invitation) => (
              <li key={`${invitation.organizationName}-${invitation.expiresAt}`}>
                <strong>{invitation.organizationName}</strong>
                {invitation.inviterName && `, de la ${invitation.inviterName}`}, ca{' '}
                {roleLabels[invitation.role].toLowerCase()}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Ca să intri în acea organizație, folosește linkul din emailul de invitație sau cere să
            îți fie retrimis. Un cont poate aparține unei singure organizații, deci nu crea una nouă
            dacă vrei să o accepți.
          </p>
        </Notice>
      )}
      <form
        ref={formRef}
        className="grid gap-5"
        aria-busy={isSubmitting}
        noValidate
        onSubmit={(event) => void onSubmit(event)}
      >
        <Field
          id="onboarding-cui"
          label="CUI-ul firmei tale"
          hint="Cu el preluăm noi datele firmei de la ANAF. Poți continua și fără el: le completezi mai târziu, la Organizație."
          error={errors.cui}
        >
          <div className="grid gap-2 sm:flex">
            <Input
              id="onboarding-cui"
              data-testid="onboarding-cui"
              className="h-11 sm:flex-1"
              inputMode="numeric"
              autoComplete="off"
              disabled={busy}
              aria-invalid={Boolean(errors.cui)}
              aria-describedby={errors.cui ? 'onboarding-cui-error' : 'onboarding-cui-hint'}
              {...form.register('cui', { onChange: () => setLookup({ status: 'idle' }) })}
            />
            <AnafLookupButton
              testId="onboarding-lookup"
              primary={!searched}
              again={lookup.status === 'found'}
              loading={lookup.status === 'loading'}
              disabled={busy}
              onClick={() => void lookupCui()}
            />
          </div>
        </Field>
        {lookup.status === 'found' && (
          <Notice
            variant={lookup.company.inactive ? 'warning' : 'success'}
            data-testid="onboarding-lookup-status"
          >
            <p>{anafFoundMessage(lookup.company).taken}</p>
            <p className="mt-1">
              {lookup.company.inactive
                ? 'Atenție: compania figurează ca inactivă.'
                : anafFoundMessage(lookup.company).missing}
            </p>
          </Notice>
        )}
        {lookup.status === 'error' && (
          <Notice variant="warning" role="alert" data-testid="onboarding-lookup-status">
            {lookup.message}
          </Notice>
        )}
        <Field
          id="onboarding-organization"
          label="Numele organizației"
          mark="required"
          hint="Așa cum vrei să apară pentru echipa ta. Îl poți scurta."
          error={errors.organizationName}
        >
          <Input
            id="onboarding-organization"
            data-testid="onboarding-organization"
            className="h-11"
            autoComplete="organization"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.organizationName)}
            aria-describedby={
              errors.organizationName
                ? 'onboarding-organization-error'
                : 'onboarding-organization-hint'
            }
            {...form.register('organizationName')}
          />
        </Field>
        <Field
          id="onboarding-full-name"
          label="Numele tău"
          hint="Tu, cel care folosește contul."
          mark="required"
          error={errors.fullName}
        >
          <Input
            id="onboarding-full-name"
            data-testid="onboarding-full-name"
            className="h-11"
            autoComplete="name"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={
              errors.fullName ? 'onboarding-full-name-error' : 'onboarding-full-name-hint'
            }
            {...form.register('fullName')}
          />
        </Field>
        <div className="grid gap-2">
          <div className="flex items-start gap-3">
            <Controller
              control={form.control}
              name="acceptsDataProcessing"
              render={({ field }) => (
                <Checkbox
                  id="onboarding-dpa"
                  data-testid="onboarding-dpa"
                  className="mt-0.5"
                  checked={field.value}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(errors.acceptsDataProcessing)}
                  aria-describedby={
                    errors.acceptsDataProcessing ? 'onboarding-dpa-error' : undefined
                  }
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  onBlur={field.onBlur}
                />
              )}
            />
            <label htmlFor="onboarding-dpa" className="text-sm leading-relaxed">
              Accept, în numele organizației,{' '}
              <a
                className="underline"
                href="https://ssmusor.ro/prelucrare-date/"
                target="_blank"
                rel="noreferrer"
              >
                Acordul de prelucrare a datelor
              </a>
              .
            </label>
          </div>
          <FieldMessage id="onboarding-dpa-error" error={errors.acceptsDataProcessing} />
        </div>
        <div className="grid gap-2">
          <div className="flex items-start gap-3">
            <Controller
              control={form.control}
              name="acceptsTerms"
              render={({ field }) => (
                <Checkbox
                  id="onboarding-terms"
                  data-testid="onboarding-terms"
                  className="mt-0.5"
                  checked={field.value}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(errors.acceptsTerms)}
                  aria-describedby={errors.acceptsTerms ? 'onboarding-terms-error' : undefined}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  onBlur={field.onBlur}
                />
              )}
            />
            <label htmlFor="onboarding-terms" className="text-sm leading-relaxed">
              Accept{' '}
              <a
                className="underline"
                href="https://ssmusor.ro/termeni/"
                target="_blank"
                rel="noreferrer"
              >
                Termenii și condițiile
              </a>
              , inclusiv clauzele despre abonament, răspundere și încetare (punctele 8–10 și 12).
            </label>
          </div>
          <FieldMessage id="onboarding-terms-error" error={errors.acceptsTerms} />
        </div>
        {errors.root?.server && (
          <p
            data-testid="onboarding-error-message"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.root.server.message}
          </p>
        )}
        <PublicFrameAction
          data-testid="onboarding-submit"
          type="submit"
          variant={searched ? 'default' : 'outline'}
          disabled={busy}
        >
          {isSubmitting ? 'Se creează organizația…' : 'Creează organizația'}
        </PublicFrameAction>
      </form>
      <SignedInAs email={me.user.email} />
    </PublicFrame>
  );
}
