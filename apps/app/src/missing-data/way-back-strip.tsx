import { Alert, AlertDescription } from '@ssm-usor/ui/components/alert';
import { Button } from '@ssm-usor/ui/components/button';
import { Link, useLocation } from '@tanstack/react-router';
import { ArrowLeft, Info, X } from 'lucide-react';

import { useAuth } from '../auth/auth-context';
import { endWayBack, useWayBack, type WayBack } from './way-back';

const linkClass =
  'inline-flex items-center gap-1.5 rounded-sm font-medium whitespace-nowrap underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

function BackLink({ wayBack }: { wayBack: WayBack }) {
  const content = (
    <>
      <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
      {wayBack.to === 'documents' ? 'Înapoi la generare' : 'Înapoi la contract'}
    </>
  );
  const common = { 'data-testid': 'way-back-link', className: linkClass, onClick: endWayBack };
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

// Built on Alert rather than Notice: Notice's action slot stacks under the text on a phone,
// where the dismiss button has to stay at the top right.
export function WayBackStrip({ clientId }: { clientId?: string }) {
  const { session } = useAuth();
  const wayBack = useWayBack(session?.user.id);
  const pathname = useLocation({ select: (location) => location.pathname });
  if (!wayBack || (clientId !== undefined && wayBack.clientId !== clientId)) return null;
  if (pathname.startsWith(origins[wayBack.to](wayBack.clientId))) return null;

  return (
    <Alert variant="info" role="status" data-testid="way-back" className="py-2.5">
      <Info aria-hidden="true" />
      <AlertDescription className="justify-items-stretch">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              {wayBack.to === 'documents'
                ? 'Completezi datele pentru documentație.'
                : 'Completezi datele pentru contract.'}
            </span>
            <BackLink wayBack={wayBack} />
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            data-testid="way-back-dismiss"
            aria-label="Ascunde"
            className="-my-1.5 -mr-2 shrink-0"
            onClick={endWayBack}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
