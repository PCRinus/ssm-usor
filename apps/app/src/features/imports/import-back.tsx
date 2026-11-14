import type { ImportDetail } from '@/api/generated/api';
import { BackLink } from '@/components/back-link';

export function ImportParentBack({ detail }: { detail: ImportDetail }) {
  return detail.intoExistingClient && detail.client ? (
    <BackLink
      to="/clienti/$clientId/detalii"
      params={{ clientId: detail.client.id }}
      label="Înapoi la client"
    />
  ) : (
    <BackLink to="/clienti" label="Înapoi la clienți" />
  );
}

export function ImportOverviewBack({ importId }: { importId: string }) {
  return <BackLink to="/clienti/import/$importId" params={{ importId }} label="Înapoi la import" />;
}
