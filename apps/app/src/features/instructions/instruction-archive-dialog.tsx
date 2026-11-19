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

import { useUpdateInstructionModule } from '@/api/generated/api';
import { apiErrorReason, ApiHttpError } from '@/api/http';
import { Notice } from '@/components/notice';
import { commonFailure } from '@/lib/api-errors';

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
  const common = commonFailure(cause);
  if (common) return common;
  if (cause instanceof ApiHttpError) {
    if (apiErrorReason(cause) === 'instruction_module_applied') {
      return 'Între timp, instrucțiunea a fost aplicată la un post. Scoate-o de la posturile care o aplică, apoi arhiveaz-o.';
    }
    if (cause.status === 404) return 'Instrucțiunea nu mai există în bibliotecă.';
  }
  return action === 'archive'
    ? 'Nu am putut arhiva instrucțiunea. Verifică conexiunea și încearcă din nou.'
    : 'Nu am putut reactiva instrucțiunea. Verifică conexiunea și încearcă din nou.';
}

const posts = (count: number) => positionCountLabel(count).toLowerCase();

// Archiving waits for archived clients' posts too: a client reactivated later would otherwise
// generate its documents from a module nobody can see. Their posts change only once the client
// is active again.
function appliedReason({ appliedCount, positionCount }: InstructionModule) {
  const archived = appliedCount - positionCount;
  if (archived === 0) {
    return ` este aplicată la ${posts(appliedCount)}. Scoate-o de la ${appliedCount === 1 ? 'acest post' : 'aceste posturi'}, apoi o poți arhiva.`;
  }
  if (positionCount === 0) {
    return archived === 1
      ? ' este aplicată la un post al unui client arhivat. Reactivează clientul, scoate-o de la acest post, apoi o poți arhiva.'
      : ` este aplicată la ${posts(archived)} ale unor clienți arhivați. Reactivează acești clienți, scoate-o de la posturile lor, apoi o poți arhiva.`;
  }
  return ` este aplicată la ${posts(appliedCount)}, dintre care ${archived === 1 ? 'unul la un client arhivat' : `${archived} la clienți arhivați`}. Scoate-o de la posturile clienților activi, iar de la ${archived === 1 ? 'celălalt după ce reactivezi clientul' : 'celelalte după ce reactivezi clienții lor'}; apoi o poți arhiva.`;
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
                ? appliedReason(change.module)
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
