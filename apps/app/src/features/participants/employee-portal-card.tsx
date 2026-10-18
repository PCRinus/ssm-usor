import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useRouteContext } from '@tanstack/react-router';
import { Send } from 'lucide-react';
import { useState } from 'react';

import { getGetEmployeeParticipantQueryKey, useGetEmployeeParticipant } from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { Fact, FactList, SectionCard } from '@/components/section-card';
import { AgreementWarning } from '@/features/signatures/agreement-warning';
import { useSigningAgreement } from '@/features/signatures/use-signing-agreement';

import { type InvitedEmployee, InviteEmployeeDialog } from './invite-employee-dialog';
import {
  InvitationStatus,
  type ParticipantMessage,
  ParticipantStatus,
} from './participant-actions';

// `readOnly` is an archived client, which the API refuses invitations and resends for.
export function EmployeePortalCard({
  employee,
  userId,
  readOnly,
}: {
  employee: InvitedEmployee;
  userId: string;
  readOnly: boolean;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const state = useGetEmployeeParticipant(employee.clientId, employee.id, {
    request: apiRequest,
    query: {
      queryKey: [...getGetEmployeeParticipantQueryKey(employee.clientId, employee.id), userId],
    },
  });
  const [inviting, setInviting] = useState(false);
  const [message, setMessage] = useState<ParticipantMessage>(null);
  const participant = state.data?.participant;
  const invitation = state.data?.invitation;
  const uninvited = state.isSuccess && !participant && !invitation;
  const agreement = useSigningAgreement(employee.clientId, employee.id, userId);
  // Only someone who signs in the portal is asked to sign; the warning is for them.
  const warnAgreement = Boolean(participant ?? invitation) && agreement.isSuccess;

  return (
    <SectionCard
      data-testid="employee-portal-card"
      title={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          Acces la portal
          {warnAgreement && <AgreementWarning state={agreement.data?.agreement?.state ?? null} />}
        </span>
      }
      description="În portal angajatul își vede instruirile, fișele și datele. Intră cu un cod primit pe email sau prin SMS, fără parolă."
      action={
        uninvited &&
        !readOnly && (
          <Button
            variant="tonal"
            size="sm"
            data-testid="participant-invite"
            onClick={() => setInviting(true)}
          >
            <Send aria-hidden="true" />
            Invită în portal
          </Button>
        )
      }
    >
      {message && (
        <Notice variant={message.variant} data-testid="employee-portal-message">
          {message.text}
        </Notice>
      )}
      {state.isPending ? (
        <Skeleton className="h-12 w-full" />
      ) : state.isError ? (
        <Notice
          variant="destructive"
          action={
            <Button
              variant="outline"
              disabled={state.isFetching}
              onClick={() => void state.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca accesul la portal.
        </Notice>
      ) : participant ? (
        <ParticipantStatus participant={participant} onMessage={setMessage} />
      ) : invitation ? (
        <InvitationStatus invitation={invitation} readOnly={readOnly} onMessage={setMessage} />
      ) : (
        <div data-testid="participant-none" className="grid gap-4">
          <p className="text-sm text-muted-foreground">Angajatul nu are acces la portal.</p>
          <FactList>
            <Fact label="Email">{employee.email}</Fact>
            <Fact label="Telefon">{employee.phone}</Fact>
          </FactList>
        </div>
      )}
      <InviteEmployeeDialog
        employee={employee}
        open={inviting}
        onClose={() => setInviting(false)}
        onMessage={setMessage}
      />
    </SectionCard>
  );
}
