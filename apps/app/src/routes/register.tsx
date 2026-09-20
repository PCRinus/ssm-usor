import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { useAuth } from '../auth/auth-context';
import { registerErrorMessage } from '../auth/auth-errors';
import { newPasswordHint, registerSchema, type RegisterValues } from '../auth/password-schema';
import { Field } from '../components/form-field';
import { Notice } from '../components/notice';
import { PasswordInput } from '../components/password-input';
import { PasswordStrengthIndicator } from '../components/password-strength-indicator';
import { PublicFrame } from '../components/public-frame';

// Registration is Supabase's own signup (ADR 004). The page creates an identity only; the
// organization comes with onboarding, after the email is confirmed.
export const Route = createFileRoute('/register')({
  beforeLoad: async ({ context: { auth } }) => {
    await auth.ready;
    if (auth.getSnapshot().session) throw redirect({ to: '/dashboard', replace: true });
  },
  component: RegisterPage,
});

export function RegisterPage() {
  const { auth } = useAuth();
  const navigate = useNavigate();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const password = useWatch({ control: form.control, name: 'password' });
  const email = useWatch({ control: form.control, name: 'email' });

  const onSubmit = form.handleSubmit(async ({ email, password }) => {
    try {
      await auth.signUp(email, password);
    } catch (cause) {
      form.setError('root.auth', { message: registerErrorMessage(cause) });
      return;
    }
    // Where confirmations are off, signing up signs in; go straight to onboarding.
    if (auth.getSnapshot().session) await navigate({ to: '/onboarding', replace: true });
    else setSentTo(email);
  });

  if (sentTo) {
    // The same words whether or not the address already had an account.
    return (
      <PublicFrame
        testId="register-sent"
        title="Verifică-ți emailul"
        description={
          <>
            Am trimis la <strong className="text-foreground">{sentTo}</strong> un link de
            confirmare, valabil o oră. După confirmare îți configurezi organizația.
          </>
        }
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          Nu a ajuns? Verifică folderul Spam. Dacă ai deja un cont cu această adresă, nu primești un
          email nou: autentifică-te sau resetează parola.
        </p>
        <Button asChild variant="outline">
          <Link to="/login">Mergi la autentificare</Link>
        </Button>
      </PublicFrame>
    );
  }

  return (
    <PublicFrame
      testId="register-page"
      title="Creează cont"
      description="Pentru servicii externe de prevenire și protecție. După confirmarea adresei de email îți configurezi organizația."
    >
      <form
        className="grid gap-5"
        aria-busy={isSubmitting}
        noValidate
        onSubmit={(event) => void onSubmit(event)}
      >
        <Field id="register-email" label="Adresă de email" error={errors.email}>
          <Input
            id="register-email"
            data-testid="register-email"
            className="h-11"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            placeholder="nume@companie.ro"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'register-email-error' : undefined}
            {...form.register('email')}
          />
        </Field>
        <Field id="register-password" label="Parolă" hint={newPasswordHint} error={errors.password}>
          <PasswordInput
            id="register-password"
            data-testid="register-password"
            autoComplete="new-password"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={`${errors.password ? 'register-password-error' : 'register-password-hint'} register-password-strength`}
            {...form.register('password')}
          />
          <PasswordStrengthIndicator
            id="register-password-strength"
            password={password}
            email={email}
          />
        </Field>
        {errors.root?.auth && (
          <Notice variant="destructive" data-testid="register-error">
            {errors.root.auth.message}
          </Notice>
        )}
        <Button
          data-testid="register-submit"
          className="h-11 w-full"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Se creează contul…' : 'Creează cont'}
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Datele contului sunt prelucrate conform{' '}
          <a
            className="underline"
            href="https://ssmusor.ro/confidentialitate/"
            target="_blank"
            rel="noreferrer"
          >
            Politicii de confidențialitate
          </a>
          . Termenii îi accepți la pasul următor, când creezi organizația.
        </p>
        <Link
          to="/login"
          className="text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Ai deja cont? Autentifică-te
        </Link>
      </form>
    </PublicFrame>
  );
}
