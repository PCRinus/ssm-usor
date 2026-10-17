import { Button } from '@ssm-usor/ui/components/button';
import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="grid gap-1 pt-8 pb-6">
      {eyebrow && <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>}
      <h1 className="text-2xl font-semibold tracking-tight break-words">{title}</h1>
      {children && <div className="text-muted-foreground">{children}</div>}
    </header>
  );
}

export function PageLoading() {
  return (
    <p role="status" data-testid="page-loading" className="py-8 text-muted-foreground">
      Se încarcă…
    </p>
  );
}

export function PageFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div data-testid="page-error" className="grid gap-4 py-8">
      <p role="alert">Nu am putut încărca pagina. Verifică conexiunea la internet.</p>
      <Button variant="outline" className="h-12" onClick={onRetry}>
        Încearcă din nou
      </Button>
    </div>
  );
}
