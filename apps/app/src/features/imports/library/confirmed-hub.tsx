import { Button } from '@ssm-usor/ui/components/button';
import { Link } from '@tanstack/react-router';
import { FileText } from 'lucide-react';

import type { ImportDetail } from '@/api/generated/api';
import { Notice } from '@/components/notice';

import { CreditsUsedLine } from '../credits-notices';
import { endSentence, usageLine } from '../import-format';
import { LibraryGroup } from './library-group';

export function ConfirmedImportHub({ detail }: { detail: ImportDetail }) {
  const client = detail.client;
  const name = client?.legalName ?? detail.companyName ?? 'Clientul importat';
  return (
    <div data-testid="import-confirmed-hub" className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid max-w-3xl gap-1">
          <span className="text-sm text-muted-foreground">
            {detail.intoExistingClient
              ? 'Client completat din documente'
              : 'Client creat din documente'}
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link
            to="/clienti/import/$importId/fisiere"
            params={{ importId: detail.id }}
            data-testid="import-review-files"
          >
            <FileText aria-hidden="true" />
            Fișierele importului
          </Link>
        </Button>
      </div>
      {client && (
        <Notice
          variant="success"
          data-testid="import-confirmed"
          action={
            <Button asChild variant="outline" size="sm" className="bg-card">
              <Link to="/clienti/$clientId/detalii" params={{ clientId: client.id }}>
                Deschide clientul
              </Link>
            </Button>
          }
        >
          Datele au fost preluate în {endSentence(client.legalName)}
        </Notice>
      )}
      <LibraryGroup detail={detail} />
      <div className="grid gap-1 text-sm">
        <CreditsUsedLine detail={detail} kind="client" />
        {detail.usage && (
          <p className="text-xs text-muted-foreground tabular-nums" data-testid="import-usage">
            {usageLine(detail.usage)}
          </p>
        )}
      </div>
    </div>
  );
}
