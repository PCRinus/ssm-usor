import { toast } from '@ssm-usor/ui/lib/toast';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import {
  useResendParticipantInvitation,
  useRevokeClientParticipant,
  useRevokeParticipantInvitation,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { maskPeople } from '@/components/mask-people';
import { Masked } from '@/components/replay';
import { wordingRefusalHere } from '@/features/impersonation/refusal';

import { type ParticipantMessage } from './participant-actions';
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
  const { request } = useApi();
  const resend = useResendParticipantInvitation({ request: wordingRefusalHere(request) });
  const revokeInvitation = useRevokeParticipantInvitation({ request });
  const revokeAccess = useRevokeClientParticipant({ request });
  const refresh = useRefreshParticipants(clientId);
  const [pending, setPending] = useState<Pending | null>(null);

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
      testId={
        pending?.kind === 'invitation' ? 'participant-invitation-revoke' : 'participant-revoke'
      }
      title={pending?.kind === 'invitation' ? 'Revoci invitația?' : 'Revoci accesul la portal?'}
      confirmLabel={pending?.kind === 'invitation' ? 'Revocă invitația' : 'Revocă accesul'}
      pendingLabel="Se revocă…"
      onConfirm={confirmRevoke}
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

  // The table's columns are built from these, so they keep one identity across renders: a new
  // column set remounts the cells, closing an open row menu.
  const latest = useRef(resendInvitation);
  useEffect(() => {
    latest.current = resendInvitation;
  });
  const resending = resend.isPending ? resend.variables?.invitationId : undefined;
  const actions = useMemo(
    () => ({
      resending,
      resend: (invitationId: string, resendableAt: string | null, target: AccessTarget) =>
        void latest.current(invitationId, resendableAt, target),
      askRevokeAccess: (participantId: string, target: AccessTarget) =>
        setPending({ kind: 'access', participantId, target }),
      askRevokeInvitation: (invitationId: string, target: AccessTarget) =>
        setPending({ kind: 'invitation', invitationId, target }),
    }),
    [resending]
  );

  return { actions, dialog };
}

export type PortalAccessActions = ReturnType<typeof usePortalAccessActions>['actions'];
