import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import { createFileRoute, Link, useRouteContext } from '@tanstack/react-router';

import { useMe } from '../../account/use-me';
import { ApiHttpError } from '../../api/http';
import { useAuth } from '../../auth/auth-context';

export const Route = createFileRoute('/_authenticated/dashboard')({
  staticData: { title: 'Prezentare generală' },
  component: DashboardPage,
});

export function DashboardPage() {
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const me = useMe();
  if (!session) return null;

  return (
    <div data-testid="dashboard-page" className="grid gap-6">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Prezentare generală</h1>
      <Card className="max-w-2xl">
        <CardHeader>
          <h2 className="text-lg font-semibold">Contul tău</h2>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!apiRequest.baseUrl ? (
            <p role="alert">Datele contului nu sunt disponibile momentan.</p>
          ) : me.isError ? (
            <>
              <p data-testid="dashboard-account-error" role="alert">
                {me.error instanceof ApiHttpError && me.error.status === 401
                  ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
                  : 'Nu am putut încărca datele contului. Încearcă din nou.'}
              </p>
              <Button
                data-testid="dashboard-account-retry"
                variant="outline"
                disabled={me.isFetching}
                onClick={() => void me.refetch()}
              >
                Încearcă din nou
              </Button>
            </>
          ) : me.isPending ? (
            <p role="status">Se încarcă datele contului…</p>
          ) : (
            <p>{me.data.user.email ?? 'Cont fără adresă de email'}</p>
          )}
        </CardContent>
      </Card>
      <Card className="max-w-2xl">
        <CardHeader>
          <h2 className="text-lg font-semibold">Clienți</h2>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed text-muted-foreground">
          Vezi clienții și documentele la care lucrezi.
          <div className="mt-5">
            <Button asChild>
              <Link to="/clients">Vezi clienții</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
