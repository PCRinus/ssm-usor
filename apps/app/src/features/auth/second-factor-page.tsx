import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@ssm-usor/ui/components/input';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { PublicFrame, PublicFrameAction } from '@/app/public-frame';
import { Field } from '@/components/form-field';
import { useRevealErrors } from '@/components/use-reveal-errors';

import { useAuth } from './auth-context';
import { codeFailureMessages, codeSchema, type CodeValues } from './second-factor';

export function SecondFactorPage({ continueTo }: { continueTo: string }) {
  const { auth } = useAuth();
  const navigate = useNavigate();
  const form = useForm<CodeValues>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
  });
  const formRef = useRevealErrors(form);
  const { errors, isSubmitting } = form.formState;
  const failedElsewhere = useRouterState({ select: (state) => state.location.state.codeFailure });
  const { setError } = form;
  useEffect(() => {
    if (failedElsewhere) setError('code', { message: codeFailureMessages[failedElsewhere] });
  }, [failedElsewhere, setError]);

  const onSubmit = form.handleSubmit(async ({ code }) => {
    const result = await auth.verifySecondFactor(code);
    if (result !== 'verified') {
      form.reset({ code: '' });
      form.setError('code', { message: codeFailureMessages[result] }, { shouldFocus: true });
      return;
    }
    await navigate({ href: continueTo, replace: true });
  });

  async function signInWithAnotherAccount() {
    await auth.signOut().catch(() => undefined);
    await navigate({ to: '/autentificare', replace: true });
  }

  return (
    <PublicFrame
      testId="second-factor-page"
      title="Introdu codul"
      description="Contul tău cere și un cod la autentificare. Deschide aplicația de autentificare și introdu codul pe care îl arată pentru SSM Ușor."
    >
      <form
        ref={formRef}
        className="grid gap-5"
        aria-busy={isSubmitting}
        noValidate
        onSubmit={(event) => void onSubmit(event)}
      >
        <Field
          id="second-factor-code"
          label="Cod din aplicația de autentificare"
          error={errors.code}
        >
          <Input
            id="second-factor-code"
            data-testid="second-factor-code"
            className="h-12 text-center font-mono text-xl tracking-[0.4em] tabular-nums"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            disabled={isSubmitting}
            aria-invalid={Boolean(errors.code)}
            aria-describedby={errors.code ? 'second-factor-code-error' : undefined}
            {...form.register('code', {
              setValueAs: (value: string) => value.replace(/\D/g, ''),
            })}
          />
        </Field>
        <PublicFrameAction data-testid="second-factor-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Se verifică…' : 'Continuă'}
        </PublicFrameAction>
        <button
          type="button"
          data-testid="second-factor-other-account"
          className="justify-self-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          onClick={() => void signInWithAnotherAccount()}
        >
          Intră cu alt cont
        </button>
      </form>
    </PublicFrame>
  );
}
