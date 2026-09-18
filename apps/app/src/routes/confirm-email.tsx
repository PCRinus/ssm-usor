import { Button } from '@ssm-usor/ui/components/button';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';

import { useAuth } from '../auth/auth-context';
import { isSpentRecoveryLink } from '../auth/auth-errors';
import { PublicFrame } from '../components/public-frame';

// Public: the link in a signup confirmation email lands here. Opening it does nothing; the
// token is used when the button is pressed, because mail scanners open links.
export const Route = createFileRoute('/confirm-email')({
  validateSearch: z.object({ token_hash: z.string().optional() }),
  component: ConfirmEmailPage,
});

export function ConfirmEmailPage() {
  const { token_hash: tokenHash } = Route.useSearch();
  const { auth } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<'idle' | 'confirming' | 'spent' | 'failed'>('idle');

  async function confirm() {
    setState('confirming');
    try {
      await auth.confirmEmail(tokenHash!);
      await navigate({ to: '/onboarding', replace: true });
    } catch (cause) {
      setState(isSpentRecoveryLink(cause) ? 'spent' : 'failed');
    }
  }

  if (!tokenHash || state === 'spent') {
    return (
      <PublicFrame
        testId="confirm-email-invalid"
        title="Linkul nu mai este valabil"
        description="Linkul de confirmare a expirat sau a fost deja folosit. Dacă ți-ai confirmat deja adresa, autentifică-te. Altfel, creează contul din nou ca să primești un link nou."
      >
        <Button asChild data-testid="confirm-go-login">
          <Link to="/login">Autentifică-te</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/register">Creează cont</Link>
        </Button>
      </PublicFrame>
    );
  }

  return (
    <PublicFrame
      testId="confirm-email-page"
      title="Confirmă adresa de email"
      description="Un clic și contul tău este gata. Urmează configurarea organizației."
    >
      {state === 'failed' && (
        <p data-testid="confirm-error" role="alert" className="text-sm text-destructive">
          Nu am putut confirma adresa. Verifică conexiunea și încearcă din nou.
        </p>
      )}
      <Button
        data-testid="confirm-submit"
        className="h-11 w-full"
        disabled={state === 'confirming'}
        onClick={() => void confirm()}
      >
        {state === 'confirming' ? 'Se confirmă…' : 'Confirmă adresa'}
      </Button>
    </PublicFrame>
  );
}
