import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';

import { getGetClientQueryKey, getListClientsQueryKey, useDeleteClient } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';

export interface ClientToDelete {
  id: string;
  legalName: string;
}

function serverMessage(cause: unknown) {
  if (cause instanceof ApiHttpError) {
    if (cause.status === 403) return 'Doar un administrator al platformei poate șterge un client.';
    if (cause.status === 409) {
      return 'Clientul nu mai este arhivat. Reîncarcă pagina și arhivează-l înainte să îl ștergi.';
    }
    if (cause.status === 401) {
      return 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.';
    }
  }
  return 'Nu am putut șterge clientul. Verifică conexiunea și încearcă din nou.';
}

export function ClientDeleteDialog({
  client,
  onClose,
}: {
  client: ClientToDelete | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={client !== null} onOpenChange={(open) => !open && onClose()}>
      {client && <ClientDeleteContent key={client.id} client={client} onClose={onClose} />}
    </Dialog>
  );
}

function ClientDeleteContent({ client, onClose }: { client: ClientToDelete; onClose: () => void }) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const remove = useDeleteClient({ request: apiRequest });
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const confirmed = typed.trim() === client.legalName.trim();

  async function leave() {
    queryClient.removeQueries({ queryKey: getGetClientQueryKey(client.id) });
    await queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
    await navigate({ to: '/clients', search: { status: 'archived' } });
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!confirmed || remove.isPending) return;
    setError(null);
    try {
      await remove.mutateAsync({ clientId: client.id });
    } catch (cause) {
      if (!(cause instanceof ApiHttpError && cause.status === 404)) {
        setError(serverMessage(cause));
        return;
      }
    }
    onClose();
    toast.success(`${client.legalName} a fost șters definitiv.`);
    await leave();
  }

  return (
    <DialogContent data-testid="client-delete-dialog" className="sm:max-w-md">
      <form onSubmit={(event) => void confirm(event)} noValidate>
        <DialogHeader>
          <DialogTitle>Ștergi definitiv clientul?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{client.legalName}</span> se șterge cu tot
            ce ține de el: angajații și fișele lor, instruirile și semnăturile, testele, posturile,
            locurile de muncă, evaluările de risc, datele PSI, documentele, fișierele, accesul la
            portal și importurile din documentație. Ștergerea nu se poate anula.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-5 grid gap-4">
          <Field id="client-delete-name" label="Scrie numele clientului ca să confirmi">
            <Input
              id="client-delete-name"
              data-testid="client-delete-name"
              autoComplete="off"
              spellCheck={false}
              placeholder={client.legalName}
              value={typed}
              disabled={remove.isPending}
              onChange={(event) => setTyped(event.target.value)}
            />
          </Field>
          {error && (
            <Notice variant="destructive" data-testid="client-delete-error">
              {error}
            </Notice>
          )}
        </div>
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={remove.isPending} onClick={onClose}>
            Renunță
          </Button>
          <Button
            type="submit"
            variant="destructive"
            data-testid="client-delete-confirm"
            disabled={!confirmed || remove.isPending}
          >
            {remove.isPending ? 'Se șterge…' : 'Șterge definitiv'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
