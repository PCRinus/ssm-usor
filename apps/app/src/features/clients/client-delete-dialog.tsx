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
import { Notice } from '@ssm-usor/ui/components/notice';
import { toast } from '@ssm-usor/ui/lib/toast';
import { type FormEvent, useState } from 'react';

import { getGetClientQueryKey, getListClientsQueryKey, useDeleteClient } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { Field } from '@/components/form-field';
import { commonFailure } from '@/lib/api-errors';

export interface ClientToDelete {
  id: string;
  legalName: string;
}

function serverMessage(cause: unknown) {
  const common = commonFailure(cause);
  if (common) return common;
  if (cause instanceof ApiHttpError) {
    if (cause.status === 403) return 'Doar un administrator al platformei poate șterge un client.';
    if (cause.status === 409) {
      return 'Clientul nu mai este arhivat. Reîncarcă pagina și arhivează-l înainte să îl ștergi.';
    }
  }
  return 'Nu am putut șterge clientul. Verifică conexiunea și încearcă din nou.';
}

interface ClientDeleteProps {
  onClose: () => void;
  onDeleted?: () => Promise<unknown>;
}

export function ClientDeleteDialog({
  client,
  onClose,
  onDeleted,
}: ClientDeleteProps & { client: ClientToDelete | null }) {
  const { request } = useApi();
  const remove = useDeleteClient({ request });
  return (
    <Dialog open={client !== null} onOpenChange={(open) => !open && !remove.isPending && onClose()}>
      {client && (
        <ClientDeleteContent
          key={client.id}
          client={client}
          remove={remove}
          onClose={onClose}
          onDeleted={onDeleted}
        />
      )}
    </Dialog>
  );
}

function ClientDeleteContent({
  client,
  remove,
  onClose,
  onDeleted,
}: ClientDeleteProps & { client: ClientToDelete; remove: ReturnType<typeof useDeleteClient> }) {
  const { queryClient } = useApi();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const confirmed = typed.trim() === client.legalName.trim();

  async function forget() {
    queryClient.removeQueries({ queryKey: getGetClientQueryKey(client.id) });
    await queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
    await onDeleted?.();
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
    await forget();
  }

  return (
    <DialogContent data-testid="client-delete-dialog" className="sm:max-w-md">
      <form onSubmit={(event) => void confirm(event)} noValidate>
        <DialogHeader>
          <DialogTitle>Ștergi definitiv clientul?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{client.legalName}</span> se șterge cu tot
            ce ține de el: lucrătorii și fișele lor, instruirile și semnăturile, testele, posturile,
            locurile de muncă, fișele de evaluare a riscurilor, datele SU, documentele, fișierele,
            accesul la portal și importurile din documentație. Ștergerea nu se poate anula.
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
