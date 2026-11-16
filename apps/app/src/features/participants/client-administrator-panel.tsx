import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { Link } from '@tanstack/react-router';
import { MoreHorizontal, Send } from 'lucide-react';
import type { ReactNode } from 'react';

import { replayMask } from '@/app/observability/replay-masking';
import { openedHere } from '@/app/opener';
import { Masked } from '@/components/replay';
import { SectionCard } from '@/components/section-card';
import {
  SummaryList,
  SummaryNote,
  summaryQuiet,
  SummaryRow,
} from '@/features/clients/details/summary-list';

import type { ActiveParticipant, PendingInvitation } from './participant-actions';
import { formatTime } from './participant-format';
import { PortalAccessBadge } from './portal-access';
import {
  accessDateLine,
  type AccessTarget,
  channelLine,
  shownAddress,
} from './portal-access-format';
import type { PortalAccessActions } from './use-portal-access-actions';
import { useTimeReached } from './use-time-reached';

export function ClientAdministratorPanel({
  clientId,
  administrator,
  invitation,
  readOnly,
  actions,
  onInvite,
}: {
  clientId: string;
  administrator: ActiveParticipant | undefined;
  invitation: PendingInvitation | undefined;
  readOnly: boolean;
  actions: PortalAccessActions;
  onInvite: () => void;
}) {
  const person = administrator ?? invitation;
  return (
    <SectionCard
      data-testid="client-administrator-panel"
      className="gap-4"
      title="Administratorul clientului"
      help="portal.administrator"
      action={
        !person &&
        !readOnly && (
          <Button
            variant="secondary"
            size="sm"
            data-testid="administrator-invite"
            onClick={onInvite}
          >
            <Send aria-hidden="true" />
            Invită administratorul
          </Button>
        )
      }
    >
      {person ? (
        <SummaryList>
          <SummaryRow label="Administrator" testId="administrator-name-row">
            <span data-testid="administrator-name" {...replayMask}>
              {person.fullName}
            </span>
            {person.employeeId && (
              <SummaryNote data-testid="administrator-employee">
                și lucrător al firmei:{' '}
                <Link
                  to="/clienti/$clientId/angajati/$employeeId"
                  state={openedHere}
                  params={{ clientId, employeeId: person.employeeId }}
                  className="text-foreground hover:underline"
                  {...replayMask}
                >
                  {person.fullName}
                </Link>
              </SummaryNote>
            )}
          </SummaryRow>
          {administrator ? (
            <ActiveAccessRow administrator={administrator} readOnly={readOnly} actions={actions} />
          ) : (
            invitation && (
              <InvitationRow invitation={invitation} readOnly={readOnly} actions={actions} />
            )
          )}
          <SummaryRow label="Intră cu" testId="administrator-address-row">
            {person.address && person.channel && (
              <>
                <Masked className="block">{shownAddress(person.channel, person.address)}</Masked>
                <SummaryNote>
                  {channelLine({
                    channel: person.channel,
                    language: administrator?.language ?? null,
                  })}
                </SummaryNote>
              </>
            )}
          </SummaryRow>
        </SummaryList>
      ) : (
        <p data-testid="client-administrator-empty" className={`text-sm ${summaryQuiet}`}>
          Administratorul clientului nu a fost invitat în portal.
        </p>
      )}
    </SectionCard>
  );
}

const targetOf = (person: ActiveParticipant | PendingInvitation): AccessTarget => ({
  name: person.fullName,
  address: person.address,
  employeeId: person.employeeId,
});

function AccessLine({ children }: { children: ReactNode }) {
  return <span className="flex flex-wrap items-center gap-x-2 gap-y-1">{children}</span>;
}

function ActiveAccessRow({
  administrator,
  readOnly,
  actions,
}: {
  administrator: ActiveParticipant;
  readOnly: boolean;
  actions: PortalAccessActions;
}) {
  const revoke = () => actions.askRevokeAccess(administrator.id, targetOf(administrator));
  return (
    <SummaryRow
      label="Acces"
      testId="administrator-access-row"
      action={
        readOnly ? (
          <RevokeMenu label="Revocă accesul" onSelect={revoke} />
        ) : (
          <Button
            variant="secondary"
            size="sm"
            data-testid="participant-revoke"
            aria-label="Revocă accesul administratorului"
            onClick={revoke}
          >
            Revocă accesul
          </Button>
        )
      }
    >
      <AccessLine>
        <PortalAccessBadge state="active" />
        <span className="tabular-nums">
          {accessDateLine({
            state: 'active',
            since: administrator.createdAt,
            expiresAt: null,
            revokedAt: null,
          })}
        </span>
      </AccessLine>
    </SummaryRow>
  );
}

function InvitationRow({
  invitation,
  readOnly,
  actions,
}: {
  invitation: PendingInvitation;
  readOnly: boolean;
  actions: PortalAccessActions;
}) {
  const resendable = useTimeReached(invitation.resendableAt);
  const state = invitation.status === 'expired' ? 'expired' : 'invited';
  const revoke = () => actions.askRevokeInvitation(invitation.id, targetOf(invitation));
  const resending = actions.resending === invitation.id;
  return (
    <SummaryRow
      label="Acces"
      testId="administrator-access-row"
      action={
        readOnly ? (
          <RevokeMenu label="Revocă invitația" onSelect={revoke} />
        ) : (
          <span className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              data-testid="participant-invitation-resend"
              aria-label="Retrimite invitația administratorului"
              disabled={!resendable || resending}
              onClick={() =>
                actions.resend(invitation.id, invitation.resendableAt, targetOf(invitation))
              }
            >
              {resending ? 'Se trimite…' : 'Retrimite'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              data-testid="participant-invitation-revoke"
              aria-label="Revocă invitația administratorului"
              onClick={revoke}
            >
              Revocă invitația
            </Button>
          </span>
        )
      }
    >
      <AccessLine>
        <PortalAccessBadge state={state} archived={readOnly} />
        <span className="tabular-nums">
          {accessDateLine({
            state,
            since: invitation.lastSentAt,
            expiresAt: invitation.expiresAt,
            revokedAt: null,
          })}
        </span>
      </AccessLine>
      {!readOnly && !resendable && (
        <SummaryNote data-testid="participant-invitation-hint">
          Poți retrimite după ora {formatTime(invitation.resendableAt)}.
        </SummaryNote>
      )}
    </SummaryRow>
  );
}

export function RevokeMenu({
  label,
  subject = 'administratorului',
  onSelect,
}: {
  label: string;
  subject?: string;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-testid="portal-access-menu"
          aria-label={`Acțiuni pentru accesul ${subject}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem data-testid="portal-access-menu-revoke" onSelect={onSelect}>
          {label}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
