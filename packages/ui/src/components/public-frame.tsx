import { Card, CardContent, CardDescription, CardHeader } from '@ssm-usor/ui/components/card';
import type { ReactNode } from 'react';

export function PublicFrame({
  testId,
  title,
  description,
  footer,
  backdrop,
  children,
}: {
  testId: string;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  backdrop?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <main
      data-testid={testId}
      className="relative isolate flex min-h-svh items-center justify-center overflow-hidden bg-[color-mix(in_srgb,var(--brand-forest)_10%,var(--muted))] px-5 py-10 sm:px-8"
    >
      {backdrop}
      <div className="relative flex w-full max-w-md flex-col items-center gap-7">
        <img
          src="/brand/logo.png"
          alt="SSM Ușor"
          width={2172}
          height={724}
          className="h-auto w-48"
        />
        <Card className="w-full gap-7 py-8">
          <CardHeader className="gap-2 text-center sm:px-8">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description && (
              <CardDescription className="leading-relaxed">{description}</CardDescription>
            )}
          </CardHeader>
          {children && <CardContent className="grid gap-5 sm:px-8">{children}</CardContent>}
        </Card>
        {footer && <footer>{footer}</footer>}
      </div>
    </main>
  );
}
