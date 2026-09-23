import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import { getGetClientQueryKey, getListClientsQueryKey, usePromoteLead } from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { Notice } from '../components/notice';

function serverMessage(cause: unknown) {
  if (cause instanceof ApiHttpError) {
    if (cause.status === 404) return 'Clientul potențial nu mai există în organizația ta.';
    if (cause.status === 409) return 'Clientul potențial este arhivat. Restaurează-l mai întâi.';
    if (cause.status === 403) {
      return 'Doar un administrator al organizației poate transforma un client potențial în client.';
    }
    if (cause.status === 401) {
      return 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.';
    }
  }
  return 'Nu am putut face transformarea. Verifică conexiunea și încearcă din nou.';
}

export function PromoteLeadDialog({
  lead,
  signed,
  received = false,
  onClose,
}: {
  lead: { id: string; legalName: string } | null;
  // Whether the signed copy of the contract in force is attached. Left out while it is not
  // known yet, so that the warning never flashes for a contract that is signed.
  signed?: boolean;
  /** A copy came through the return link and nobody confirmed it: as good as none, but said. */
  received?: boolean;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const promote = usePromoteLead({ request: apiRequest });
  const [error, setError] = useState<string | null>(null);

  function close() {
    setError(null);
    onClose();
  }

  async function confirm(id: string, legalName: string) {
    setError(null);
    try {
      const saved = await promote.mutateAsync({ clientId: id });
      // The client page reads the record through its loader, which keeps whatever is cached.
      queryClient.setQueriesData({ queryKey: getGetClientQueryKey(id) }, saved);
      await queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
      toast.success(`${legalName} este acum client.`);
      close();
      await navigate({ to: '/clients/$clientId/employees', params: { clientId: id } });
    } catch (cause) {
      setError(serverMessage(cause));
    }
  }

  return (
    <Dialog open={lead !== null} onOpenChange={(open) => !open && !promote.isPending && close()}>
      {lead && (
        <DialogContent data-testid="promote-lead-dialog" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transformi în client?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{lead.legalName}</span> trece în lista
              clienților, unde îl vede toată echipa, și i se pot adăuga angajați, posturi de lucru
              și documente. Notițele rămân vizibile doar administratorilor. Transformarea nu poate
              fi anulată.
            </DialogDescription>
          </DialogHeader>
          {signed === false && (
            <Notice variant="warning" data-testid="promote-lead-unsigned">
              {received
                ? 'Exemplarul semnat primit de la client nu este confirmat încă. Poți continua: îl vei putea confirma și după aceea, din „Alte documente”.'
                : 'Nu ai atașat exemplarul semnat al contractului. Poți continua: îl vei putea atașa și după aceea, din „Alte documente”.'}
            </Notice>
          )}
          {error && (
            <Notice variant="destructive" data-testid="promote-lead-error">
              {error}
            </Notice>
          )}
          <DialogFooter className="mt-2">
            <Button variant="ghost" disabled={promote.isPending} onClick={close}>
              Renunță
            </Button>
            <Button
              data-testid="promote-lead-confirm"
              disabled={promote.isPending}
              onClick={() => void confirm(lead.id, lead.legalName)}
            >
              {promote.isPending ? 'Se transformă…' : 'Transformă în client'}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
