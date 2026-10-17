import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';

export function ProviderBox({
  provider,
  lead,
  testId,
}: {
  provider: { name: string; phone: string | null };
  lead?: ReactNode;
  testId?: string;
}) {
  const { name, phone } = provider;
  return (
    <section
      aria-labelledby="provider-box-title"
      data-testid={testId}
      className="grid gap-1.5 rounded-xl bg-muted px-5 py-4 text-sm leading-relaxed"
    >
      <h2 id="provider-box-title" className="font-semibold">
        <Trans>Ceva nu e corect?</Trans>
      </h2>
      {lead && <p className="text-muted-foreground">{lead}</p>}
      <p>
        {phone ? (
          <Trans>
            Spune-i specialistului SSM: {name},{' '}
            <a
              href={`tel:${phone.replace(/[^\d+]/g, '')}`}
              className="font-medium whitespace-nowrap underline underline-offset-4"
            >
              {phone}
            </a>
            .
          </Trans>
        ) : (
          <Trans>Spune-i specialistului SSM: {name}</Trans>
        )}
      </p>
    </section>
  );
}
