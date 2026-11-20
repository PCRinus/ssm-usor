import type { ParticipantChannel, PortalLanguage } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Notice } from '@ssm-usor/ui/components/notice';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useIsPhone } from '@ssm-usor/ui/hooks/use-mobile';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { Plus, Send, TriangleAlert } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { openedFromRecord } from '@/app/opener';
import { LoadFailed } from '@/components/load-failed';
import { Masked } from '@/components/replay';
import { SectionCard } from '@/components/section-card';
import {
  SummaryEmpty,
  SummaryList,
  SummaryNote,
  SummaryRow,
} from '@/features/clients/details/summary-list';

import { accessLead, useEmployeeParticipant } from './employee-access';
import { type InvitedEmployee, InviteEmployeeDialog } from './invite-employee-dialog';
import type {
  ActiveParticipant,
  ParticipantMessage,
  PendingInvitation,
} from './participant-actions';
import { formatTime, languageLabels } from './participant-format';
import { PortalAccessBadge } from './portal-access';
import { accessDateLine, type AccessTarget, shownAddress } from './portal-access-format';
import { type PortalAccessActions, usePortalAccessActions } from './use-portal-access-actions';
import { useTimeReached } from './use-time-reached';

const channelNames: Record<ParticipantChannel, string> = { email: 'Email', sms: 'SMS' };

const proposedAddress = (employee: InvitedEmployee) =>
  employee.email
    ? { channel: 'email' as const, address: employee.email }
    : employee.phone
      ? { channel: 'sms' as const, address: employee.phone }
      : null;

const values = '[&_dd>div:first-child]:font-medium';

const stacked = 'grid gap-2 pt-3 [&>*]:w-full';

// `readOnly` is an archived client, which the API refuses invitations and resends for; a
// `former` worker is no longer invited, and keeps only the access they still have.
export function EmployeePortalCard({
  employee,
  readOnly,
  former,
}: {
  employee: InvitedEmployee;
  readOnly: boolean;
  former: boolean;
}) {
  const state = useEmployeeParticipant(employee.clientId, employee.id);
  const phone = useIsPhone();
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<ParticipantMessage>(null);
  const { actions, dialog } = usePortalAccessActions(employee.clientId, setMessage);
  const participant = state.data?.participant ?? null;
  const invitation = state.data?.invitation ?? null;
  const lead = state.data ? accessLead(state.data, employee, readOnly || former) : null;

  const invite = lead === 'invite' && (
    <Button
      size="sm"
      className="max-sm:w-full"
      data-testid="participant-invite"
      onClick={() => setInviting(true)}
    >
      <Send aria-hidden="true" />
      Invită în portal
    </Button>
  );

  return (
    <SectionCard
      data-testid="employee-portal-card"
      className="gap-4"
      title="Acces la portal"
      help="angajati.portal"
      action={!phone && invite}
    >
      {message && (
        <Notice variant={message.variant} data-testid="employee-portal-message">
          {message.text}
        </Notice>
      )}
      {state.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : state.isError ? (
        <LoadFailed
          error={state.error}
          busy={state.isFetching}
          onRetry={() => void state.refetch()}
        >
          Nu am putut încărca accesul la portal.
        </LoadFailed>
      ) : (
        <SummaryList className={values}>
          {participant ? (
            <ActiveRow participant={participant} actions={actions} phone={phone} />
          ) : invitation ? (
            <InvitationRow
              invitation={invitation}
              readOnly={readOnly}
              former={former}
              actions={actions}
              phone={phone}
            />
          ) : (
            <SummaryRow label="Acces" testId="participant-none">
              <PortalAccessBadge state="none" />
            </SummaryRow>
          )}
          <CodeRow
            employee={employee}
            participant={participant}
            invitation={invitation}
            readOnly={readOnly || former}
            phone={phone}
          />
        </SummaryList>
      )}
      {phone && invite}
      {dialog}
      <InviteEmployeeDialog
        employee={employee}
        open={inviting}
        onClose={() => setInviting(false)}
        onMessage={setMessage}
      />
    </SectionCard>
  );
}

const targetOf = (person: ActiveParticipant | PendingInvitation): AccessTarget => ({
  name: person.fullName,
  address: person.address,
  employeeId: person.employeeId,
});

// The worker may also be the client's administrator, whose access this is as well.
function AccessLine({
  person,
  children,
}: {
  person: ActiveParticipant | PendingInvitation;
  children: ReactNode;
}) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {children}
      {person.kind === 'client_administrator' && (
        <Badge variant="outline" data-testid="participant-administrator">
          Administratorul clientului
        </Badge>
      )}
    </span>
  );
}

function RowWithActions({
  label,
  testId,
  actions,
  phone,
  children,
}: {
  label: string;
  testId: string;
  actions: ReactNode;
  phone: boolean;
  children: ReactNode;
}) {
  return (
    <SummaryRow label={label} testId={testId} action={!phone && actions}>
      {children}
      {phone && actions}
    </SummaryRow>
  );
}

