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
import { useRouteContext, useRouter } from '@tanstack/react-router';
import { useState } from 'react';

import {
  getGetClientQueryKey,
  getListClientDocumentsQueryKey,
  getListClientsQueryKey,
  useArchiveClient,
  useListClientDocuments,
  useRestoreClient,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { useAuth } from '../auth/auth-context';
import { Notice } from '../components/notice';

export interface ClientArchiveChange {
  client: { id: string; legalName: string };
  action: 'archive' | 'restore';
}

function serverMessage(cause: unknown, action: ClientArchiveChange['action']) {
  if (cause instanceof ApiHttpError) {
    if (cause.status === 404) return 'Clientul nu mai există în organizația ta.';
    if (cause.status === 403) {
      return 'Doar un administrator al organizației poate arhiva sau restaura un client.';
    }
    if (cause.status === 401) {
      return 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.';
    }
  }
  return action === 'archive'
    ? 'Nu am putut arhiva clientul. Verifică conexiunea și încearcă din nou.'
    : 'Nu am putut restaura clientul. Verifică conexiunea și încearcă din nou.';
}

const draftsNotice = (count: number) =>
  count === 1
    ? 'Un document este încă ciornă și nu va mai putea fi emis cât timp clientul este arhivat.'
    : `${count} documente sunt încă ciorne și nu vor mai putea fi emise cât timp clientul este arhivat.`;

export function ClientArchiveDialog({
  change,
  onClose,
}: {
  change: ClientArchiveChange | null;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const { session } = useAuth();
  const router = useRouter();
  const archive = useArchiveClient({ request: apiRequest });
  const restore = useRestoreClient({ request: apiRequest });
  const [error, setError] = useState<string | null>(null);
  const busy = archive.isPending || restore.isPending;
  const archiving = change?.action === 'archive' ? change.client.id : null;
  const documents = useListClientDocuments(archiving ?? '', {
    request: apiRequest,
    query: {
      queryKey: [...getListClientDocumentsQueryKey(archiving ?? ''), session?.user.id],
      enabled: Boolean(archiving && session && apiRequest.baseUrl),
    },
  });
  const drafts = archiving
    ? (documents.data?.items.filter((document) => document.draft).length ?? 0)
    : 0;

  function close() {
    setError(null);
    onClose();
  }

  async function confirm({ client, action }: ClientArchiveChange) {
    setError(null);
    try {
      const saved = await (action === 'archive' ? archive : restore).mutateAsync({
        clientId: client.id,
      });
      // The client page reads the record through its loader, which keeps whatever is cached.
      queryClient.setQueriesData({ queryKey: getGetClientQueryKey(client.id) }, saved);
      await queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
      await router.invalidate();
      toast.success(
        action === 'archive'
          ? `${client.legalName} a fost arhivat.`
          : `${client.legalName} a fost restaurat.`
      );
      close();
    } catch (cause) {
      setError(serverMessage(cause, action));
    }
  }

  return (
    <Dialog open={change !== null} onOpenChange={(open) => !open && !busy && close()}>
      {change && (
        <DialogContent data-testid="client-archive-dialog" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {change.action === 'archive' ? 'Arhivezi clientul?' : 'Restaurezi clientul?'}
            </DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{change.client.legalName}</span>
              {change.action === 'archive'
                ? ' iese din lista clienților activi. Angajații, posturile și documentele lui rămân neschimbate și pot fi consultate din lista „Arhivați”, de unde clientul poate fi restaurat.'
                : ' revine în lista clienților activi, cu angajații, posturile și documentele lui.'}
            </DialogDescription>
          </DialogHeader>
          {drafts > 0 && (
            <Notice variant="warning" data-testid="client-archive-drafts">
              {draftsNotice(drafts)}
            </Notice>
          )}
          {error && (
            <Notice variant="destructive" data-testid="client-archive-error">
              {error}
            </Notice>
          )}
          <DialogFooter className="mt-2">
            <Button variant="ghost" disabled={busy} onClick={close}>
              Renunță
            </Button>
            <Button
              variant={change.action === 'archive' ? 'destructive' : 'default'}
              data-testid="client-archive-confirm"
              disabled={busy}
              onClick={() => void confirm(change)}
            >
              {change.action === 'archive'
                ? busy
                  ? 'Se arhivează…'
                  : 'Arhivează'
                : busy
                  ? 'Se restaurează…'
                  : 'Restaurează'}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
