import { zodResolver } from '@hookform/resolvers/zod';
import { currentTermsVersion } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Input } from '@ssm-usor/ui/components/input';
import {
  createFileRoute,
  Navigate,
  redirect,
  useNavigate,
  useRouteContext,
} from '@tanstack/react-router';
import { Controller, useForm } from 'react-hook-form';

import { useMe } from '../account/use-me';
import {
  type ApiErrorResponse,
  getGetMeQueryKey,
  getListMyInvitationsQueryKey,
  type MeResponse,
  useCreateOrganization,
  useListMyInvitations,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { useAuth } from '../auth/auth-context';
import { Field, FieldMessage } from '../components/form-field';
import { PublicFrame } from '../components/public-frame';
import { onboardingSchema, type OnboardingValues } from '../onboarding/onboarding-schema';
import { roleLabels } from '../organization/labels';

// Where a signed-in account without an organization lands (ADR 004): after registering,
// after being removed from one, or before accepting an invitation. It sits outside the app
// shell, whose pages all need an organization.
export const Route = createFileRoute('/onboarding')({
  beforeLoad: async ({ context: { auth } }) => {
    await auth.ready;
    if (!auth.getSnapshot().session) throw redirect({ to: '/login', replace: true });
  },
  component: OnboardingPage,
});

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
        <Button variant="outline" disabled={me.isFetching} onClick={() => void me.refetch()}>
          Încearcă din nou
        </Button>
      </PublicFrame>
    );
  }
  if (me.data.membership) return <Navigate to="/dashboard" replace />;

  return <OnboardingForm me={me.data} />;
}

function OnboardingForm({ me }: { me: MeResponse }) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const { auth } = useAuth();
  const navigate = useNavigate();
  const create = useCreateOrganization({ request: apiRequest });
  const invitations = useListMyInvitations({
    request: apiRequest,
    query: { queryKey: [...getListMyInvitationsQueryKey(), me.user.id] },
  });
  const form = useForm<OnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      fullName: me.profile?.fullName ?? '',
      organizationName: '',
      acceptsTerms: false,
    },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ fullName, organizationName }) => {
    try {
      await create.mutateAsync({
        data: { fullName, organizationName, termsVersion: currentTermsVersion },
      });
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
      description="Organizația este serviciul tău extern de prevenire și protecție. Aici vei gestiona clienții, angajații lor și echipa ta."
    >
      {pending.length > 0 && (
        <div
          data-testid="onboarding-invitations"
          role="status"
          className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm leading-relaxed"
        >
          <p className="font-medium">Ai o invitație în așteptare</p>
          <ul className="mt-2 grid gap-1">
            {pending.map((invitation) => (
              <li key={`${invitation.organizationName}-${invitation.expiresAt}`}>
                <strong>{invitation.organizationName}</strong>
                {invitation.inviterName && `, de la ${invitation.inviterName}`}, ca{' '}
                {roleLabels[invitation.role].toLowerCase()}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-muted-foreground">
            Ca să intri în acea organizație, folosește linkul din emailul de invitație sau cere să
            îți fie retrimis. Un cont poate aparține unei singure organizații, deci nu crea una nouă
            dacă vrei să o accepți.
          </p>
        </div>
      )}
      <form
        className="grid gap-5"
        aria-busy={isSubmitting}
        noValidate
        onSubmit={(event) => void onSubmit(event)}
      >
        <Field id="onboarding-full-name" label="Numele tău" error={errors.fullName}>
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
          id="onboarding-organization"
          label="Numele organizației"
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
        {errors.root?.server && (
          <p
            data-testid="onboarding-error-message"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.root.server.message}
          </p>
        )}
        <Button
          data-testid="onboarding-submit"
          className="h-11 w-full"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Se creează organizația…' : 'Creează organizația'}
        </Button>
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
