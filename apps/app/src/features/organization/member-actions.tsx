import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { toast } from '@ssm-usor/ui/lib/toast';
import { MoreHorizontal } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { useChangeMemberRole, useRemoveMember } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { maskPeople } from '@/components/mask-people';
import { Masked } from '@/components/replay';
import { commonFailure } from '@/lib/api-errors';

import { roleLabels } from './labels';
import { refreshTeam } from './refresh-team';
import type { Member } from './team-list';

function actionMessage(cause: unknown, name: string) {
  const common = commonFailure(cause);
  if (common) return common;
  if (cause instanceof ApiHttpError) {
    if (cause.status === 404) return maskPeople`${name} nu mai face parte din organizație.`;
    if (cause.status === 403) return 'Doar adminii organizației pot gestiona membrii.';
  }
  return 'Acțiunea nu a reușit. Verifică conexiunea și încearcă din nou.';
}

// `onError` reports to the card, where the message persists.
export function MemberActions({
  member,
  onError,
}: {
  member: Member;
  onError: (message: ReactNode) => void;
}) {
  const { request, queryClient } = useApi();
  const changeRole = useChangeMemberRole({ request });
  const remove = useRemoveMember({ request });
  const [confirming, setConfirming] = useState(false);
  const name = member.fullName ?? member.email ?? 'Membrul';
  const otherRole = member.role === 'owner' ? 'specialist' : 'owner';
  const busy = changeRole.isPending || remove.isPending;

  // Also after a failure: a 404 means the list on screen is out of date.
  const refresh = () => refreshTeam(queryClient);

  async function switchRole() {
    onError(null);
    try {
      await changeRole.mutateAsync({ userId: member.userId, data: { role: otherRole } });
      toast.success(
        <>
          {maskPeople`${name} este acum `}
          {roleLabels[otherRole].toLowerCase()}.
        </>
      );
    } catch (cause) {
      onError(actionMessage(cause, name));
    }
    await refresh();
  }

  async function removeMember() {
    onError(null);
    try {
      await remove.mutateAsync({ userId: member.userId });
      toast.success(maskPeople`${name} nu mai face parte din organizație.`);
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
      <ConfirmDialog
        open={confirming}
        busy={busy}
        testId="member-remove"
        title="Elimini membrul din organizație?"
        confirmLabel="Elimină"
        pendingLabel="Se elimină…"
        onConfirm={() => void removeMember()}
        onClose={() => setConfirming(false)}
      >
        <Masked className="font-medium text-foreground">{name}</Masked> nu va mai avea acces la
        clienții și lucrătorii organizației. Contul și datele introduse până acum rămân, iar dacă te
        răzgândești poți trimite o nouă invitație.
      </ConfirmDialog>
    </>
  );
}
