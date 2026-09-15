import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { useAuth } from '../auth/auth-context';

export function DashboardPage() {
  const { auth, session } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session) return null;

  return (
    <div className="min-h-svh">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <Link to="/dashboard" className="text-sm font-semibold tracking-widest uppercase">
            SSM Ușor
          </Link>
          <div className="flex min-w-0 flex-wrap items-center gap-4">
            <span className="break-all text-sm text-muted-foreground">{session.user.email}</span>
            <Button
              variant="outline"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                setError(null);
                try {
                  await auth.signOut();
                  await navigate({ to: '/login', replace: true });
                } catch {
                  setError('Deconectarea nu a reușit. Verifică conexiunea și încearcă din nou.');
                } finally {
                  setPending(false);
                }
              }}
            >
              {pending ? 'Se deconectează…' : 'Deconectare'}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-6 px-5 py-10 sm:px-8">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div>
          <Badge variant="secondary" className="mb-4">
            În dezvoltare
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Spațiul tău de lucru
          </h1>
          <p className="mt-3 text-muted-foreground">Bine ai venit în SSM Ușor.</p>
        </div>
        <Card className="max-w-2xl">
          <CardHeader>
            <h2 className="text-lg font-semibold">Totul începe de aici</h2>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-muted-foreground">
            Aici vei gestiona clienții, documentele și termenele tale. Pregătim primele
            funcționalități pentru spațiul tău de lucru.
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
