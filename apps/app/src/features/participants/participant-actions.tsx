import { Badge } from '@ssm-usor/ui/components/badge';
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
import { type ReactNode, useState } from 'react';

import {
  type ClientParticipantsResponseParticipantsItem,
  type ParticipantInvitationResponse,
  useResendParticipantInvitation,
  useRevokeClientParticipant,
  useRevokeParticipantInvitation,
} from '@/api/generated/api';

import { participantFailure } from './participant-errors';
import { channelLabels, formatDay, formatTime } from './participant-format';
import { useRefreshParticipants } from './use-refresh-participants';
import { useTimeReached } from './use-time-reached';

export type PendingInvitation = ParticipantInvitationResponse;
export type ActiveParticipant = ClientParticipantsResponseParticipantsItem;

export type ParticipantMessage = { variant: 'destructive' | 'warning'; text: string } | null;

export function InvitationStatus({
  invitation,
  readOnly,
  kindShown = true,
  onMessage,
}: {
  invitation: PendingInvitation;
  readOnly: boolean;
  kindShown?: boolean;
  onMessage: (message: ParticipantMessage) => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const resend = useResendParticipantInvitation({ request: apiRequest });
  const revoke = useRevokeParticipantInvitation({ request: apiRequest });
  const refresh = useRefreshParticipants(invitation.clientId);
  const [confirming, setConfirming] = useState(false);
  const resendable = useTimeReached(invitation.resendableAt);
  const expired = invitation.status === 'expired';
  const busy = resend.isPending || revoke.isPending;
  const channel = channelLabels[invitation.channel];
  const administrator = kindShown && invitation.kind === 'client_administrator';

  async function resendInvitation() {
    onMessage(null);
    try {
      await resend.mutateAsync({ invitationId: invitation.id });
      toast.success(`Am retrimis invitația pe ${invitation.address}.`);
    } catch (cause) {
      const failure = participantFailure(cause, invitation.resendableAt);
      onMessage({ variant: failure.saved ? 'warning' : 'destructive', text: failure.message });
    }
    // Also after a failure: the invitation may have been accepted or revoked meanwhile.
    await refresh(invitation.employeeId);
  }

  async function revokeInvitation() {
    onMessage(null);
    try {
      await revoke.mutateAsync({ invitationId: invitation.id });
      toast.success(`Invitația pe ${invitation.address} a fost revocată.`);
    } catch (cause) {
      onMessage({ variant: 'destructive', text: participantFailure(cause).message });
    }
    setConfirming(false);
    await refresh(invitation.employeeId);
  }

  return (
    <StatusRow
      testId="participant-invitation"
      badges={
        <>
          {expired ? (
            <Badge variant="outline">Invitație expirată</Badge>
          ) : (
            <Badge variant="secondary">Invitat</Badge>
          )}
          {administrator && <AdministratorBadge />}
        </>
      }
      text={
        expired ? (
          <>
            Invitația trimisă pe <Address>{invitation.address}</Address> prin {channel} la{' '}
            {formatDay(invitation.lastSentAt)} a expirat pe {formatDay(invitation.expiresAt)}.
          </>
        ) : (
          <>
            Invitat pe <Address>{invitation.address}</Address> prin {channel} la{' '}
            {formatDay(invitation.lastSentAt)}. Invitația expiră pe{' '}
            {formatDay(invitation.expiresAt)}.
          </>
        )
      }
      hint={
        !readOnly && !resendable
          ? `Poți retrimite după ora ${formatTime(invitation.resendableAt)}.`
          : undefined
      }
      actions={
        <>
          {!readOnly && (
            <Button
              variant="outline"
              size="sm"
              data-testid="participant-invitation-resend"
              disabled={busy || !resendable}
              onClick={() => void resendInvitation()}
            >
              {resend.isPending ? 'Se trimite…' : 'Retrimite'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            data-testid="participant-invitation-revoke"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            Revocă
          </Button>
          <ConfirmDialog
            open={confirming}
            busy={revoke.isPending}
            testId="participant-invitation-revoke-dialog"
            title="Revoci invitația?"
            confirmLabel="Revocă invitația"
            pendingLabel="Se revocă…"
            onConfirm={() => void revokeInvitation()}
            onClose={() => setConfirming(false)}
          >
            Persoana nu va mai putea intra în portal cu{' '}
            <span className="font-medium text-foreground">{invitation.address}</span>. Poți trimite
            oricând o nouă invitație.
          </ConfirmDialog>
        </>
      }
    />
  );
}

export function ParticipantStatus({
  participant,
  kindShown = true,
  onMessage,
}: {
  participant: ActiveParticipant;
  kindShown?: boolean;
  onMessage: (message: ParticipantMessage) => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const revoke = useRevokeClientParticipant({ request: apiRequest });
  const refresh = useRefreshParticipants(participant.clientId);
  const [confirming, setConfirming] = useState(false);
  const administrator = kindShown && participant.kind === 'client_administrator';

  async function revokeAccess() {
    onMessage(null);
    try {
      await revoke.mutateAsync({ participantId: participant.id });
      toast.success(`${participant.fullName} nu mai are acces la portal.`);
    } catch (cause) {
      onMessage({ variant: 'destructive', text: participantFailure(cause).message });
    }
    setConfirming(false);
    await refresh(participant.employeeId);
  }

  return (
    <StatusRow
      testId="participant-active"
      badges={
        <>
          <Badge>Are acces</Badge>
          {administrator && <AdministratorBadge />}
        </>
      }
      text={
        <>
          Are acces la portal
          {participant.address && (
            <>
              {' '}
              cu <Address>{participant.address}</Address>
            </>
          )}{' '}
          din {formatDay(participant.createdAt)}.
        </>
      }
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            data-testid="participant-revoke"
            disabled={revoke.isPending}
            onClick={() => setConfirming(true)}
          >
            Revocă accesul
          </Button>
          <ConfirmDialog
            open={confirming}
            busy={revoke.isPending}
            testId="participant-revoke-dialog"
            title="Revoci accesul la portal?"
            confirmLabel="Revocă accesul"
            pendingLabel="Se revocă…"
            onConfirm={() => void revokeAccess()}
            onClose={() => setConfirming(false)}
          >
            <span className="font-medium text-foreground">{participant.fullName}</span> nu va mai
            putea intra în portal. Instruirile, fișele și celelalte date rămân la client, iar
            persoana poate fi invitată din nou oricând.
          </ConfirmDialog>
        </>
      }
    />
  );
}

function AdministratorBadge() {
  return <Badge variant="outline">Administratorul clientului</Badge>;
}

function Address({ children }: { children: string }) {
  return <span className="font-medium break-all">{children}</span>;
}

function StatusRow({
  testId,
  badges,
  text,
  hint,
  actions,
}: {
  testId: string;
  badges: ReactNode;
  text: ReactNode;
  hint?: string;
  actions: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3"
    >
      <div className="grid min-w-0 flex-1 basis-72 gap-1.5 text-sm">
        <div className="flex flex-wrap gap-2">{badges}</div>
        <p data-testid={`${testId}-text`}>{text}</p>
        {hint && (
          <p data-testid={`${testId}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

function ConfirmDialog({
  open,
  busy,
  testId,
  title,
  confirmLabel,
  pendingLabel,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  busy: boolean;
  testId: string;
  title: string;
  confirmLabel: string;
  pendingLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && !next && onClose()}>
      <DialogContent data-testid={testId} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{children}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button
            variant="destructive"
            data-testid={`${testId}-confirm`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