function ActiveRow({
  participant,
  actions,
  phone,
}: {
  participant: ActiveParticipant;
  actions: PortalAccessActions;
  phone: boolean;
}) {
  return (
    <RowWithActions
      label="Acces"
      testId="participant-active"
      phone={phone}
      actions={
        <div className={cn(phone && stacked)}>
          <Button
            variant="secondary"
            size="sm"
            data-testid="participant-revoke"
            onClick={() => actions.askRevokeAccess(participant.id, targetOf(participant))}
          >
            Revocă accesul
          </Button>
        </div>
      }
    >
      <AccessLine person={participant}>
        <PortalAccessBadge state="active" />
        <span data-testid="participant-active-text" className="tabular-nums">
          {accessDateLine({
            state: 'active',
            since: participant.createdAt,
            expiresAt: null,
            revokedAt: null,
          })}
        </span>
      </AccessLine>
    </RowWithActions>
  );
}

function InvitationRow({
  invitation,
  readOnly,
  former,
  actions,
  phone,
}: {
  invitation: PendingInvitation;
  readOnly: boolean;
  former: boolean;
  actions: PortalAccessActions;
  phone: boolean;
}) {
  const resendable = useTimeReached(invitation.resendableAt);
  const state = invitation.status === 'expired' ? 'expired' : 'invited';
  const resending = actions.resending === invitation.id;
  const resends = !readOnly && !former;
  const revokes = !(former && state === 'expired');
  const hint = resends && !resendable && (
    <SummaryNote
      data-testid="participant-invitation-hint"
      className={cn('font-normal', !phone && 'text-right')}
    >
      Poți retrimite după ora {formatTime(invitation.resendableAt)}.
    </SummaryNote>
  );
  return (
    <RowWithActions
      label="Acces"
      testId="participant-invitation"
      phone={phone}
      actions={
        (resends || revokes) && (
          <div className={cn('grid justify-items-end gap-1', phone && 'justify-items-stretch')}>
            <div className={cn('flex flex-wrap justify-end gap-2', phone && stacked)}>
              {resends && (
                <Button
                  variant={state === 'expired' ? 'default' : 'secondary'}
                  size="sm"
                  data-testid="participant-invitation-resend"
                  disabled={!resendable || resending}
                  onClick={() =>
                    actions.resend(invitation.id, invitation.resendableAt, targetOf(invitation))
                  }
                >
                  {resending ? 'Se trimite…' : 'Retrimite'}
                </Button>
              )}
              {revokes && (
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="participant-invitation-revoke"
                  onClick={() => actions.askRevokeInvitation(invitation.id, targetOf(invitation))}
                >
                  Revocă invitația
                </Button>
              )}
            </div>
            {hint}
          </div>
        )
      }
    >
      <AccessLine person={invitation}>
        <PortalAccessBadge state={state} archived={readOnly} />
        <span data-testid="participant-invitation-text" className="tabular-nums">
          {accessDateLine({
            state,
            since: invitation.lastSentAt,
            expiresAt: invitation.expiresAt,
            revokedAt: null,
          })}
        </span>
      </AccessLine>
    </RowWithActions>
  );
}

function Code({ channel, address }: { channel: ParticipantChannel; address: string }) {
  return (
    <span className="block" data-testid="participant-code">
      {channelNames[channel]} ·{' '}
      <Masked className="break-all">{shownAddress(channel, address)}</Masked>
    </span>
  );
}

function CodeRow({
  employee,
  participant,
  invitation,
  readOnly,
  phone,
}: {
  employee: InvitedEmployee;
  participant: ActiveParticipant | null;
  invitation: PendingInvitation | null;
  readOnly: boolean;
  phone: boolean;
}) {
  const person = participant ?? invitation;
  if (person) {
    const language: PortalLanguage | null = participant?.language ?? null;
    return (
      <SummaryRow label="Primește codul" testId="participant-code-row">
        {person.channel && person.address && (
          <>
            <Code channel={person.channel} address={person.address} />
            {language && (
              <SummaryNote className="font-normal" data-testid="participant-language">
                portal în {languageLabels[language]}
              </SummaryNote>
            )}
          </>
        )}
      </SummaryRow>
    );
  }
  const proposed = proposedAddress(employee);
  if (proposed) {
    return (
      <SummaryRow label="Primește codul" testId="participant-code-row">
        <Code {...proposed} />
      </SummaryRow>
    );
  }
  if (readOnly) {
    return (
      <SummaryRow label="Primește codul" testId="participant-code-row">
        <SummaryEmpty />
      </SummaryRow>
    );
  }
  return (
    <RowWithActions
      label="Primește codul"
      testId="participant-code-row"
      phone={phone}
      actions={
        <div className={cn(phone && stacked)}>
          <Button asChild size="sm" data-testid="participant-add-contact">
            <Link
              to="/clienti/$clientId/angajati/$employeeId/editare"
              params={{ clientId: employee.clientId, employeeId: employee.id }}
              search={{ focus: 'contact' }}
              state={openedFromRecord(`/clienti/${employee.clientId}/angajati/${employee.id}`)}
            >
              <Plus aria-hidden="true" />
              Adaugă emailul sau telefonul
            </Link>
          </Button>
        </div>
      }
    >
      <span
        data-testid="participant-no-contact"
        className="inline-flex items-start gap-1.5 text-warning-foreground"
      >
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Fără email sau telefon
      </span>
    </RowWithActions>
  );
}
