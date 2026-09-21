import { zodResolver } from '@hookform/resolvers/zod';
import { currentTermsVersion } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useMe } from '../account/use-me';
import {
  type ApiErrorResponse,
  getGetMeQueryKey,
  type InvitationLookupResponse,
  lookupInvitation,
  useAcceptInvitation,
  useJoinWithInvitation,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { useAuth } from '../auth/auth-context';
import { newPasswordHint } from '../auth/password-schema';
import { Field } from '../components/form-field';
import { Notice } from '../components/notice';
import { PasswordInput } from '../components/password-input';
import { PublicFrame } from '../components/public-frame';
import {
  createAccountSchema,
  type CreateAccountValues,
  joinSchema,
  type JoinValues,
} from '../invitations/accept-schema';
import { formatDay, roleLabels } from '../organization/labels';

// Public: the link in an invitation email lands here, signed in or not. Opening it
// changes nothing; only submitting a form accepts.
export const Route = createFileRoute('/accept-invitation')({
  staticData: { title: 'Acceptă invitația' },
  validateSearch: z.object({ token: z.string().optional() }),
  component: AcceptInvitationPage,
});

const closedMessages: Record<string, { title: string; text: string }> = {
  accepted: {
    title: 'Invitația a fost deja acceptată',
    text: 'Contul tău există. Autentifică-te ca să intri în organizație.',
  },
  revoked: {
    title: 'Invitația a fost revocată',
    text: 'Cere administratorului organizației să îți trimită una nouă.',
  },
  expired: {
    title: 'Invitația a expirat',
    text: 'Linkul a fost valabil 7 zile. Cere administratorului organizației să îți trimită o invitație nouă.',
  },
};

function acceptMessage(cause: unknown) {
  const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
  switch (body?.reason) {
    case 'invitation_accepted':
      return 'Invitația a fost deja acceptată. Autentifică-te ca să intri în organizație.';
    case 'invitation_revoked':
      return 'Invitația a fost revocată între timp. Cere una nouă administratorului.';
    case 'invitation_expired':
      return 'Invitația a expirat între timp. Cere una nouă administratorului.';
    case 'account_exists':
      return 'Există deja un cont cu această adresă. Reîncarcă pagina și autentifică-te ca să accepți.';
    case 'already_in_organization':
      return 'Contul tău face deja parte dintr-o organizație, iar un cont poate aparține uneia singure.';
    case 'email_mismatch':
      return 'Invitația a fost trimisă pe altă adresă decât cea a contului tău.';
  }
  if (cause instanceof ApiHttpError && cause.status === 404) {
    return 'Invitația nu mai există. Cere una nouă administratorului.';
  }
  return 'Nu am putut accepta invitația. Verifică conexiunea și încearcă din nou.';
}

const Frame = (props: { title: string; description?: ReactNode; children?: ReactNode }) => (
  <PublicFrame testId="accept-invitation-page" {...props} />
);

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Notice variant="destructive" data-testid="accept-error">
      {message}
    </Notice>
  );
}

function TermsNotice({ action }: { action: string }) {
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      Prin {action} accepți{' '}
      <a className="underline" href="https://ssmusor.ro/termeni/" target="_blank" rel="noreferrer">
        Termenii și condițiile
      </a>{' '}
      și confirmi că ai luat la cunoștință{' '}
      <a
        className="underline"
        href="https://ssmusor.ro/confidentialitate/"
        target="_blank"
        rel="noreferrer"
      >
        Politica de confidențialitate
      </a>
      .
    </p>
  );
}

