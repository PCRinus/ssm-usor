import { createFileRoute, Link, Navigate, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { z } from 'zod';

import { captureAsMember } from '@/app/observability/posthog';
import { PublicFrame, PublicFrameAction } from '@/app/public-frame';
import { useAuth } from '@/features/auth/auth-context';
import {
  forgetGoogleSignInOrigin,
  readGoogleSignInOrigin,
} from '@/features/auth/google-sign-in-origin';

// Public: Supabase sends the browser back here from Google with a one-time code, or with
// `error` when the person cancelled or Google refused (ADR 027).
export const Route = createFileRoute('/auth/callback')({
  staticData: { title: 'Autentificare cu Google' },
  validateSearch: z.object({
    code: z.string().optional(),
    error: z.string().optional(),
  }),
  component: GoogleCallbackPage,
});

// Supabase does not say whether the sign-in made the account; one made by it was created the
// moment it was signed in. A minute covers the round trip through Google.
function madeBySignIn(user: { created_at: string; last_sign_in_at?: string }) {
  const signedIn = Date.parse(user.last_sign_in_at ?? '');
  return Math.abs(signedIn - Date.parse(user.created_at)) < 60_000;
}

function GoogleCallbackPage() {
  const { code, error } = Route.useSearch();
  const { auth } = useAuth();
  const navigate = useNavigate();
  const [origin] = useState(readGoogleSignInOrigin);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!code) return;
    let current = true;
    auth.completeOAuth(code).then(
      () => {
        if (!current) return;
        forgetGoogleSignInOrigin();
        const user = auth.getSnapshot().session?.user;
        if (user && madeBySignIn(user)) captureAsMember(user.id, 'signed_up', { method: 'google' });
        void (origin.invitation
          ? navigate({
              to: '/accept-invitation',
              search: { token: origin.invitation },
              replace: true,
            })
          : navigate({ to: '/dashboard', replace: true }));
      },
      () => {
        if (current) setFailed(true);
      }
    );
    return () => {
      current = false;
    };
  }, [auth, code, navigate, origin]);

  if (error === 'access_denied') return <Navigate to={origin.from} replace />;

  if (!code || failed) {
    return (
      <PublicFrame
        testId="google-callback-failed"
        title="Autentificarea cu Google nu a reușit"
        description="Google nu a confirmat contul sau linkul a expirat. Încearcă din nou."
      >
        <PublicFrameAction asChild data-testid="google-callback-retry">
          <Link to={origin.from} replace>
            Înapoi
          </Link>
        </PublicFrameAction>
      </PublicFrame>
    );
  }

  return (
    <PublicFrame testId="google-callback" title="Se finalizează autentificarea…">
      <p role="status" className="sr-only">
        Se finalizează autentificarea cu Google…
      </p>
    </PublicFrame>
  );
}
