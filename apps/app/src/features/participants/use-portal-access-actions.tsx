import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';

import {
  useResendParticipantInvitation,
  useRevokeClientParticipant,
  useRevokeParticipantInvitation,
} from '@/api/generated/api';
import { maskPeople } from '@/components/mask-people';
import { Masked } from '@/components/replay';
import { wordingRefusalHere } from '@/features/impersonation/refusal';

import { ConfirmDialog, type ParticipantMessage } from './participant-actions';
import { participantFailure } from './participant-errors';
import type { AccessTarget } from './portal-access-format';
import { useRefreshParticipants } from './use-refresh-participants';

type Pending =
  | { kind: 'access'; participantId: string; target: AccessTarget }
  | { kind: 'invitation'; invitationId: string; target: AccessTarget };

// The lists are read again after a failure too: the access may have changed meanwhile.
export function usePortalAccessActions(
  clientId: string,
  onMessage: (message: ParticipantMessage) => void
) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const resend = useResendParticipantInvitation({ request: wordingRefusalHere(apiRequest) });
  const revokeInvitation = useRevokeParticipantInvitation({ request: apiRequest });
  const revokeAccess = useRevokeClientParticipant({ request: apiRequest });
  const refresh = useRefreshParticipants(clientId);
  const [pending, setPending] = useState<Pending | null>(null);
  const revoking = revokeInvitation.isPending || revokeAccess.isPending;

  async function resendInvitation(
    invitationId: string,
    resendableAt: string | null,
    target: AccessTarget
  ) {
    onMessage(null);
    try {
      await resend.mutateAsync({ invitationId });
      toast.success(maskPeople`Am retrimis invitația pe ${target.address ?? target.name}.`);
    } catch (cause) {
      const failure = participantFailure(cause, resendableAt ?? undefined);
      onMessage({ variant: failure.saved ? 'warning' : 'destructive', text: failure.message });
    }
    await refresh(target.employeeId);
  }

  async function confirmRevoke() {
    if (!pending) return;
    onMessage(null);
    try {
      if (pending.kind === 'access') {
        await revokeAccess.mutateAsync({ participantId: pending.participantId });
        toast.success(maskPeople`${pending.target.name} nu mai are acces la portal.`);
      } else {
        await revokeInvitation.mutateAsync({ invitationId: pending.invitationId });
        toast.success(
          maskPeople`Invitația pe ${pending.target.address ?? pending.target.name} a fost revocată.`
        );
      }
    } catch (cause) {
      onMessage({ variant: 'destructive', text: participantFailure(cause).message });
    }
    setPending(null);
    await refresh(pending.target.employeeId);
  }

  const dialog: ReactNode = (
    <ConfirmDialog
      open={pending !== null}
      busy={revoking}
      testId={
        pending?.kind === 'invitation'
          ? 'participant-invitation-revoke-dialog'
          : 'participant-revoke-dialog'
      }
      title={pending?.kind === 'invitation' ? 'Revoci invitația?' : 'Revoci accesul la portal?'}
      confirmLabel={pending?.kind === 'invitation' ? 'Revocă invitația' : 'Revocă accesul'}
      pendingLabel="Se revocă…"
      onConfirm={() => void confirmRevoke()}
      onClose={() => setPending(null)}
    >
      {pending?.kind === 'invitation' ? (
        <>
          Persoana nu va mai putea intra în portal cu{' '}
          <Masked className="font-medium text-foreground">
            {pending.target.address ?? pending.target.name}
          </Masked>
          . Poți trimite oricând o nouă invitație.
        </>
      ) : (
        <>
          <Masked className="font-medium text-foreground">{pending?.target.name ?? ''}</Masked> nu
          va mai putea intra în portal. Instruirile, fișele și celelalte date rămân la client, iar
          persoana poate fi invitată din nou oricând.
        </>
      )}
    </ConfirmDialog>
  );

  return {
    resending: resend.isPending ? resend.variables?.invitationId : undefined,
    resend: (invitationId: string, resendableAt: string | null, target: AccessTarget) =>
      void resendInvitation(invitationId, resendableAt, target),
    askRevokeAccess: (participantId: string, target: AccessTarget) =>
      setPending({ kind: 'access', participantId, target }),
    askRevokeInvitation: (invitationId: string, target: AccessTarget) =>
      setPending({ kind: 'invitation', invitationId, target }),
    dialog,
  };
}

export type PortalAccessActions = ReturnType<typeof usePortalAccessActions>;
