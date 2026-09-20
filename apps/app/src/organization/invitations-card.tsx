import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ssm-usor/ui/components/table';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import {
  type ApiErrorResponse,
  getListInvitationsQueryKey,
  type InvitationResponse,
  useListInvitations,
  useResendInvitation,
  useRevokeInvitation,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { Notice } from '../components/notice';
import { formatDay, roleLabels } from './labels';

function actionMessage(cause: unknown, email: string) {
  if (cause instanceof ApiHttpError) {
    const body = cause.body as Partial<ApiErrorResponse> | undefined;
    if (body?.reason === 'sent_recently') {
      return `Am trimis deja o invitație la ${email} în ultimele 10 minute. Încearcă mai târziu.`;
    }
    if (cause.status === 404) return `Invitația pentru ${email} nu mai este în așteptare.`;
    if (cause.status === 503) {
      return 'Invitația nu a putut fi trimisă pe email. Încearcă din nou în câteva momente.';
    }
  }
  return 'Acțiunea nu a reușit. Verifică conexiunea și încearcă din nou.';
}

export function InvitationsCard({ userId }: { userId: string }) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const queryKey = [...getListInvitationsQueryKey(), userId];
  const invitations = useListInvitations({ request: apiRequest, query: { queryKey } });
  const resend = useResendInvitation({ request: apiRequest });
  const revoke = useRevokeInvitation({ request: apiRequest });
  const [error, setError] = useState<string | null>(null);
  const busy = resend.isPending || revoke.isPending;

  async function run(invitation: InvitationResponse, action: 'resend' | 'revoke') {
    setError(null);
    try {
      if (action === 'resend') {
        await resend.mutateAsync({ invitationId: invitation.id });
        toast.success(`Am retrimis invitația la ${invitation.email}.`);
      } else {
        await revoke.mutateAsync({ invitationId: invitation.id });
        toast.success(`Invitația pentru ${invitation.email} a fost revocată.`);
      }
    } catch (cause) {
      setError(actionMessage(cause, invitation.email));
    }
    // Also after a failure: a 404 means the list on screen is out of date.
    await queryClient.invalidateQueries({ queryKey: getListInvitationsQueryKey() });
  }

  return (
    <Card data-testid="invitations-card">
      <CardHeader>
        <h2 className="text-lg font-semibold">Invitații în așteptare</h2>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <Notice variant="destructive" data-testid="invitations-error">
            {error}
          </Notice>
        )}
        {invitations.isError ? (
          <Notice
            variant="destructive"
            action={
              <Button
                variant="outline"
                disabled={invitations.isFetching}
                onClick={() => void invitations.refetch()}
              >
                Încearcă din nou
              </Button>
            }
          >
            Nu am putut încărca invitațiile.
          </Notice>
        ) : invitations.isPending ? (
          <>
            <Skeleton className="h-5 w-full" />
            <span className="sr-only" role="status">
              Se încarcă invitațiile…
            </span>
          </>
        ) : invitations.data.items.length === 0 ? (
          <p data-testid="invitations-empty" className="text-sm text-muted-foreground">
            Nicio invitație în așteptare. Cele acceptate apar direct în lista de membri.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Stare</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Acțiuni</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.data.items.map((invitation) => (
                <TableRow key={invitation.id} data-testid="invitation-row">
                  <TableCell className="font-medium break-all">{invitation.email}</TableCell>
                  <TableCell>{roleLabels[invitation.role]}</TableCell>
                  <TableCell>
                    {invitation.status === 'expired' ? (
                      <Badge variant="outline">Expirată</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Expiră pe {formatDay(invitation.expiresAt)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid="invitation-resend"
                      disabled={busy}
                      onClick={() => void run(invitation, 'resend')}
                    >
                      Retrimite
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid="invitation-revoke"
                      disabled={busy}
                      onClick={() => void run(invitation, 'revoke')}
                    >
                      Revocă
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
