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
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import { type ApiErrorResponse, useUpdateInstructionModule } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { Notice } from '@/components/notice';

import {
  type InstructionModule,
  invalidateLibrary,
  positionCountLabel,
} from './instruction-schema';

export interface InstructionArchiveChange {
  module: InstructionModule;
  action: 'archive' | 'restore';
}

function serverMessage(cause: unknown, action: InstructionArchiveChange['action']) {
  if (cause instanceof ApiHttpError) {
    const body = cause.body as Partial<ApiErrorResponse> | null;
    if (body?.reason === 'instruction_module_applied') {
      return 'Între timp, instrucțiunea a fost aplicată la un post. Scoate-o de la posturile care o aplică, apoi arhiveaz-o.';
    }
    if (cause.status === 404) return 'Instrucțiunea nu mai există în bibliotecă.';
    if (cause.status === 401) {
      return 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.';
    }
  }
  return action === 'archive'
    ? 'Nu am putut arhiva instrucțiunea. Verifică conexiunea și încearcă din nou.'
    : 'Nu am putut reactiva instrucțiunea. Verifică conexiunea și încearcă din nou.';
}

export function InstructionArchiveDialog({
  change,
  onClose,
}: {
  change: InstructionArchiveChange | null;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const update = useUpdateInstructionModule({ request: apiRequest });
  const [error, setError] = useState<string | null>(null);
  const busy = update.isPending;

  function close() {
    setError(null);
    onClose();
  }

  async function confirm({ module, action }: InstructionArchiveChange) {
    setError(null);
    try {
      await update.mutateAsync({ moduleId: module.id, data: { archived: action === 'archive' } });
      await invalidateLibrary(queryClient);
      toast.success(
        action === 'archive'
          ? `„${module.title}” a fost arhivată.`
          : `„${module.title}” a fost reactivată.`
      );
      close();
    } catch (cause) {
      setError(serverMessage(cause, action));
      await invalidateLibrary(queryClient);
    }
  }

  const applied = change?.action === 'archive' && change.module.appliedCount > 0;

  return (
    <Dialog open={change !== null} onOpenChange={(open) => !open && !busy && close()}>
      {change && (
        <DialogContent data-testid="instruction-archive-dialog" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {applied
                ? 'Instrucțiunea este aplicată la posturi'
                : change.action === 'archive'
                  ? 'Arhivezi instrucțiunea?'
                  : 'Reactivezi instrucțiunea?'}
            </DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">„{change.module.title}”</span>
              {applied
                ? ` este aplicată la ${positionCountLabel(change.module.appliedCount).toLowerCase()}. Scoate-o de la ${change.module.appliedCount === 1 ? 'acest post' : 'aceste posturi'}, apoi o poți arhiva.`
                : change.action === 'archive'
                  ? ' iese din lista instrucțiunilor active: nu mai poate fi aplicată la posturi, iar textul ei nu se mai poate schimba. Documentele care o anexează deja rămân neschimbate. O poți reactiva oricând din lista „Arhivate”.'
                  : ' revine în lista instrucțiunilor active și poate fi aplicată din nou la posturi.'}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Notice variant="destructive" data-testid="instruction-archive-error">
              {error}
            </Notice>
          )}
          <DialogFooter className="mt-2">
            {applied ? (
              <Button data-testid="instruction-archive-close" onClick={close}>
                Am înțeles
              </Button>
            ) : (
              <>
                <Button variant="ghost" disabled={busy} onClick={close}>
                  Renunță
                </Button>
                <Button
                  data-testid="instruction-archive-confirm"
                  disabled={busy}
                  onClick={() => void confirm(change)}
                >
                  {change.action === 'archive'
                    ? busy
                      ? 'Se arhivează…'
                      : 'Arhivează'
                    : busy
                      ? 'Se reactivează…'
                      : 'Reactivează'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
