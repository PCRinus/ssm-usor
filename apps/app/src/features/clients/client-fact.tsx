import { cn } from '@ssm-usor/ui/lib/utils';
import { getRouteApi, Link } from '@tanstack/react-router';

import { HeaderFact } from './record-header';

const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

export function ClientFact({
  clientId,
  clientName,
  className,
}: {
  clientId: string;
  clientName: string;
  className?: string;
}) {
  return (
    <p data-testid="client-fact" className={cn('flex min-w-0 gap-1.5 text-sm', className)}>
      <span className="shrink-0 text-muted-foreground">Client</span>
      <Link
        to="/clienti/$clientId/detalii"
        params={{ clientId }}
        className="min-w-0 wrap-anywhere hover:underline"
      >
        {clientName}
      </Link>
    </p>
  );
}

export function CurrentClientFact({ className }: { className?: string }) {
  const { client } = clientRoute.useLoaderData();
  return <ClientFact clientId={client.id} clientName={client.legalName} className={className} />;
}

export function CurrentClientHeaderFact() {
  const { client } = clientRoute.useLoaderData();
  return (
    <HeaderFact label="Client">
      <Link
        to="/clienti/$clientId/detalii"
        params={{ clientId: client.id }}
        data-testid="client-fact"
        className="hover:underline"
      >
        {client.legalName}
      </Link>
    </HeaderFact>
  );
}
