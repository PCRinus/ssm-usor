import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@ssm-usor/ui/components/button';
import { toast } from '@ssm-usor/ui/lib/toast';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useAuth } from '../auth/auth-context';
import { isSpentRecoveryLink, newPasswordErrorMessage } from '../auth/auth-errors';
import {
  newPasswordHint,
  resetPasswordSchema,
  type ResetPasswordValues,
} from '../auth/password-schema';
import { Field } from '../components/form-field';
import { Notice } from '../components/notice';
import { PasswordInput } from '../components/password-input';
import { PublicFrame } from '../components/public-frame';

// Public: the link in a password reset email lands here. Opening it does nothing; the
// token is used only when a new password is submitted, because mail scanners open links.
export const Route = createFileRoute('/reset-password')({
  validateSearch: z.object({ token_hash: z.string().optional() }),
  component: ResetPasswordPage,
});

function SpentLink() {
  return (
    <PublicFrame
      testId="reset-password-invalid"
      title="Linkul nu mai este valabil"
      description="Linkul de resetare a expirat, a fost deja folosit sau a fost înlocuit de unul mai nou. Cere un link nou și folosește-l în cel mult o oră."
    >
      <Button asChild data-testid="reset-request-new">
        <Link to="/forgot-password">Cere un link nou</Link>
      </Button>
    </PublicFrame>
  );
}

export function ResetPasswordPage() {
  const { token_hash: tokenHash } = Route.useSearch();
  const { auth } = useAuth();
  const navigate = useNavigate();
  // The token works once. After it is verified, a rejected password is retried without it.
  const [verified, setVerified] = useState(false);
  const [spent, setSpent] = useState(false);
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    if (!verified) {
      try {
        await auth.verifyRecovery(tokenHash!);
        setVerified(true);
      } catch (cause) {
        if (isSpentRecoveryLink(cause)) setSpent(true);
        else form.setError('root.auth', { message: newPasswordErrorMessage(cause) });
        return;
      }
    }
    try {
      await auth.updatePassword(password, { acceptCurrent: true });
    } catch (cause) {
      form.setError('password', { message: newPasswordErrorMessage(cause) });
      return;
    }
    toast.success('Parola a fost schimbată.');
    await navigate({ to: '/dashboard', replace: true });
  });

  if (!tokenHash || spent) return <SpentLink />;

  return (
    <PublicFrame
      testId="reset-password-page"
      title="Alege o parolă nouă"
      description="După salvare intri direct în aplicație, iar celelalte dispozitive sunt deconectate."
    >
      <form
        className="grid gap-5"
        aria-busy={isSubmitting}
        noValidate
        onSubmit={(event) => void onSubmit(event)}
      >
        <Field
          id="reset-password"
          label="Parolă nouă"
          hint={newPasswordHint}
          error={errors.password}
        >
          <PasswordInput
            id="reset-password"
            data-testid="reset-password"
            autoComplete="new-password"
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'reset-password-error' : 'reset-password-hint'}
            {...form.register('password')}
          />
        </Field>
        {errors.root?.auth && (
          <Notice variant="destructive" data-testid="reset-error">
            {errors.root.auth.message}
          </Notice>
        )}
        <Button
          data-testid="reset-submit"
          className="h-11 w-full"
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Se salvează…' : 'Salvează parola'}
        </Button>
      </form>
    </PublicFrame>
  );
}
