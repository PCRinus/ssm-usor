import { Button } from '@ssm-usor/ui/components/button';
import { Link } from '@tanstack/react-router';

export function NotFoundPage() {
  return (
    <main data-testid="not-found-page" className="mx-auto grid max-w-lg gap-5 px-5 py-20">
      <h1 className="text-2xl font-semibold">Pagina nu a fost găsită</h1>
      <Button asChild>
        <Link to="/">Înapoi la început</Link>
      </Button>
    </main>
  );
}

export function RouteErrorPage() {
  return (
    <main className="mx-auto grid max-w-lg gap-5 px-5 py-20">
      <h1 className="text-2xl font-semibold">Pagina nu a putut fi încărcată</h1>
      <Button onClick={() => window.location.reload()}>Încearcă din nou</Button>
    </main>
  );
}