export function AcceptInvitationPage() {
  const { token } = Route.useSearch();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const { auth, session } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const lookup = useQuery({
    queryKey: ['invitation-lookup', token],
    queryFn: ({ signal }) => lookupInvitation({ token: token! }, { ...apiRequest, signal }),
    enabled: Boolean(token && apiRequest.baseUrl),
    retry: false,
    staleTime: Infinity,
  });

  if (!token || (lookup.error instanceof ApiHttpError && lookup.error.status === 404)) {
    return (
      <Frame
        title="Link de invitație invalid"
        description="Linkul este incomplet sau a fost înlocuit de o invitație mai nouă. Deschide cel mai recent email primit sau cere o invitație nouă administratorului."
      />
    );
  }
  if (lookup.isError || !apiRequest.baseUrl) {
    return (
      <Frame
        title="Nu am putut încărca invitația"
        description="Verifică conexiunea și încearcă din nou."
      >
        <Button
          variant="outline"
          disabled={lookup.isFetching}
          onClick={() => void lookup.refetch()}
        >
          Încearcă din nou
        </Button>
      </Frame>
    );
  }
  if (lookup.isPending) {
    return (
      <Frame title="Se încarcă invitația…">
        <p role="status" className="sr-only">
          Se încarcă invitația…
        </p>
      </Frame>
    );
  }

  const invitation = lookup.data;
  const closed = closedMessages[invitation.status];
  if (closed) {
    return (
      <Frame title={closed.title} description={closed.text}>
        {invitation.status === 'accepted' && (
          <Button asChild data-testid="accept-go-login">
            <Link to={session ? '/dashboard' : '/login'}>
              {session ? 'Deschide aplicația' : 'Autentifică-te'}
            </Link>
          </Button>
        )}
      </Frame>
    );
  }

  const signedInAs = session?.user.email?.toLowerCase();
  if (signedInAs && signedInAs !== invitation.email) {
    return (
      <Frame
        title="Ești autentificat cu alt cont"
        description={
          <>
            Invitația este pentru <strong className="text-foreground">{invitation.email}</strong>,
            iar tu ești autentificat ca <strong className="text-foreground">{signedInAs}</strong>.
            Deconectează-te ca să continui cu adresa invitată.
          </>
        }
      >
        <Button
          data-testid="accept-sign-out"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            void auth.signOut().finally(() => setSigningOut(false));
          }}
        >
          {signingOut ? 'Se deconectează…' : 'Deconectează-te'}
        </Button>
      </Frame>
    );
  }

  const description = (
    <>
      {invitation.inviterName ? `${invitation.inviterName} te invită` : 'Ai fost invitat(ă)'} în
      organizația <strong className="text-foreground">{invitation.organizationName}</strong>, ca{' '}
      {roleLabels[invitation.role].toLowerCase()}. Invitația este valabilă până pe{' '}
      {formatDay(invitation.expiresAt)}.
    </>
  );

  if (signedInAs)
    return <JoinForm token={token} invitation={invitation} description={description} />;
  if (invitation.accountExists) {
    return (
      <Frame title={`Intră în ${invitation.organizationName}`} description={description}>
        <p data-testid="accept-has-account" className="text-sm leading-relaxed">
          Ai deja un cont SSM Ușor cu adresa <strong>{invitation.email}</strong>. Autentifică-te și
          te aducem înapoi aici ca să accepți invitația.
        </p>
        <Button asChild data-testid="accept-login">
          <Link to="/login" search={{ invitation: token }}>
            Autentifică-te ca să accepți
          </Link>
        </Button>
      </Frame>
    );
  }
  return <CreateAccountForm token={token} invitation={invitation} description={description} />;
}

interface AcceptFormProps {
  token: string;
  invitation: InvitationLookupResponse;
  description: ReactNode;
}

