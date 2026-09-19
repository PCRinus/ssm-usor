import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { MoreHorizontal } from 'lucide-react';
import { useState } from 'react';

import {
  getListOrganizationMembersQueryKey,
  type OrganizationMemberListResponse,
  useChangeMemberRole,
  useRemoveMember,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { roleLabels } from './labels';

type Member = OrganizationMemberListResponse['items'][number];

function actionMessage(cause: unknown, name: string) {
  if (cause instanceof ApiHttpError) {
    if (cause.status === 404) return `${name} nu mai face parte din organizație.`;
    if (cause.status === 403) return 'Doar administratorii organizației pot gestiona membrii.';
    if (cause.status === 401) {
      return 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.';
    }
  }
  return 'Acțiunea nu a reușit. Verifică conexiunea și încearcă din nou.';
}

// `onError` reports to the card, where the message persists.
export function MemberActions({
  member,
  onError,
}: {
  member: Member;
  onError: (message: string | null) => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const changeRole = useChangeMemberRole({ request: apiRequest });
  const remove = useRemoveMember({ request: apiRequest });
  const [confirming, setConfirming] = useState(false);
  const name = member.fullName ?? member.email ?? 'Membrul';
  const otherRole = member.role === 'owner' ? 'specialist' : 'owner';
  const busy = changeRole.isPending || remove.isPending;

  // Also after a failure: a 404 means the list on screen is out of date.
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListOrganizationMembersQueryKey() });

  async function switchRole() {
    onError(null);
    try {
      await changeRole.mutateAsync({ userId: member.userId, data: { role: otherRole } });
      toast.success(`${name} este acum ${roleLabels[otherRole].toLowerCase()}.`);
    } catch (cause) {
      onError(actionMessage(cause, name));
    }
    await refresh();
  }

  async function removeMember() {
    onError(null);
    try {
      await remove.mutateAsync({ userId: member.userId });
      toast.success(`${name} nu mai face parte din organizație.`);
    } catch (cause) {
      onError(actionMessage(cause, name));
    }
    setConfirming(false);
    await refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            data-testid="member-actions"
            aria-label={`Acțiuni pentru ${name}`}
            disabled={busy}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem data-testid="member-switch-role" onSelect={() => void switchRole()}>
            Schimbă rolul în {roleLabels[otherRole].toLowerCase()}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-testid="member-remove"
            variant="destructive"
            onSelect={() => setConfirming(true)}
          >
            Elimină din organizație
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirming} onOpenChange={(open) => !busy && setConfirming(open)}>
        <DialogContent data-testid="member-remove-dialog" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Elimini membrul din organizație?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{name}</span> nu va mai avea acces la
              clienții și angajații organizației. Contul și datele introduse până acum rămân, iar
              dacă te răzgândești poți trimite o nouă invitație.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
              Renunță
            </Button>
            <Button
              variant="destructive"
              data-testid="member-remove-confirm"
              disabled={busy}
              onClick={() => void removeMember()}
            >
              {remove.isPending ? 'Se elimină…' : 'Elimină'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
