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
import {
  type CompanyLookup,
  onboardingSchema,
  type OnboardingValues,
  toOnboardingCompanyDetails,
} from './onboarding-schema';

export function OnboardingPage() {
  const me = useMe();

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
  if (me.data.membership) return <Navigate to="/dashboard" replace />;

  return <OnboardingForm me={me.data} />;
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

function OnboardingForm({ me }: { me: MeResponse }) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const { auth, session } = useAuth();
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
      acceptsTerms: false,
      acceptsSpecialClauses: false,
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
            onClick: () => void navigate({ to: '/organization/company' }),
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
    await navigate({ to: '/dashboard', replace: true });
  });

  async function signOut() {
    await auth.signOut().catch(() => undefined);
    await navigate({ to: '/login', replace: true });
  }

  const pending = invitations.data?.items ?? [];

  return (
    <PublicFrame
      testId="onboarding-page"
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
          id="onboarding-full-name"
          label="Nume și prenume"
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
            aria-describedby={errors.fullName ? 'onboarding-full-name-error' : undefined}
            {...form.register('fullName')}
          />
        </Field>
        <Field
          id="onboarding-cui"
          label="CUI"
          mark="optional"
          hint="Caută-l la ANAF ca să preiei denumirea, sediul și numărul de înregistrare ale firmei."
          error={errors.cui}
        >
          <div className="flex flex-wrap gap-2">
            <Input
              id="onboarding-cui"
              data-testid="onboarding-cui"
              className="h-11 max-w-56"
              inputMode="numeric"
              autoComplete="off"
              disabled={busy}
              aria-invalid={Boolean(errors.cui)}
              aria-describedby={errors.cui ? 'onboarding-cui-error' : 'onboarding-cui-hint'}
              {...form.register('cui', { onChange: () => setLookup({ status: 'idle' }) })}
            />
            <AnafLookupButton
              testId="onboarding-lookup"
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
            Date preluate de la ANAF pentru {lookup.company.legalName}.{' '}
            {lookup.company.inactive
              ? 'Atenție: compania figurează ca inactivă.'
              : 'Le găsești apoi în Organizație → Date firmă.'}
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
          hint="Așa cum vrei să apară pentru echipa ta, de exemplu denumirea firmei."
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
              Accept, în numele organizației,{' '}
              <a
                className="underline"
                href="https://ssmusor.ro/termeni/"
                target="_blank"
                rel="noreferrer"
              >
                Termenii și condițiile
              </a>{' '}
              și{' '}
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
          <FieldMessage id="onboarding-terms-error" error={errors.acceptsTerms} />
        </div>
        <div className="grid gap-2">
          <div className="flex items-start gap-3">
            <Controller
              control={form.control}
              name="acceptsSpecialClauses"
              render={({ field }) => (
                <Checkbox
                  id="onboarding-clauses"
                  data-testid="onboarding-clauses"
                  className="mt-0.5"
                  checked={field.value}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(errors.acceptsSpecialClauses)}
                  aria-describedby={
                    errors.acceptsSpecialClauses ? 'onboarding-clauses-error' : undefined
                  }
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                  onBlur={field.onBlur}
                />
              )}
            />
            <label htmlFor="onboarding-clauses" className="text-sm leading-relaxed">
              Accept în mod expres clauzele de la punctele 8, 9, 10 și 12 din{' '}
              <a
                className="underline"
                href="https://ssmusor.ro/termeni/"
                target="_blank"
                rel="noreferrer"
              >
                Termeni
              </a>
              : reînnoirea automată a abonamentului, modificarea prețurilor cu notificare,
              nerestituirea sumelor plătite, trecerea contului în modul doar citire, încetarea și
              ștergerea datelor, limitarea răspunderii, legea aplicabilă și instanța competentă.
            </label>
          </div>
          <FieldMessage id="onboarding-clauses-error" error={errors.acceptsSpecialClauses} />
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
        <PublicFrameAction data-testid="onboarding-submit" type="submit" disabled={busy}>
          {isSubmitting ? 'Se creează organizația…' : 'Creează organizația'}
        </PublicFrameAction>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        Autentificat ca {me.user.email}.{' '}
        <button
          type="button"
          data-testid="onboarding-sign-out"
          className="underline underline-offset-4 hover:text-foreground"
          onClick={() => void signOut()}
        >
          Deconectează-te
        </button>
      </p>
    </PublicFrame>
  );
}
