import { Button } from '@ssm-usor/ui/components/button';
import { Send } from 'lucide-react';
import { useState } from 'react';

import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import type { Client } from '@/features/clients/client-form-schema';

import { InviteAdministratorDialog } from './invite-administrator-dialog';
import {
  type ActiveParticipant,
  InvitationStatus,
  type ParticipantMessage,
  ParticipantStatus,
  type PendingInvitation,
} from './participant-actions';

export function ClientAdministratorCard({
  client,
  userId,
  administrators,
  invitations,
}: {
  client: Client;
  userId: string;
  administrators: ActiveParticipant[];
  invitations: PendingInvitation[];
}) {
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<ParticipantMessage>(null);
  const readOnly = client.archivedAt !== null;
  const none = administrators.length === 0 && invitations.length === 0;

  return (
    <SectionCard
      data-testid="client-administrator-card"
      title="Administratorul clientului"
      description="Persoana care ține evidența SSM la client vede în portal angajații, stadiul instruirilor și fișele lor, și contrasemnează actele adiționale."
      action={
        !readOnly && (
          <Button
            variant="tonal"
            size="sm"
            data-testid="administrator-invite"
            onClick={() => setInviting(true)}
          >
            <Send aria-hidden="true" />
            Invită administratorul
          </Button>
        )
      }
    >
      {message && (
        <Notice variant={message.variant} data-testid="client-administrator-message">
          {message.text}
        </Notice>
      )}
      {none ? (
        <p data-testid="client-administrator-empty" className="text-sm text-muted-foreground">
          Administratorul clientului nu a fost invitat în portal.
        </p>
      ) : (
        <ul className="grid divide-y">
          {administrators.map((participant) => (
            <li
              key={participant.id}
              data-testid="client-administrator-row"
              className="grid gap-2 py-4 first:pt-0 last:pb-0"
            >
              <h3 className="text-sm font-semibold">{participant.fullName}</h3>
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
              data-testid="client-administrator-row"
              className="grid gap-2 py-4 first:pt-0 last:pb-0"
            >
              <h3 className="text-sm font-semibold">{invitation.fullName}</h3>
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
      <InviteAdministratorDialog
        client={client}
        userId={userId}
        open={inviting}
        onClose={() => setInviting(false)}
        onMessage={setMessage}
      />
    </SectionCard>
  );
}
