import { Trans } from '@lingui/react/macro';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import type { ReactNode } from 'react';

// viewport-fit=cover lets a landscape phone draw under its notch, so the gutters keep clear of it.
export const pageColumn =
  'mx-auto w-full max-w-[64rem] pr-[max(1.25rem,env(safe-area-inset-right))] pl-[max(1.25rem,env(safe-area-inset-left))] sm:pr-8 sm:pl-8';

export const cardClass = 'rounded-xl border bg-card';

export function Page({
  testId,
  className,
  children,
}: {
  testId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <main
      data-testid={testId}
      className={cn(
        pageColumn,
        'flex flex-col gap-6 pt-6 pb-8 sm:gap-8 sm:pt-10 sm:pb-14',
        className
      )}
    >
      {children}
    </main>
  );
}

export function PageGrid({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('grid items-start gap-6 lg:grid-cols-12', className)}>{children}</div>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="grid gap-1">
      {eyebrow && <p className="text-sm text-muted-foreground">{eyebrow}</p>}
      <h1 className="text-[1.625rem] leading-tight font-semibold tracking-tight break-words sm:text-3xl">
        {title}
      </h1>
      {description && (
        <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{description}</p>
      )}
      {children}
    </header>
  );
}

export function SectionLabel({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-[0.8125rem] font-semibold text-muted-foreground">
      {children}
    </h2>
  );
}

export function PageLoading() {
  return (
    <p role="status" data-testid="page-loading" className="py-8 text-muted-foreground">
      <Trans>Se încarcă…</Trans>
    </p>
  );
}

export function PageFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div data-testid="page-error" className="grid gap-4 py-8">
      <p role="alert">
        <Trans>Nu am putut încărca pagina. Verifică conexiunea la internet.</Trans>
      </p>
      <Button variant="outline" className="h-12 sm:w-fit" onClick={onRetry}>
        <Trans>Încearcă din nou</Trans>
      </Button>
    </div>
  );
}
