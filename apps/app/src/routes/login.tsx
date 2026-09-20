import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader } from '@ssm-usor/ui/components/card';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';

import { useLoginForm } from '../auth/use-login-form';
import { CommitVersion } from '../components/commit-version';
import { Notice } from '../components/notice';

export const Route = createFileRoute('/login')({
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

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const { form, onSubmit } = useLoginForm(Route.useSearch().invitation);
  const { errors, isSubmitting } = form.formState;

  return (
    <main
      data-testid="login-page"
      className="flex min-h-svh items-center justify-center bg-[color-mix(in_srgb,var(--brand-forest)_10%,var(--muted))] px-5 py-10 sm:px-8"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-7">
        <img
          src="/brand/logo.png"
          alt="SSM Ușor"
          width={2172}
          height={724}
          className="h-auto w-48"
        />
        <Card className="w-full gap-7 py-8">
          <CardHeader className="gap-2 text-center sm:px-8">
            <h1 className="text-2xl font-semibold tracking-tight">Bine ai revenit</h1>
            <CardDescription className="leading-relaxed">
              Intră în spațiul tău de lucru SSM.
            </CardDescription>
          </CardHeader>
          <CardContent className="sm:px-8">
            <form
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
                <div className="relative col-span-2 row-start-2">
                  <Input
                    id="password"
                    data-testid="login-password"
                    className="h-11 pr-12"
                    {...form.register('password')}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? 'password-error' : undefined}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-0 right-0 size-11 text-muted-foreground hover:bg-transparent hover:text-foreground"
                    aria-label={showPassword ? 'Ascunde parola' : 'Arată parola'}
                    aria-controls="password"
                    disabled={isSubmitting}
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  </Button>
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
              {errors.root?.auth && (
                <Notice variant="destructive" id="login-error" data-testid="login-auth-error">
                  {errors.root.auth.message}
                </Notice>
              )}
              <Button
                data-testid="login-submit"
                className="mt-1 h-11 w-full"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Se verifică…' : 'Autentificare'}
              </Button>
            </form>
          </CardContent>
        </Card>
        {import.meta.env.VITE_REGISTRATION_LINK === 'true' && (
          <p className="text-sm text-muted-foreground">
            Nu ai cont?{' '}
            <Link
              to="/register"
              data-testid="login-register"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Creează unul
            </Link>
          </p>
        )}
        <footer className="grid w-full justify-items-center gap-2 text-center">
          <nav aria-label="Linkuri utile" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <a
              href="https://ssmusor.ro"
              className="inline-flex min-h-11 items-center rounded-sm text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              Află mai multe despre SSM Ușor
            </a>
          </nav>
          <CommitVersion />
        </footer>
      </div>
    </main>
  );
}
