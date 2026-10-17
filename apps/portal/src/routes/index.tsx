import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: PortalHome,
});

function PortalHome() {
  return (
    <main data-testid="portal-home" className="grid gap-3 py-16">
      <h1 className="text-2xl font-semibold">Portalul SSM Ușor</h1>
      <p className="text-muted-foreground">
        Intrarea cu un cod primit pe email sau prin SMS vine în curând.
      </p>
    </main>
  );
}
