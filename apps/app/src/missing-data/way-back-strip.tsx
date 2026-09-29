import { Button } from '@ssm-usor/ui/components/button';
import { Link, useLocation } from '@tanstack/react-router';
import { ArrowLeft, X } from 'lucide-react';

import { useAuth } from '../auth/auth-context';
import { Notice } from '../components/notice';
import { endWayBack, useWayBack, type WayBack } from './way-back';

function BackLink({ wayBack }: { wayBack: WayBack }) {
  const content = (
    <>
      <ArrowLeft aria-hidden="true" />
      {wayBack.to === 'documents' ? 'Înapoi la generare' : 'Înapoi la contract'}
    </>
  );
  const common = { 'data-testid': 'way-back-link', onClick: endWayBack };
  if (wayBack.to === 'lead-contract') {
    return (
      <Link to="/leads/$leadId" params={{ leadId: wayBack.clientId }} {...common}>
        {content}
      </Link>
    );
  }
  if (wayBack.to === 'client-contract') {
    return (
      <Link to="/clients/$clientId/contract" params={{ clientId: wayBack.clientId }} {...common}>
        {content}
      </Link>
    );
  }
  return (
    <Link
      to="/clients/$clientId/documents"
      params={{ clientId: wayBack.clientId }}
      search={{ focus: 'generate' }}
      {...common}
    >
      {content}
    </Link>
  );
}

const origins: Record<WayBack['to'], (clientId: string) => string> = {
  documents: (clientId) => `/clients/${clientId}/documents`,
  'client-contract': (clientId) => `/clients/${clientId}/contract`,
  'lead-contract': (clientId) => `/leads/${clientId}`,
};

export function WayBackStrip({ clientId }: { clientId?: string }) {
  const { session } = useAuth();
  const wayBack = useWayBack(session?.user.id);
  const pathname = useLocation({ select: (location) => location.pathname });
  if (!wayBack || (clientId !== undefined && wayBack.clientId !== clientId)) return null;
  if (pathname.startsWith(origins[wayBack.to](wayBack.clientId))) return null;

  return (
    <Notice
      variant="info"
      data-testid="way-back"
      className="py-2"
      action={
        <div className="flex items-center gap-1">
          <Button asChild variant="outline" size="sm" className="bg-card">
            <BackLink wayBack={wayBack} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="way-back-dismiss"
            aria-label="Ascunde"
            onClick={endWayBack}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      }
    >
      {wayBack.to === 'documents'
        ? 'Completezi datele pentru documentație.'
        : 'Completezi datele pentru contract.'}
    </Notice>
  );
}
