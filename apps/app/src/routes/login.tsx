import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { z } from 'zod';

import { PublicFrame, PublicFrameAction, PublicFrameLink } from '@/app/public-frame';
import { Notice } from '@/components/notice';
import { PasswordInput } from '@/components/password-input';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { GoogleSignIn } from '@/features/auth/google-sign-in';
import { useLoginForm } from '@/features/auth/use-login-form';

export const Route = createFileRoute('/login')({
  staticData: { title: 'Autentificare' },
  // Set by the accept page for someone who must sign in first; login returns them to it.
  // Only that token travels here, never a URL, so this cannot redirect anywhere else.
  validateSearch: z.object({ invitation: z.string().optional() }),
  beforeLoad: async ({ context: { auth }, search }) => {
    await auth.ready;
    if (!auth.getSnapshot().session) return;
    throw search.invitation
      ? redirect({ to: '/accept-invitation', search: { token: search.invitation }, replace: true })
      : redirect({ to: '/dashboard', replace: true });
  },
  component: LoginPage,
});

function LoginPage() {
  const { invitation } = Route.useSearch();
  const { form, onSubmit, captchaRef } = useLoginForm(invitation);
  const formRef = useRevealErrors(form);
  const { errors, isSubmitting } = form.formState;

  return (
    <PublicFrame
      testId="login-page"
      title="Bine ai revenit"
      description="Intră în spațiul tău de lucru SSM."
      footerLinks={
        <nav aria-label="Linkuri utile" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          <a
            href="https://ssmusor.ro"
            className="inline-flex min-h-11 items-center rounded-sm text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            Află mai multe despre SSM Ușor
          </a>
        </nav>
      }
    >
      {/* Google makes an account for anyone without one, so on this page it is a public
          signup and follows the registration link's flag (ADR 027). */}
      {import.meta.env.VITE_REGISTRATION_LINK === 'true' && (
        <GoogleSignIn origin={{ from: '/login', invitation }} />
      )}
      <form
        ref={formRef}
        className="grid gap-5"
        aria-busy={isSubmitting}
        aria-describedby={errors.root?.auth ? 'login-error' : undefined}
        noValidate
        onSubmit={onSubmit}
      >
        <div className="grid gap-2">
          <Label htmlFor="email">Adresă de email</Label>
          <Input
            id="email"
            data-testid="login-email"
            className="h-11"
            {...form.register('email')}
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            placeholder="nume@companie.ro"
            required
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
          />
          {errors.email && (
            <p
              id="email-error"
              data-testid="login-email-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {errors.email.message}
            </p>
          )}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2">
          <Label htmlFor="password" className="col-start-1 row-start-1 self-baseline">
            Parolă
          </Label>
          <div className="col-span-2 row-start-2">
            <PasswordInput
              id="password"
              data-testid="login-password"
              {...form.register('password')}
              autoComplete="current-password"
              required
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'password-error' : undefined}
            />
          </div>
          <Link
            to="/forgot-password"
            data-testid="login-forgot-password"
            className="col-start-2 row-start-1 self-baseline text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Ai uitat parola?
          </Link>
          {errors.password && (
            <p
              id="password-error"
              data-testid="login-password-error"
              role="alert"
              className="col-span-2 text-sm text-destructive"
            >
              {errors.password.message}
            </p>
          )}
        </div>
        <div ref={captchaRef} />
        {errors.root?.auth && (
          <Notice variant="destructive" id="login-error" data-testid="login-auth-error">
            {errors.root.auth.message}
          </Notice>
        )}
        <PublicFrameAction data-testid="login-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Se verifică…' : 'Autentificare'}
        </PublicFrameAction>
        {import.meta.env.VITE_REGISTRATION_LINK === 'true' && (
          <PublicFrameLink to="/register" data-testid="login-register">
            Nu ai cont? Creează unul
          </PublicFrameLink>
        )}
      </form>
    </PublicFrame>
  );
}
