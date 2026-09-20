import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { useAuth } from '../auth/auth-context';
import { forgotPasswordErrorMessage } from '../auth/auth-errors';
import { forgotPasswordSchema, type ForgotPasswordValues } from '../auth/password-schema';
import { Field } from '../components/form-field';
import { Notice } from '../components/notice';
import { PublicFrame } from '../components/public-frame';

export const Route = createFileRoute('/forgot-password')({
  // Someone signed in changes their password from their profile.
  beforeLoad: async ({ context: { auth } }) => {
    await auth.ready;
    if (auth.getSnapshot().session) throw redirect({ to: '/profile', replace: true });
  },
  component: ForgotPasswordPage,
});

export function ForgotPasswordPage() {
  const { auth } = useAuth();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ email }) => {
    try {
      await auth.requestPasswordReset(email);
      setSentTo(email);
    } catch (cause) {
      form.setError('root.auth', { message: forgotPasswordErrorMessage(cause) });
    }
  });

  if (sentTo) {
    // The same words whether or not the address has an account, so the page cannot be
    // used to find out who does.
    return (
      <PublicFrame
        testId="forgot-password-sent"
        title="Verifică-ți emailul"
        description={
          <>
            Dacă există un cont cu adresa <strong className="text-foreground">{sentTo}</strong>, am
            trimis acolo un link pentru alegerea unei parole noi. Linkul este valabil o oră.
          </>
        }
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          Nu a ajuns? Verifică folderul Spam sau încearcă din nou peste un minut.
        </p>
        <Button asChild variant="outline">
          <Link to="/login">Înapoi la autentificare</Link>
        </Button>
      </PublicFrame>
    );
  }

  return (
    <PublicFrame
      testId="forgot-password-page"
      title="Ai uitat parola?"
      description="Scrie adresa de email a contului și îți trimitem un link pentru alegerea unei parole noi."
    >
      <form
        className="grid gap-5"
        aria-busy={isSubmitting}
        noValidate
        onSubmit={(event) => void onSubmit(event)}
      >
        <Field id="forgot-email" label="Adresă de email" error={errors.email}>
          <Input
            id="forgot-email"
            data-testid="forgot-email"
            className="h-11"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            placeholder="nume@companie.ro"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'forgot-email-error' : undefined}
            {...form.register('email')}
          />
        </Field>
        {errors.root?.auth && (
          <Notice variant="destructive" data-testid="forgot-error">
            {errors.root.auth.message}
          </Notice>
        )}
        <Button
          data-testid="forgot-submit"
          className="h-11 w-full"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Se trimite…' : 'Trimite linkul de resetare'}
        </Button>
        <Link
          to="/login"
          className="text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Înapoi la autentificare
        </Link>
      </form>
    </PublicFrame>
  );
}
