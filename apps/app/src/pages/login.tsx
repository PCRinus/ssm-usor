import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader } from '@ssm-usor/ui/components/card';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';

import { useLoginForm } from '../auth/use-login-form';

export function LoginPage() {
  const {
    register,
    onSubmit,
    formState: { errors, isSubmitting },
  } = useLoginForm();

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg flex-col justify-center gap-6 px-5 py-12">
      <p className="text-sm font-semibold tracking-widest uppercase">SSM Ușor</p>
      <Card>
        <CardHeader>
          <h1 className="text-3xl font-semibold tracking-tight">Bine ai revenit</h1>
          <CardDescription className="leading-relaxed">
            Intră în spațiul tău de lucru SSM.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                {...register('email')}
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
                <p id="email-error" role="alert" className="text-sm text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Parolă</Label>
              <Input
                id="password"
                {...register('password')}
                type="password"
                autoComplete="current-password"
                required
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'password-error' : undefined}
              />
              {errors.password && (
                <p id="password-error" role="alert" className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
            {errors.root?.auth && (
              <p id="login-error" role="alert" className="text-sm text-destructive">
                {errors.root.auth.message}
              </p>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Se verifică…' : 'Autentificare'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        Creat în România · Pentru servicii externe SSM
      </p>
    </main>
  );
}
