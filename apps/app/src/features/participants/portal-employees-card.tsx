import { Button } from '@ssm-usor/ui/components/button';
import { Link } from '@tanstack/react-router';
import { Send } from 'lucide-react';
import { useState } from 'react';

import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import type { Client } from '@/features/clients/client-form-schema';

import { type InvitedEmployee, InviteEmployeeDialog } from './invite-employee-dialog';
import { InviteEmployeePicker } from './invite-employee-picker';
import {
  type ActiveParticipant,
  InvitationStatus,
  type ParticipantMessage,
  ParticipantStatus,
  type PendingInvitation,
} from './participant-actions';

function EmployeeName({
  clientId,
  employeeId,
  name,
}: {
  clientId: string;
  employeeId: string | null;
  name: string;
}) {
  if (!employeeId) return <h3 className="text-sm font-semibold">{name}</h3>;
  return (
    <h3 className="text-sm font-semibold">
      <Link
        to="/clients/$clientId/employees/$employeeId"
        params={{ clientId, employeeId }}
        className="hover:underline"
      >
        {name}
      </Link>
    </h3>
  );
}

export function PortalEmployeesCard({
  client,
  userId,
  participants,
  invitations,
}: {
  client: Client;
  userId: string;
  participants: ActiveParticipant[];
  invitations: PendingInvitation[];
}) {
  const [picking, setPicking] = useState(false);
  const [inviting, setInviting] = useState<InvitedEmployee | null>(null);
  const [message, setMessage] = useState<ParticipantMessage>(null);
  const readOnly = client.archivedAt !== null;
  const none = participants.length === 0 && invitations.length === 0;

  return (
    <SectionCard
      data-testid="portal-employees-card"
      title="Angajații în portal"
      description="Fiecare angajat își vede în portal instruirile, fișele și datele, și își semnează rândurile din fișă. Intră cu un cod primit pe email sau prin SMS, fără parolă."
      action={
        !readOnly && (
          <Button
            variant="tonal"
            size="sm"
            data-testid="portal-employee-invite"
            onClick={() => setPicking(true)}
          >
            <Send aria-hidden="true" />
            Invită un angajat
          </Button>
        )
      }
    >
      {message && (
        <Notice variant={message.variant} data-testid="portal-employees-message">
          {message.text}
        </Notice>
      )}
      {none ? (
        <p data-testid="portal-employees-empty" className="text-sm text-muted-foreground">
          Niciun angajat nu a fost invitat încă în portal.
        </p>
      ) : (
        <ul className="grid divide-y">
          {participants.map((participant) => (
            <li
              key={participant.id}
              data-testid="portal-employee-row"
              className="grid gap-2 py-4 first:pt-0 last:pb-0"
            >
              <EmployeeName
                clientId={client.id}
                employeeId={participant.employeeId}
                name={participant.fullName}
              />
              <ParticipantStatus
                participant={participant}
                kindShown={false}
                onMessage={setMessage}
              />
            </li>
          ))}
          {invitations.map((invitation) => (
            <li
              key={invitation.id}
              data-testid="portal-employee-row"
              className="grid gap-2 py-4 first:pt-0 last:pb-0"
            >
              <EmployeeName
                clientId={client.id}
                employeeId={invitation.employeeId}
                name={invitation.fullName}
              />
              <InvitationStatus
                invitation={invitation}
                readOnly={readOnly}
                kindShown={false}
                onMessage={setMessage}
              />
            </li>
          ))}
        </ul>
      )}
      <InviteEmployeePicker
        clientId={client.id}
        userId={userId}
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(employee) => {
          setPicking(false);
          setInviting(employee);
        }}
      />
      {inviting && (
        <InviteEmployeeDialog
          employee={inviting}
          open
          onClose={() => setInviting(null)}
          onMessage={setMessage}
        />
      )}
    </SectionCard>
  );
}