// The API creates the account already confirmed, because the token reached the invited
// mailbox, then we sign in with what was typed.
function CreateAccountForm({ token, invitation, description }: AcceptFormProps) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const { auth } = useAuth();
  const navigate = useNavigate();
  const accept = useAcceptInvitation({ request: apiRequest });
  const form = useForm<CreateAccountValues>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: { fullName: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ fullName, password }) => {
    try {
      await accept.mutateAsync({
        data: { token, fullName, password, termsVersion: currentTermsVersion },
      });
    } catch (cause) {
      const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
      if (body?.issues?.some((issue) => issue.path === 'password')) {
        form.setError('password', {
          message: 'Parola este prea slabă. Alege una mai greu de ghicit.',
        });
      } else {
        form.setError('root.server', { message: acceptMessage(cause) });
      }
      return;
    }
    try {
      await auth.signIn(invitation.email, password);
      await navigate({ to: '/dashboard', replace: true });
    } catch {
      // The account exists; only the automatic sign-in failed.
      await navigate({ to: '/login', replace: true });
    }
  });

  return (
    <Frame title={`Alătură-te echipei ${invitation.organizationName}`} description={description}>
      <form
        className="grid gap-5"
        aria-busy={isSubmitting}
        noValidate
        onSubmit={(event) => void onSubmit(event)}
      >
        <Field
          id="accept-email"
          label="Adresa de email"
          hint="Cu această adresă te vei autentifica."
        >
          <Input
            id="accept-email"
            data-testid="accept-email"
            className="h-11 bg-muted"
            value={invitation.email}
            readOnly
            autoComplete="username"
            aria-describedby="accept-email-hint"
          />
        </Field>
        <Field id="accept-full-name" label="Nume și prenume" error={errors.fullName}>
          <Input
            id="accept-full-name"
            data-testid="accept-full-name"
            className="h-11"
            autoComplete="name"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={errors.fullName ? 'accept-full-name-error' : undefined}
            {...form.register('fullName')}
          />
        </Field>
        <Field
          id="accept-password"
          label="Alege o parolă"
          hint={newPasswordHint}
          error={errors.password}
        >
          <PasswordInput
            id="accept-password"
            data-testid="accept-password"
            autoComplete="new-password"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'accept-password-error' : 'accept-password-hint'}
            {...form.register('password')}
          />
        </Field>
        <FormError message={errors.root?.server?.message} />
        <Button
          data-testid="accept-submit"
          className="h-11 w-full"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Se creează contul…' : 'Creează contul și acceptă'}
        </Button>
        <TermsNotice action="crearea contului" />
      </form>
    </Frame>
  );
}

function JoinForm({ token, invitation, description }: AcceptFormProps) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const me = useMe();
  const join = useJoinWithInvitation({ request: apiRequest });
  const needsName = me.isSuccess && !me.data.profile;
  const form = useForm<JoinValues>({
    resolver: needsName ? zodResolver(joinSchema) : undefined,
    defaultValues: { fullName: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ fullName }) => {
    try {
      await join.mutateAsync({
        data: {
          token,
          termsVersion: currentTermsVersion,
          ...(needsName ? { fullName } : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      await navigate({ to: '/organization/team', replace: true });
    } catch (cause) {
      form.setError('root.server', { message: acceptMessage(cause) });
    }
  });

  return (
    <Frame title={`Intră în ${invitation.organizationName}`} description={description}>
      <form
        className="grid gap-5"
        aria-busy={isSubmitting}
        noValidate
        onSubmit={(event) => void onSubmit(event)}
      >
        <p data-testid="accept-signed-in" className="text-sm leading-relaxed">
          Ești autentificat ca <strong>{invitation.email}</strong>.
        </p>
        {needsName && (
          <Field id="accept-full-name" label="Nume și prenume" error={errors.fullName}>
            <Input
              id="accept-full-name"
              data-testid="accept-full-name"
              className="h-11"
              autoComplete="name"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.fullName)}
              aria-describedby={errors.fullName ? 'accept-full-name-error' : undefined}
              {...form.register('fullName')}
            />
          </Field>
        )}
        <FormError message={errors.root?.server?.message} />
        <Button
          data-testid="accept-join"
          className="h-11 w-full"
          type="submit"
          disabled={isSubmitting || me.isPending}
        >
          {isSubmitting ? 'Se acceptă…' : 'Acceptă invitația'}
        </Button>
        <TermsNotice action="acceptarea invitației" />
      </form>
    </Frame>
  );
}
