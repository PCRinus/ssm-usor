import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import { Input } from '@ssm-usor/ui/components/input';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { PasswordInput } from '@/components/password-input';
import { useRevealErrors } from '@/components/use-reveal-errors';
import { useAuth } from '@/features/auth/auth-context';
import { newPasswordErrorMessage } from '@/features/auth/auth-errors';
import { hasSecondFactor, SecondFactorError } from '@/features/auth/auth-store';
import { useCaptcha } from '@/features/auth/captcha';
import {
  changePasswordSchema,
  type ChangePasswordValues,
  changePasswordWithCodeSchema,
  newPasswordHint,
} from '@/features/auth/password-schema';

const codeOf = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error ? error.code : null;

// Asks for the current password first, so an unlocked screen is not enough to take over
// the account.
export function ChangePasswordCard({ email }: { email: string }) {
  const { auth, session } = useAuth();
  const { ref: captchaRef, withToken } = useCaptcha();
  // An account made with Google has no password, so it cannot pass the check below; the reset
  // email sets a first one. Supabase does not say whether one was set since, so the offer stays.
  const madeWithGoogle = !(session?.user.app_metadata.providers ?? ['email']).includes('email');
  const withCode = hasSecondFactor(session);
  const navigate = useNavigate();
  const currentHref = useLocation({ select: (location) => location.href });
  const [linkState, setLinkState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(withCode ? changePasswordWithCodeSchema : changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', code: '' },
  });
  const formRef = useRevealErrors(form);
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ currentPassword, newPassword, code }) => {
    try {
      await withToken((token) =>
        auth.changePassword(email, currentPassword, newPassword, token, withCode ? code : undefined)
      );
      form.reset();
      toast.success('Parola a fost schimbată.');
    } catch (cause) {
      if (cause instanceof SecondFactorError) {
        // Checking the password signed in again without the second factor, in every tab: the
        // code page restores it before anything else runs on a weaker session.
        toast.error('Parola nu a fost schimbată. Introdu codul ca să continui.');
        await navigate({
          to: '/verificare-cod',
          search: { redirect: currentHref },
          state: { codeFailure: cause.result },
          replace: true,
        });
      } else if (codeOf(cause) === 'invalid_credentials') {
        form.setError('currentPassword', { message: 'Parola curentă nu este corectă.' });
      } else {
        form.setError('newPassword', { message: newPasswordErrorMessage(cause) });
      }
    }
  });

  async function sendSetPasswordLink() {
    setLinkState('sending');
    try {
      await withToken((token) => auth.requestPasswordReset(email, token));
      setLinkState('sent');
    } catch {
      setLinkState('idle');
      toast.error('Nu am putut trimite linkul. Încearcă din nou.');
    }
  }

  return (
    <Card data-testid="change-password-card">
      <CardHeader>
        <h2 className="text-lg font-semibold">Parolă</h2>
      </CardHeader>
      <CardContent className="grid gap-5">
        {madeWithGoogle && (
          <Notice variant="info" data-testid="set-password-notice">
            <p>
              Te-ai înregistrat cu Google. Dacă nu ți-ai setat încă o parolă, îți trimitem un link
              pe email pentru a o seta și te vei putea autentifica și cu parola.
            </p>
            {linkState === 'sent' ? (
              <p className="mt-2 font-medium" data-testid="set-password-sent">
                Ți-am trimis linkul la {email}. Este valabil o oră.
              </p>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="mt-3"
                data-testid="set-password-send"
                disabled={linkState === 'sending'}
                onClick={() => void sendSetPasswordLink()}
              >
                {linkState === 'sending' ? 'Se trimite…' : 'Trimite linkul'}
              </Button>
            )}
          </Notice>
        )}
        <form
          ref={formRef}
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
          {withCode && (
            <Field
              id="change-password-code"
              label="Cod din aplicația de autentificare"
              error={errors.code}
            >
              <Input
                id="change-password-code"
                data-testid="change-password-code"
                className="font-mono tracking-[0.3em] tabular-nums"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                disabled={isSubmitting}
                aria-invalid={Boolean(errors.code)}
                aria-describedby={errors.code ? 'change-password-code-error' : undefined}
                {...form.register('code', {
                  setValueAs: (value: string) => value.replace(/\D/g, ''),
                })}
              />
            </Field>
          )}
          <div ref={captchaRef} />
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
