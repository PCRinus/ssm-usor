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
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { usePromoteLead } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { Notice } from '@/components/notice';
import { commonFailure } from '@/lib/api-errors';

import { storeClient } from './client-cache';

function serverMessage(cause: unknown) {
  const common = commonFailure(cause);
  if (common) return common;
  if (cause instanceof ApiHttpError) {
    if (cause.status === 404) return 'Oferta nu mai există în organizația ta.';
    if (cause.status === 409) return 'Oferta este arhivată. Reactivează-o mai întâi.';
    if (cause.status === 403) {
      return 'Doar un admin al organizației poate transforma o ofertă în client.';
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
  const { request, queryClient } = useApi();
  const navigate = useNavigate();
  const promote = usePromoteLead({ request });
  const [error, setError] = useState<string | null>(null);

  function close() {
    setError(null);
    onClose();
  }

  async function confirm(id: string, legalName: string) {
    setError(null);
    try {
      const saved = await promote.mutateAsync({ clientId: id });
      await storeClient(queryClient, saved);
      toast.success(`${legalName} este acum client.`);
      close();
      await navigate({ to: '/clienti/$clientId/detalii', params: { clientId: id } });
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
              clienților, unde îl vede toată echipa, și i se pot adăuga lucrători, posturi de lucru
              și documente. Notițele rămân vizibile doar adminilor. Transformarea nu poate fi
              anulată.
            </DialogDescription>
          </DialogHeader>
          {signed === false && (
            <Notice variant="warning" data-testid="promote-lead-unsigned">
              {received
                ? 'Exemplarul semnat primit de la client nu este confirmat încă. Poți continua: îl vei putea confirma și după aceea, din secțiunea „Contract” a clientului.'
                : 'Nu ai atașat exemplarul semnat al contractului. Poți continua: îl vei putea atașa și după aceea, din secțiunea „Contract” a clientului.'}
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
