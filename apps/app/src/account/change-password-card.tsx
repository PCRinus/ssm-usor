import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useForm } from 'react-hook-form';

import { useAuth } from '../auth/auth-context';
import { newPasswordErrorMessage } from '../auth/auth-errors';
import {
  changePasswordSchema,
  type ChangePasswordValues,
  newPasswordHint,
} from '../auth/password-schema';
import { Field } from '../components/form-field';
import { PasswordInput } from '../components/password-input';

const codeOf = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error ? error.code : null;

// Asks for the current password first, so an unlocked screen is not enough to take over
// the account.
export function ChangePasswordCard({ email }: { email: string }) {
  const { auth } = useAuth();
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      await auth.changePassword(email, currentPassword, newPassword);
      form.reset();
      toast.success('Parola a fost schimbată.');
    } catch (cause) {
      if (codeOf(cause) === 'invalid_credentials') {
        form.setError('currentPassword', { message: 'Parola curentă nu este corectă.' });
      } else {
        form.setError('newPassword', { message: newPasswordErrorMessage(cause) });
      }
    }
  });

  return (
    <Card data-testid="change-password-card">
      <CardHeader>
        <h2 className="text-lg font-semibold">Parolă</h2>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => void onSubmit(event)}
          aria-busy={isSubmitting}
          noValidate
          className="grid gap-5"
        >
          {/* Lets a password manager tie the new password to the right account. */}
          <input type="text" autoComplete="username" value={email} readOnly hidden />
          <Field id="current-password" label="Parola curentă" error={errors.currentPassword}>
            <PasswordInput
              id="current-password"
              data-testid="current-password"
              autoComplete="current-password"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.currentPassword)}
              aria-describedby={errors.currentPassword ? 'current-password-error' : undefined}
              {...form.register('currentPassword')}
            />
          </Field>
          <Field
            id="new-password"
            label="Parola nouă"
            hint={`${newPasswordHint} Celelalte dispozitive vor fi deconectate.`}
            error={errors.newPassword}
          >
            <PasswordInput
              id="new-password"
              data-testid="new-password"
              autoComplete="new-password"
              disabled={isSubmitting}
              aria-invalid={Boolean(errors.newPassword)}
              aria-describedby={errors.newPassword ? 'new-password-error' : 'new-password-hint'}
              {...form.register('newPassword')}
            />
          </Field>
          <div>
            <Button type="submit" data-testid="change-password-save" disabled={isSubmitting}>
              {isSubmitting ? 'Se schimbă…' : 'Schimbă parola'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
